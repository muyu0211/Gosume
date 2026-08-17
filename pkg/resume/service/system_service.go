package service

import (
	"fmt"
	"gosume/pkg/config"
	"gosume/pkg/log"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"gosume/pkg/user_config"
	"gosume/pkg/util"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// SystemService 提供系统相关的信息与工具方法（窗口控制、路径、配置等）。
type SystemService struct {
	App       *application.App
	configMgr *user_config.Manager
	win       *application.WebviewWindow
}

// ServiceName 返回服务名，供 Wails 绑定与前端调用使用。
func (s *SystemService) ServiceName() string {
	return "SystemService"
}

// Inject 依赖注入
func (s *SystemService) Inject(app *application.App, configMgr *user_config.Manager, win *application.WebviewWindow) {
	s.App = app
	s.configMgr = configMgr
	s.win = win
}

// MinimizeWindow 最小化应用窗口。
func (s *SystemService) MinimizeWindow() {
	s.win.Minimise()
}

// MaximizeWindow 在最大化与还原之间切换窗口状态。
func (s *SystemService) MaximizeWindow() {
	if s.win.IsMaximised() {
		s.win.UnMaximise()
	} else {
		s.win.Maximise()
	}
}

// IsWindowMaximised 返回窗口当前是否处于最大化状态。
func (s *SystemService) IsWindowMaximised() bool {
	return s.win.IsMaximised()
}

// CloseWindow 关闭应用窗口。
func (s *SystemService) CloseWindow() {
	s.win.Close()
}

// GetAppVersion 返回应用版本号（来自编译期嵌入的 app.yaml）。
func (s *SystemService) GetAppVersion() string {
	return config.GlobalConfig.App.Version
}

// GetDataDir 返回当前的应用数据目录。
func (s *SystemService) GetDataDir() string {
	return s.configMgr.DataDir()
}

// GetLayoutPresets 返回生效的布局档位配置：
// 用户自定义的档位，或内置默认档位。
func (s *SystemService) GetLayoutPresets() user_config.LayoutPreset {
	return s.configMgr.GetLayoutPresets()
}

// SetLayoutPresets 校验并持久化用户自定义的布局档位配置
// （档位名称、数值与数量）。
func (s *SystemService) SetLayoutPresets(cfg user_config.LayoutPreset) error {
	// 校验参数
	if err := validateLayoutPresets(cfg); err != nil {
		return util.UserWrap(err, err.Error())
	}

	// 持久化配置
	if err := s.configMgr.SetLayoutPresets(cfg); err != nil {
		return util.UserWrap(err, err.Error())
	}
	return nil
}

// ResetLayoutPresets 恢复内置默认布局档位。
func (s *SystemService) ResetLayoutPresets() error {
	if err := s.configMgr.ResetLayoutPresets(); err != nil {
		return util.UserWrap(err, "恢复默认布局档位失败")
	}
	return nil
}

// GetOS 返回当前操作系统标识（如 windows、darwin、linux）。
func (s *SystemService) GetOS() string {
	return runtime.GOOS
}

// OpenExternalURL 在系统默认浏览器中打开链接。
func (s *SystemService) OpenExternalURL(url string) error {
	return s.App.Browser.OpenURL(url)
}

// ShowInFolder 打开系统文件管理器并选中指定路径。
// Linux 下不支持选中文件，退化为打开所在目录。
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

// GetAppDataDir 返回数据目录，并确保其子目录已创建。
func (s *SystemService) GetAppDataDir() string {
	dir := s.configMgr.DataDir()
	os.MkdirAll(filepath.Join(dir, "autosave"), 0755)
	os.MkdirAll(filepath.Join(dir, "templates"), 0755)
	return dir
}

// PickDataDir 弹出原生文件夹选择对话框，返回用户选择的目录。
func (s *SystemService) PickDataDir() (string, error) {
	return s.App.Dialog.OpenFileWithOptions(&application.OpenFileDialogOptions{
		CanChooseDirectories: true,
		CanChooseFiles:       false,
		Title:                "选择数据存储目录",
	}).PromptForSingleSelection()
}

// SetDataDir 把数据迁移到新目录并热切换。
//
// 流程：校验目录 → 创建子目录 → 复制数据 → 持久化配置并触发热重载 →
// 清理旧目录中已成功迁移的内容。
func (s *SystemService) SetDataDir(newDir string) error {
	oldDir := s.configMgr.DataDir()
	if newDir == oldDir {
		return nil
	}

	// 校验目标路径存在且为目录
	info, err := os.Stat(newDir)
	if err != nil {
		return util.UserWrap(err, "访问目录失败")
	}
	if !info.IsDir() {
		return util.UserMsg("所选路径不是目录")
	}

	// 在新位置创建所需子目录
	for _, sub := range []string{"autosave", "templates", "log"} {
		if err := os.MkdirAll(filepath.Join(newDir, sub), 0755); err != nil {
			return util.UserWrap(err, "创建子目录失败")
		}
	}

	// 把旧目录的数据迁移到新目录，并记录成功迁移的条目
	migrated, err := migrateDataDir(oldDir, newDir)
	if err != nil {
		return util.UserWrap(err, "迁移数据失败")
	}

	// 持久化配置并触发 OnChange 回调（各 store 切换到新目录）
	if err := s.configMgr.SetDataDir(newDir); err != nil {
		return util.UserWrap(err, "保存配置失败")
	}

	// 清理旧目录——只删除已确认迁移成功的条目，避免误删
	cleanMigrated(oldDir, migrated)

	return nil
}

// --- 数据迁移辅助函数 ---

// migratedEntry 记录一个已成功复制的文件或目录。
type migratedEntry struct {
	name  string
	isDir bool
}

// migrateDataDir 把旧目录中的数据库文件与子目录复制到新目录。
//
// 返回成功迁移的条目清单，供后续清理旧目录使用；源不存在视为正常跳过，
// 其他复制错误立即返回（此时清单包含此前已成功的条目）。
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

// copyFile 复制单个文件；源文件不存在时返回的错误可用 os.IsNotExist 判断。
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

// copyDir 递归复制目录，保持子目录结构与目录权限。
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

// cleanMigrated 删除旧目录中已成功迁移的条目，随后尝试删除旧目录本身。
// 旧目录内若仍有未迁移的其他文件，删除会失败，此时仅记录日志不影响主流程。
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

// 内置默认档位保留的 key 与取值范围约束。
//
// normal 档是两个列表的强制回退档，不允许删除；内容间距的 normal 档还必须
// 保持各 gap 为 nil（即沿用模板内置节奏）。
const (
	MarginTierNormalKey            = "normal"
	SpacingTierNormalKey           = "normal"
	marginValueMin, marginValueMax = 5.0, 30.0 // 毫米
	gapValueMin, gapValueMax       = 0.0, 40.0 // 磅
)

// validateLayoutPresets 校验待保存的布局档位配置。
//
// 校验项：列表非空、key 合法且不重复、名称非空、数值在允许区间内、
// 必须保留 normal 档，且内容间距的 normal 档不得设置具体数值。
// 返回的错误消息面向用户，可直接展示。
func validateLayoutPresets(cfg user_config.LayoutPreset) error {
	if len(cfg.Margins) == 0 {
		return fmt.Errorf("页边距档位至少保留一个")
	}
	if len(cfg.Spacings) == 0 {
		return fmt.Errorf("内容间距档位至少保留一个")
	}

	marginKeys := map[string]bool{}
	for _, t := range cfg.Margins {
		if err := validTierKey(t.Key); err != nil {
			return fmt.Errorf("页边距档位 %s", err)
		}
		if marginKeys[t.Key] {
			return fmt.Errorf("页边距档位 key 重复: %s", t.Key)
		}
		marginKeys[t.Key] = true
		if strings.TrimSpace(t.Label) == "" {
			return fmt.Errorf("页边距档位 %s 的名称为空", t.Key)
		}
		if t.PaddingY < marginValueMin || t.PaddingY > marginValueMax ||
			t.PaddingX < marginValueMin || t.PaddingX > marginValueMax {
			return fmt.Errorf("页边距档位“%s”的数值需在 %.0f–%.0fmm 之间", t.Label, marginValueMin, marginValueMax)
		}
	}
	if !marginKeys[MarginTierNormalKey] {
		return fmt.Errorf("页边距必须保留“标准”档位（未选中档位时的回退值）")
	}

	spacingKeys := map[string]bool{}
	for _, t := range cfg.Spacings {
		if err := validTierKey(t.Key); err != nil {
			return fmt.Errorf("内容间距档位 %s", err)
		}
		if spacingKeys[t.Key] {
			return fmt.Errorf("内容间距档位 key 重复: %s", t.Key)
		}
		spacingKeys[t.Key] = true
		if strings.TrimSpace(t.Label) == "" {
			return fmt.Errorf("内容间距档位 %s 的名称为空", t.Key)
		}
		for name, v := range map[string]*float64{
			"模块间距": t.SectionGap, "条目间距": t.ItemGap, "细节间距": t.DetailGap,
		} {
			if v != nil && (*v < gapValueMin || *v > gapValueMax) {
				return fmt.Errorf("内容间距档位“%s”的%s需在 %.0f–%.0fpt 之间", t.Label, name, gapValueMin, gapValueMax)
			}
		}
	}
	if !spacingKeys[SpacingTierNormalKey] {
		return fmt.Errorf("内容间距必须保留“标准”档位（模板默认 + 回退值）")
	}
	// 内容间距的 normal 档必须保持"模板默认"，即各 gap 均为 nil
	for _, t := range cfg.Spacings {
		if t.Key == SpacingTierNormalKey &&
			(t.SectionGap != nil || t.ItemGap != nil || t.DetailGap != nil) {
			return fmt.Errorf("内容间距“标准”档位为模板内置节奏，不允许修改其数值")
		}
	}
	return nil
}

// validTierKey 校验档位 key：非空、仅含字母数字与 - _，且不超过 64 字符。
func validTierKey(key string) error {
	if key == "" {
		return fmt.Errorf("key 不能为空")
	}
	for _, r := range key {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_') {
			return fmt.Errorf("key %q 含非法字符（仅限字母、数字、-、_）", key)
		}
	}
	if len(key) > 64 {
		return fmt.Errorf("key %q 超过 64 字符", key)
	}
	return nil
}
