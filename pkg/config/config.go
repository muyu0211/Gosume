package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// Config holds user configuration.
type Config struct {
	DataDir       string              `json:"data_dir"`
	LayoutPresets *LayoutPresetConfig `json:"layout_presets,omitempty"`
}

// Manager manages persisted user configuration with change callbacks.
type Manager struct {
	mu         sync.RWMutex
	config     Config
	configPath string
	defaultDir string
	listeners  map[int]func(oldDir, newDir string)
	nextID     int
}

// NewManager creates a Manager. configPath is the JSON config file location.
// The default data directory is a "data" subdirectory under the config's parent,
// keeping config.json separate from user data.
func NewManager(configPath string) (*Manager, error) {
	m := &Manager{
		configPath: configPath,
		defaultDir: filepath.Join(filepath.Dir(configPath), "data"),
		listeners:  make(map[int]func(oldDir, newDir string)),
	}
	if err := m.load(); err != nil {
		return nil, err
	}
	return m, nil
}

// DataDir returns the current effective data directory.
func (m *Manager) DataDir() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.config.DataDir != "" {
		return m.config.DataDir
	}
	return m.defaultDir
}

// DefaultDir returns the immutable default directory.
func (m *Manager) DefaultDir() string {
	return m.defaultDir
}

// SetDataDir persists the new data directory and fires OnChange listeners.
func (m *Manager) SetDataDir(dir string) error {
	m.mu.Lock()
	oldDir := m.effectiveDir()
	if dir == oldDir {
		m.mu.Unlock()
		return nil
	}

	m.config.DataDir = dir
	if err := m.saveLocked(); err != nil {
		m.config.DataDir = oldDir // rollback
		m.mu.Unlock()
		return fmt.Errorf("save config: %w", err)
	}

	// Snapshot listeners before releasing lock to avoid races.
	callbacks := make([]func(oldDir, newDir string), 0, len(m.listeners))
	for _, fn := range m.listeners {
		callbacks = append(callbacks, fn)
	}
	m.mu.Unlock()

	for _, fn := range callbacks {
		fn(oldDir, dir)
	}
	return nil
}

// OnChange registers a callback invoked when the data directory changes.
func (m *Manager) OnChange(fn func(oldDir, newDir string)) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	id := m.nextID
	m.nextID++
	m.listeners[id] = fn
	return id
}

// RemoveOnChange removes a previously registered callback.
func (m *Manager) RemoveOnChange(id int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.listeners, id)
}

// GetLayoutPresets returns the effective layout preset configuration,
// falling back to built-in defaults when nothing has been customized.
func (m *Manager) GetLayoutPresets() LayoutPresetConfig {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.config.LayoutPresets != nil {
		return *m.config.LayoutPresets
	}
	return DefaultLayoutPresets()
}

// SetLayoutPresets validates and persists a layout preset configuration.
func (m *Manager) SetLayoutPresets(cfg LayoutPresetConfig) error {
	if err := ValidateLayoutPresets(cfg); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.config.LayoutPresets = &cfg
	if err := m.saveLocked(); err != nil {
		m.config.LayoutPresets = nil // rollback to previous persisted state on next load
		return fmt.Errorf("save config: %w", err)
	}
	return nil
}

// ResetLayoutPresets removes any customization, restoring built-in defaults.
func (m *Manager) ResetLayoutPresets() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.config.LayoutPresets == nil {
		return nil
	}
	m.config.LayoutPresets = nil
	if err := m.saveLocked(); err != nil {
		return fmt.Errorf("save config: %w", err)
	}
	return nil
}

func (m *Manager) effectiveDir() string {
	if m.config.DataDir != "" {
		return m.config.DataDir
	}
	return m.defaultDir
}

func (m *Manager) load() error {
	data, err := os.ReadFile(m.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read config: %w", err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return fmt.Errorf("parse config: %w", err)
	}
	m.config = cfg
	return nil
}

func (m *Manager) saveLocked() error {
	dir := filepath.Dir(m.configPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(m.config, "", "  ")
	if err != nil {
		return err
	}

	tmpPath := m.configPath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmpPath, m.configPath)
}
