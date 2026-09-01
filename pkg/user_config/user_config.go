package user_config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// Manager 管理持久化的用户配置，并在数据目录变更时通知监听者。
//
// 完整配置存放在数据目录内部（dataDir/config.json），因此切换数据目录时配置
// 随数据一起迁移；锚点目录（anchorDir：便携模式为可执行文件所在目录，否则为
// 系统配置目录）只保留轻量指针，用于下次启动时定位数据目录。
type Manager struct {
	mu        sync.RWMutex
	config    UserConfig
	anchorDir string
	dataDir   string
	listeners map[int]ChangeFunc
	nextID    int
}

// configFileName 是配置文件名。它出现在两个位置，语义不同：
//   - 数据目录内：完整配置（布局档位等），随数据目录一起迁移
//   - 锚点目录内：仅含 data_dir 的定位指针，供下次启动找到数据目录
const configFileName = "config.json"

// ChangeFunc 是数据目录变更回调。
type ChangeFunc = func(oldDir, newDir string)

// Theme 相关的合法取值集合。
const (
	// 默认主题：跟随系统深浅（预置主题枚举在此基础上 add classic/wheat/obsidian）。
	DefaultTheme = "system"
)

// IsValidTheme 校验主题取值是否合法（system/classic/wheat/obsidian）。
func IsValidTheme(theme string) bool {
	switch theme {
	case "system", "classic", "wheat", "obsidian":
		return true
	default:
		return false
	}
}

// UserConfig 用户配置。
// 数据目录内的完整配置，以及锚点目录内的定位指针
// （此时仅 DataDir 有值）。旧版把两者合并存放在锚点目录，字段因此保持兼容。
type UserConfig struct {
	DataDir string        `json:"data_dir,omitempty"`
	Theme   string        `json:"theme,omitempty"`
	Layout  *GlobalLayout `json:"layout,omitempty"`
}

// InitConfigManager 初始化配置管理器
func InitConfigManager(configPath string) *Manager {
	// // 创建配置根目录
	// configRoot := service.GetConfigRoot()
	os.MkdirAll(configPath, 0755)

	// 初始化配置管理器
	configMgr, err := NewManager(configPath)
	if err != nil {
		panic(fmt.Sprintf("Failed to init config manager: %v", err))
	}

	// 迁移历史数据
	defaultDataDir := configMgr.DefaultDir()

	if _, err := os.Stat(filepath.Join(defaultDataDir, "gosume.db")); os.IsNotExist(err) {
		if _, err := os.Stat(filepath.Join(configPath, "gosume.db")); err == nil {
			fmt.Printf("[main] migrating data from %s to %s\n", configPath, defaultDataDir)
			os.MkdirAll(defaultDataDir, 0755)
			for _, name := range []string{"gosume.db", "gosume.db-wal", "gosume.db-shm", "recent.json"} {
				os.Rename(filepath.Join(configPath, name), filepath.Join(defaultDataDir, name))
			}
			for _, sub := range []string{"autosave", "templates", "log"} {
				os.Rename(filepath.Join(configPath, sub), filepath.Join(defaultDataDir, sub))
			}
		}
	}

	return configMgr
}

// NewManager 以 anchorDir 为锚点目录创建 Manager，并完成配置定位与加载。
func NewManager(anchorDir string) (*Manager, error) {
	m := &Manager{
		anchorDir: anchorDir,
		listeners: make(map[int]ChangeFunc),
	}
	if err := m.init(); err != nil {
		return nil, err
	}
	return m, nil
}

// init 定位数据目录（锚点指针 → 默认目录）、加载配置。
func (m *Manager) init() error {
	m.dataDir = m.DefaultDir()

	// 锚点文件既可能是新版指针，也可能是旧版完整配置，故只解析一次，同时用于
	// 定位数据目录；读取或解析失败按"无锚点"处理（回退默认目录）。
	var anchor UserConfig
	hasAnchor := false
	if raw, err := os.ReadFile(configFile(m.anchorDir)); err == nil {
		hasAnchor = json.Unmarshal(raw, &anchor) == nil
	}
	if hasAnchor && anchor.DataDir != "" && isDir(anchor.DataDir) {
		m.dataDir = anchor.DataDir
	}

	// 数据目录内的配置是权威来源，解析失败视为错误，避免静默丢配置。
	if _, err := m.loadLocked(); err != nil {
		return err
	}

	return m.persistLocked()
}

// DataDir 返回当前生效的数据目录。
func (m *Manager) DataDir() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.dataDir
}

// DefaultDir 返回固定的默认数据目录（锚点目录下的 data 子目录）。
func (m *Manager) DefaultDir() string {
	return filepath.Join(m.anchorDir, "data")
}

