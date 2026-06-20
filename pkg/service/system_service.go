package service

import (
	"fmt"
	"gosume/pkg/log"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"gosume/pkg/config"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// SystemService provides system-related information and utilities.
type SystemService struct {
	wailsApp  *application.App
	configMgr *config.Manager
	win       *application.WebviewWindow
}

// ServiceName returns the service name.
func (s *SystemService) ServiceName() string {
	return "SystemService"
}

// Inject sets up dependencies.
func (s *SystemService) Inject(app *application.App, configMgr *config.Manager, win *application.WebviewWindow) {
	s.wailsApp = app
	s.configMgr = configMgr
	s.win = win
}

// MinimizeWindow minimizes the application window.
func (s *SystemService) MinimizeWindow() {
	s.win.Minimise()
}

// MaximizeWindow toggles the window between maximized and restored states.
func (s *SystemService) MaximizeWindow() {
	if s.win.IsMaximised() {
		s.win.UnMaximise()
	} else {
		s.win.Maximise()
	}
}

// IsWindowMaximised returns whether the window is currently maximized.
func (s *SystemService) IsWindowMaximised() bool {
	return s.win.IsMaximised()
}

// CloseWindow closes the application window.
func (s *SystemService) CloseWindow() {
	s.win.Close()
}

// GetAppVersion returns the application version.
func (s *SystemService) GetAppVersion() string {
	return "1.0.0"
}

// GetDataDir returns the application data directory.
func (s *SystemService) GetDataDir() string {
	return s.configMgr.DataDir()
}

// GetOS returns the current operating system.
func (s *SystemService) GetOS() string {
	return runtime.GOOS
}

// OpenExternalURL opens a URL in the system browser.
func (s *SystemService) OpenExternalURL(url string) error {
	return s.wailsApp.Browser.OpenURL(url)
}

// ShowInFolder opens the file manager and selects the given path.
func (s *SystemService) ShowInFolder(path string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("explorer", "/select,", path).Start()
	case "darwin":
		return exec.Command("open", "-R", path).Start()
	default:
		return exec.Command("xdg-open", filepath.Dir(path)).Start()
	}
}

// GetAppDataDir ensures the data directory and its subdirectories exist.
func (s *SystemService) GetAppDataDir() string {
	dir := s.configMgr.DataDir()
	os.MkdirAll(filepath.Join(dir, "autosave"), 0755)
	os.MkdirAll(filepath.Join(dir, "templates"), 0755)
	return dir
}

// PickDataDir opens a native folder selection dialog.
func (s *SystemService) PickDataDir() (string, error) {
	return s.wailsApp.Dialog.OpenFileWithOptions(&application.OpenFileDialogOptions{
		CanChooseDirectories: true,
		CanChooseFiles:       false,
		Title:                "选择数据存储目录",
	}).PromptForSingleSelection()
}

// SetDataDir migrates data to a new directory and hot-switches.
func (s *SystemService) SetDataDir(newDir string) error {
	oldDir := s.configMgr.DataDir()
	if newDir == oldDir {
		return nil
	}

	// Validate the new directory exists and is a directory.
	info, err := os.Stat(newDir)
	if err != nil {
		return UserWrap(err, "访问目录失败")
	}
	if !info.IsDir() {
		return UserMsg("所选路径不是目录")
	}

	// Create subdirectories at the new location.
	for _, sub := range []string{"autosave", "templates", "log"} {
		if err := os.MkdirAll(filepath.Join(newDir, sub), 0755); err != nil {
			return UserWrap(err, "创建子目录失败")
		}
	}

	// Migrate existing data from old to new directory, tracking what was moved.
	migrated, err := migrateDataDir(oldDir, newDir)
	if err != nil {
		return UserWrap(err, "迁移数据失败")
	}

	// Persist config and fire OnChange callbacks (stores switch to newDir).
	if err := s.configMgr.SetDataDir(newDir); err != nil {
		return UserWrap(err, "保存配置失败")
	}

	// Clean up old data directory — only remove items that were successfully migrated.
	cleanMigrated(oldDir, migrated)

	return nil
}

// GetConfigRoot returns the config directory root.
// If config.json exists next to the executable, uses portable mode (exe dir).
// Otherwise falls back to the OS user config directory.
func GetConfigRoot() string {
	if exePath, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exePath)
		if _, err := os.Stat(filepath.Join(exeDir, "config.json")); err == nil {
			return exeDir
		}
	}
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = filepath.Join(os.Getenv("HOME"), ".config")
	}
	return filepath.Join(configDir, "ResumeCraft")
}

// --- migration helpers ---

// migratedEntry records a file or directory that was successfully copied.
type migratedEntry struct {
	name  string
	isDir bool
}

func migrateDataDir(oldDir, newDir string) ([]migratedEntry, error) {
	var migrated []migratedEntry

	files := []string{"gosume.db", "gosume.db-wal", "gosume.db-shm", "recent.json"}
	for _, name := range files {
		src := filepath.Join(oldDir, name)
		dst := filepath.Join(newDir, name)
		if err := copyFile(src, dst); err != nil {
			if !os.IsNotExist(err) {
				return migrated, fmt.Errorf("copy %s: %w", name, err)
			}
		} else {
			migrated = append(migrated, migratedEntry{name: name})
		}
	}

	for _, sub := range []string{"templates", "autosave", "log"} {
		src := filepath.Join(oldDir, sub)
		dst := filepath.Join(newDir, sub)
		if err := copyDir(src, dst); err != nil {
			if !os.IsNotExist(err) {
				return migrated, fmt.Errorf("copy %s: %w", sub, err)
			}
		} else {
			migrated = append(migrated, migratedEntry{name: sub, isDir: true})
		}
	}

	return migrated, nil
}

func copyFile(src, dst string) error {
	s, err := os.Open(src)
	if err != nil {
		return err
	}
	defer s.Close()

	d, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer d.Close()

	_, err = io.Copy(d, s)
	return err
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, info.Mode())
		}
		return copyFile(path, target)
	})
}

// cleanMigrated removes the successfully migrated entries, then removes the
func cleanMigrated(dir string, items []migratedEntry) {
	for _, item := range items {
		if err := os.RemoveAll(filepath.Join(dir, item.name)); err != nil {
			log.Error("删除旧数据目录失败: %v", err)
		}
	}
	if err := os.Remove(dir); err != nil {
		log.Error("删除旧数据目录失败: %v", err)
	}
}
