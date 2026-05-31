package store

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"gosume/pkg/model"
)

// ProjectStore handles reading and writing .resume.json project files.
type ProjectStore struct {
	dataDir string
}

// NewProjectStore creates a new project store.
func NewProjectStore(dataDir string) *ProjectStore {
	return &ProjectStore{dataDir: dataDir}
}

// SetDataDir updates the data directory used for autosave and recent files.
func (s *ProjectStore) SetDataDir(dir string) {
	s.dataDir = dir
}

// Load reads a .resume.json file and returns the parsed Resume.
func (s *ProjectStore) Load(filePath string) (*model.Resume, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("read file: %w", err)
	}

	resume, err := model.Migrate(data)
	if err != nil {
		return nil, fmt.Errorf("migrate data: %w", err)
	}

	s.addRecentFile(filePath, resume)
	return resume, nil
}

// Save writes a Resume to a .resume.json file atomically.
func (s *ProjectStore) Save(filePath string, resume *model.Resume) error {
	resume.Meta.UpdatedAt = time.Now()

	data, err := json.MarshalIndent(resume, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	tmpPath := filePath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, filePath); err != nil {
		return err
	}

	s.addRecentFile(filePath, resume)
	return nil
}

// SaveAutoSave saves to the autosave directory.
func (s *ProjectStore) SaveAutoSave(resume *model.Resume) error {
	autosaveDir := filepath.Join(s.dataDir, "autosave")
	os.MkdirAll(autosaveDir, 0755)

	path := filepath.Join(autosaveDir, "autosave.resume.json")
	return s.Save(path, resume)
}

// LoadAutoSave attempts to load the autosave file.
func (s *ProjectStore) LoadAutoSave() (*model.Resume, error) {
	path := filepath.Join(s.dataDir, "autosave", "autosave.resume.json")
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil, nil
	}
	return s.Load(path)
}

// RecentFile is an entry in the recent files list.
type RecentFile struct {
	Path      string    `json:"path"`
	Name      string    `json:"name"`
	UpdatedAt time.Time `json:"updated_at"`
}

// GetRecentFiles returns the list of recently opened files.
func (s *ProjectStore) GetRecentFiles() ([]RecentFile, error) {
	recentPath := filepath.Join(s.dataDir, "recent.json")
	data, err := os.ReadFile(recentPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []RecentFile{}, nil
		}
		return nil, err
	}

	var files []RecentFile
	json.Unmarshal(data, &files)
	return files, nil
}

func (s *ProjectStore) addRecentFile(path string, resume *model.Resume) {
	recentPath := filepath.Join(s.dataDir, "recent.json")

	files, _ := s.GetRecentFiles()

	// Remove existing entry for the same path
	for i, f := range files {
		if f.Path == path {
			files = append(files[:i], files[i+1:]...)
			break
		}
	}

	// Prepend new entry
	name := resume.Personal.FullName
	if name == "" {
		name = filepath.Base(path)
	}
	files = append([]RecentFile{{
		Path:      path,
		Name:      name,
		UpdatedAt: time.Now(),
	}}, files...)

	// Trim to 20 entries
	if len(files) > 20 {
		files = files[:20]
	}

	data, _ := json.MarshalIndent(files, "", "  ")
	os.WriteFile(recentPath, data, 0644)
}
