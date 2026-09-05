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
//
// 关闭行为分平台：
//   - macOS：应用常驻 dock（已禁用 ApplicationShouldTerminateAfterLastWindowClosed），
//     「关闭」改为隐藏窗口而非销毁——销毁会触发内置监听器把窗口从注册表移除
//     （Window.Remove），导致点击 dock 图标时 Wails 的 ApplicationShouldHandleReopen
//     无窗口可复原。隐藏则保留在注册表中，dock 点击即可重新显示。
//   - Windows/Linux：销毁窗口，最后一个窗口关闭时进程退出。
func (s *SystemService) ConfirmWindowClose() *util.Response {
	s.closeConfirmed.Store(true)
	if runtime.GOOS == "darwin" {
		s.win.Hide()
		s.closeConfirmed.Store(false)
	} else {
		s.win.Close()
	}
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

// QuitApp 立即终止应用进程（供更新「安装并重启」流程使用）。
// 与 CloseWindow 不同，这里不依赖「关闭窗口→进程退出」的平台行为
// （macOS 已禁用 ApplicationShouldTerminateAfterLastWindowClosed，
// 关闭窗口不会退出进程），而是直接终结进程，确保更新 Helper 能等
// 到主进程退出后执行替换并重启新版本。调用方须先完成未保存确认。
func (s *SystemService) QuitApp() *util.Response {
	s.App.Quit()
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

// GetTheme 返回用户当前的主题选项（system/classic/wheat/obsidian）。
func (s *SystemService) GetTheme() *util.Response {
	return util.DoRsp(util.SuccCode, "成功", s.configMgr.GetTheme())
}

// SetTheme 校验并持久化用户主题选项。
// 取值不合法或为空时回退到默认主题（跟随系统）。
func (s *SystemService) SetTheme(theme string) *util.Response {
	if !user_config.IsValidTheme(theme) {
		log.Warnf("[system_service] SetTheme: 非法主题取值 %q，回退为 %s", theme, user_config.DefaultTheme)
		theme = user_config.DefaultTheme
	}
	if err := s.configMgr.SetTheme(theme); err != nil {
		log.Errorf("[system_service] SetTheme: 持久化失败 %q: %v", theme, err)
		return util.DoRsp(util.ErrCode, err.Error(), nil)
	}
	log.Infof("[system_service] SetTheme: 已保存主题 %s", theme)
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