// SetDataDir 持久化新的数据目录（把 config.json 迁入其中并更新锚点指针），
// 随后触发 OnChange 监听回调。
func (m *Manager) SetDataDir(dir string) error {
	oldDir, callbacks, err := m.commitDataDir(dir)
	if err != nil {
		return fmt.Errorf("save config: %w", err)
	}
	// 回调必须在释放锁后触发：监听方可能在回调中反向调用 SetDataDir 回滚。
	for _, fn := range callbacks {
		fn(oldDir, dir)
	}
	return nil
}

// commitDataDir 在持锁状态下切换并落盘数据目录，返回旧目录与监听者快照。
// 目录未变化或落盘失败时快照为空，调用方无需额外判断。
func (m *Manager) commitDataDir(dir string) (string, []ChangeFunc, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	oldDir := m.dataDir
	if dir == oldDir {
		return oldDir, nil, nil
	}

	m.dataDir = dir
	if err := m.persistLocked(); err != nil {
		m.dataDir = oldDir
		return oldDir, nil, err
	}
	// 移除旧数据目录中的 config.json，便于旧目录整体清理。
	_ = os.Remove(configFile(oldDir))

	callbacks := make([]ChangeFunc, 0, len(m.listeners))
	for _, fn := range m.listeners {
		callbacks = append(callbacks, fn)
	}
	return oldDir, callbacks, nil
}

// OnChange 注册数据目录变更回调，返回可用于注销的监听 ID。
func (m *Manager) OnChange(fn ChangeFunc) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	id := m.nextID
	m.nextID++
	m.listeners[id] = fn
	return id
}

// RemoveOnChange 按 ID 注销此前注册的回调。
func (m *Manager) RemoveOnChange(id int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.listeners, id)
}

// GetTheme 返回当前的用户主题选项；用户未设置（或取值为空）时回退到默认主题。
func (m *Manager) GetTheme() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.config.Theme != "" && IsValidTheme(m.config.Theme) {
		return m.config.Theme
	}
	return DefaultTheme
}

// SetTheme 持久化用户主题选项（取值合法性校验在服务层完成）。
// 落盘失败时把内存中的主题置空，使下次启动重新从文件加载已持久化的状态。
func (m *Manager) SetTheme(theme string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.config.Theme = theme
	if err := m.saveConfigLocked(); err != nil {
		m.config.Theme = ""
		return fmt.Errorf("save config: %w", err)
	}
	return nil
}

// GetLayout 返回当前的全局布局；用户未设置时回退到默认值。
func (m *Manager) GetLayout() GlobalLayout {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.config.Layout != nil {
		return *m.config.Layout
	}
	return DefaultGlobalLayout()
}

// SetLayout 持久化全局布局（数值校验在服务层完成）。
// 落盘失败时把内存中的布局置空，使下次启动重新从文件加载已持久化的状态。
func (m *Manager) SetLayout(l GlobalLayout) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.config.Layout = &l
	if err := m.saveConfigLocked(); err != nil {
		m.config.Layout = nil
		return fmt.Errorf("save config: %w", err)
	}
	return nil
}

// loadLocked 读取数据目录内的完整配置，并返回配置文件是否存在。
func (m *Manager) loadLocked() (bool, error) {
	data, err := os.ReadFile(configFile(m.dataDir))
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, fmt.Errorf("read config: %w", err)
	}
	if err := json.Unmarshal(data, &m.config); err != nil {
		return false, fmt.Errorf("parse config: %w", err)
	}
	return true, nil
}

// saveConfigLocked 只写数据目录内的完整配置（锚点未变时无需重写）。
func (m *Manager) saveConfigLocked() error {
	return writeConfig(m.dataDir, m.config)
}

// persistLocked 落盘完整配置与锚点指针。锚点是"提交点"，放在最后写入，
// 可避免中途失败留下指向缺少配置的目录的指针。
func (m *Manager) persistLocked() error {
	if err := m.saveConfigLocked(); err != nil {
		return err
	}
	return writeConfig(m.anchorDir, UserConfig{DataDir: m.dataDir})
}

// --- 辅助函数 ---

// configFile 拼接指定目录下的配置文件路径。
func configFile(dir string) string { return filepath.Join(dir, configFileName) }

// isDir 判断路径是否为已存在的目录。
func isDir(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// writeConfig 原子写入 dir/config.json：先写同目录 .tmp 再 rename，
// 避免写入中断产生半截文件。
func writeConfig(dir string, cfg UserConfig) error {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	path := configFile(dir)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
