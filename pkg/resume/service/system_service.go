package service

import (
	"fmt"
	"gosume/pkg/config"
	"gosume/pkg/event"
	"gosume/pkg/log"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"

	"gosume/pkg/user_config"
	"gosume/pkg/util"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// SystemService 提供系统相关的信息与工具方法（窗口控制、路径、配置等）。
type SystemService struct {
	App       *application.App
	configMgr *user_config.Manager
	win       *application.WebviewWindow
	// closeConfirmed 标记前端已确认关闭窗口（保存或不保存后），下一次关闭请求放行。
	// 用于拦截系统关闭（标题栏 X / Alt+F4 / macOS 红绿灯），先通知前端做未保存确认。
	closeConfirmed atomic.Bool
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

	// 拦截窗口关闭：Wails 在 Common.WindowClosing 事件未被取消时会销毁窗口。
	// 这里注册事件钩子——前端未确认关闭前一律取消关闭，并通知前端弹出
	// 「未保存更改」确认对话框；前端确认（保存或不保存）后调用 ConfirmWindowClose
	// 设置 closeConfirmed 再真正关闭。
	win.RegisterHook(events.Common.WindowClosing, func(wEvent *application.WindowEvent) {
		if s.closeConfirmed.Load() {
			// 前端已确认，放行本次关闭
			s.closeConfirmed.Store(false)
			return
		}
		// 未确认：通知前端处理，取消本次关闭
		s.App.Event.Emit(event.WINDOW_CLOSE_REQUESTED)
		wEvent.Cancel()
	})
}

// ConfirmWindowClose 前端完成未保存确认（保存或不保存）后调用，真正关闭窗口。
func (s *SystemService) ConfirmWindowClose() *util.Response {
	s.closeConfirmed.Store(true)
	s.win.Close()
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// MinimizeWindow 最小化应用窗口。
func (s *SystemService) MinimizeWindow() *util.Response {
	s.win.Minimise()
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// MaximizeWindow 在最大化与还原之间切换窗口状态。
func (s *SystemService) MaximizeWindow() *util.Response {
	if s.win.IsMaximised() {
		s.win.UnMaximise()
	} else {
		s.win.Maximise()
	}
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// IsWindowMaximised 返回窗口当前是否处于最大化状态。
func (s *SystemService) IsWindowMaximised() *util.Response {
	return util.DoRsp(util.SuccCode, "成功", s.win.IsMaximised())
}

// CloseWindow 关闭应用窗口。
func (s *SystemService) CloseWindow() *util.Response {
	s.win.Close()
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// GetAppVersion 返回应用版本号（来自编译期嵌入的 app.yaml）。
func (s *SystemService) GetAppVersion() *util.Response {
	return util.DoRsp(util.SuccCode, "成功", config.GlobalConfig.App.Version)
}

// GetDataDir 返回当前的应用数据目录。
func (s *SystemService) GetDataDir() *util.Response {
	return util.DoRsp(util.SuccCode, "成功", s.configMgr.DataDir())
}

// GetLayoutPresets 返回生效的布局档位配置：
// 用户自定义的档位，或内置默认档位。
func (s *SystemService) GetLayoutPresets() *util.Response {
	return util.DoRsp(util.SuccCode, "成功", s.configMgr.GetLayoutPresets())
}

// SetLayoutPresets 校验并持久化用户自定义的布局档位配置
// （档位名称、数值与数量）。
func (s *SystemService) SetLayoutPresets(cfg user_config.LayoutPreset) *util.Response {
	// 校验参数
	if err := validateLayoutPresets(cfg); err != nil {
		log.Errorf("[system_service] SetLayoutPresets: 参数校验失败: %v", err)
		return util.DoRsp(util.ErrCode, err.Error(), nil)
	}

	// 持久化配置
	if err := s.configMgr.SetLayoutPresets(cfg); err != nil {
		log.Errorf("[system_service] SetLayoutPresets: 持久化失败: %v", err)
		return util.DoRsp(util.ErrCode, err.Error(), nil)
	}
	log.Infof("[system_service] SetLayoutPresets: 已保存布局档位，页边距 %d 档、间距 %d 档", len(cfg.Margins), len(cfg.Spacings))
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// ResetLayoutPresets 恢复内置默认布局档位。
func (s *SystemService) ResetLayoutPresets() *util.Response {
	if err := s.configMgr.ResetLayoutPresets(); err != nil {
		log.Errorf("[system_service] ResetLayoutPresets: 恢复默认失败: %v", err)
		return util.DoRsp(util.ErrCode, "恢复默认布局档位失败", nil)
	}
	log.Infof("[system_service] ResetLayoutPresets: 已恢复默认布局档位")
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// GetOS 返回当前操作系统标识（如 windows、darwin、linux）。
func (s *SystemService) GetOS() *util.Response {
	return util.DoRsp(util.SuccCode, "成功", runtime.GOOS)
}

// OpenExternalURL 在系统默认浏览器中打开链接。
func (s *SystemService) OpenExternalURL(url string) *util.Response {
	if err := s.App.Browser.OpenURL(url); err != nil {
		log.Errorf("[system_service] OpenExternalURL: 打开链接失败 %s: %v", url, err)
		return util.DoRsp(util.ErrCode, "打开链接失败", nil)
	}
	log.Infof("[system_service] OpenExternalURL: 已打开链接 %s", url)
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// ShowInFolder 打开系统文件管理器并选中指定路径。
// Linux 下不支持选中文件，退化为打开所在目录。
func (s *SystemService) ShowInFolder(path string) *util.Response {
	var err error
	switch runtime.GOOS {
	case "windows":
		err = exec.Command("explorer", "/select,", path).Start()
	case "darwin":
		err = exec.Command("open", "-R", path).Start()
	default:
		err = exec.Command("xdg-open", filepath.Dir(path)).Start()
	}
	if err != nil {
		log.Errorf("[system_service] ShowInFolder: 打开文件位置失败 %s: %v", path, err)
		return util.DoRsp(util.ErrCode, "打开文件位置失败", nil)
	}
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// GetAppDataDir 返回数据目录，并确保其子目录已创建。
func (s *SystemService) GetAppDataDir() *util.Response {
	dir := s.configMgr.DataDir()
	os.MkdirAll(filepath.Join(dir, "autosave"), 0755)
	os.MkdirAll(filepath.Join(dir, "templates"), 0755)
	return util.DoRsp(util.SuccCode, "成功", dir)
}

// PickDataDir 弹出原生文件夹选择对话框，返回用户选择的目录。
// 用户取消时返回成功响应且 data 为空串。
func (s *SystemService) PickDataDir() *util.Response {
	dir, err := s.App.Dialog.OpenFileWithOptions(&application.OpenFileDialogOptions{
		CanChooseDirectories: true,
		CanChooseFiles:       false,
		Title:                "选择数据存储目录",
	}).PromptForSingleSelection()
	if err != nil {
		if util.IsCancel(err) {
			return util.DoRsp(util.SuccCode, "已取消", "")
		}
		return util.DoRsp(util.ErrCode, "选择目录失败", nil)
	}
	return util.DoRsp(util.SuccCode, "成功", dir)
}

// SetDataDir 把数据迁移到新目录并热切换。
//
// 流程：校验目录 → 创建子目录 → 复制数据 → 持久化配置并触发热重载 →
// 清理旧目录中已成功迁移的内容。
func (s *SystemService) SetDataDir(newDir string) *util.Response {
	oldDir := s.configMgr.DataDir()
	if newDir == oldDir {
		return util.DoRsp(util.SuccCode, "成功", nil)
	}

	// 校验目标路径存在且为目录
	info, err := os.Stat(newDir)
	if err != nil {
		log.Errorf("[system_service] SetDataDir: 访问目录失败 %s: %v", newDir, err)
		return util.DoRsp(util.ErrCode, "访问目录失败", nil)
	}
	if !info.IsDir() {
		log.Errorf("[system_service] SetDataDir: 所选路径不是目录 %s", newDir)
		return util.DoRsp(util.ErrCode, "所选路径不是目录", nil)
	}

	// 在新位置创建所需子目录
	for _, sub := range []string{"autosave", "templates", "log"} {
		if err := os.MkdirAll(filepath.Join(newDir, sub), 0755); err != nil {
			log.Errorf("[system_service] SetDataDir: 创建子目录失败 %s/%s: %v", newDir, sub, err)
			return util.DoRsp(util.ErrCode, "创建子目录失败", nil)
		}
	}

	// 把旧目录的数据迁移到新目录，并记录成功迁移的条目
	migrated, err := migrateDataDir(oldDir, newDir)
	if err != nil {
		log.Errorf("[system_service] SetDataDir: 迁移数据失败 %s -> %s: %v", oldDir, newDir, err)
		return util.DoRsp(util.ErrCode, "迁移数据失败", nil)
	}

	// 持久化配置并触发 OnChange 回调（各 store 切换到新目录）
	if err := s.configMgr.SetDataDir(newDir); err != nil {
		log.Errorf("[system_service] SetDataDir: 保存配置失败: %v", err)
		return util.DoRsp(util.ErrCode, "保存配置失败", nil)
	}

	// 清理旧目录——只删除已确认迁移成功的条目，避免误删
	cleanMigrated(oldDir, migrated)

	log.Infof("[system_service] SetDataDir: 数据目录已切换 %s -> %s", oldDir, newDir)
	return util.DoRsp(util.SuccCode, "成功", nil)
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
			log.Errorf("删除旧数据目录失败: %v", err)
		}
	}
	if err := os.Remove(dir); err != nil {
		log.Errorf("删除旧数据目录失败: %v", err)
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
