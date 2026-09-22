package setting

import (
	"os/exec"
	"path/filepath"
	"runtime"
	"sync/atomic"

	"gosume/pkg/config"
	"gosume/pkg/event"
	"gosume/pkg/log"
	"gosume/pkg/util"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// SystemService 提供系统相关的信息与工具方法（窗口控制、主题、版本、OS 工具）。
// 数据目录相关（查看/选择/迁移热切换）见同包 data_dir.go。
type SystemService struct {
	App            *application.App
	configMgr      *config.Manager
	win            *application.WebviewWindow
	closeConfirmed atomic.Bool
}

// ServiceName 返回服务名，供 Wails 绑定与前端调用使用。
// ⚠ 绑定全名第三段取结构体名，必须与前端 registerServicePackage 登记的包路径一致。
func (s *SystemService) ServiceName() string {
	return "SystemService"
}

// Inject 依赖注入
func (s *SystemService) Inject(app *application.App, configMgr *config.Manager, win *application.WebviewWindow) {
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

	// 最大化/还原状态钩子：拖动还原、双击标题栏、Win+方向键等**所有**改变最大化
	// 状态的路径都会触发对应事件。向前端广播真实状态，自绘最大化按钮的图标以此
	// 为准——避免「拖动还原后图标不同步、此后显示状态与实际相反」的问题。
	win.RegisterHook(events.Common.WindowMaximise, func(wEvent *application.WindowEvent) {
		s.App.Event.Emit(event.WINDOW_MAXIMISE_STATE, true)
	})
	win.RegisterHook(events.Common.WindowUnMaximise, func(wEvent *application.WindowEvent) {
		s.App.Event.Emit(event.WINDOW_MAXIMISE_STATE, false)
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

// GetTheme 返回用户当前的主题选项（system/classic/wheat/obsidian）。
func (s *SystemService) GetTheme() *util.Response {
	return util.DoRsp(util.SuccCode, "成功", s.configMgr.GetTheme())
}

// SetTheme 校验并持久化用户主题选项。
// 取值不合法或为空时回退到默认主题（跟随系统）。
func (s *SystemService) SetTheme(theme string) *util.Response {
	if !config.IsValidTheme(theme) {
		log.Warnf("[setting.system] SetTheme: 非法主题取值 %q，回退为 %s", theme, config.DefaultTheme)
		theme = config.DefaultTheme
	}
	if err := s.configMgr.SetTheme(theme); err != nil {
		log.Errorf("[setting.system] SetTheme: 持久化失败 %q: %v", theme, err)
		return util.DoRsp(util.ErrCode, err.Error(), nil)
	}
	log.Infof("[setting.system] SetTheme: 已保存主题 %s", theme)
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// GetOS 返回当前操作系统标识（如 windows、darwin、linux）。
func (s *SystemService) GetOS() *util.Response {
	return util.DoRsp(util.SuccCode, "成功", runtime.GOOS)
}

// OpenExternalURL 在系统默认浏览器中打开链接。
func (s *SystemService) OpenExternalURL(url string) *util.Response {
	if err := s.App.Browser.OpenURL(url); err != nil {
		log.Errorf("[setting.system] OpenExternalURL: 打开链接失败 %s: %v", url, err)
		return util.DoRsp(util.ErrCode, "打开链接失败", nil)
	}
	log.Infof("[setting.system] OpenExternalURL: 已打开链接 %s", url)
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
		log.Errorf("[setting.system] ShowInFolder: 打开文件位置失败 %s: %v", path, err)
		return util.DoRsp(util.ErrCode, "打开文件位置失败", nil)
	}
	return util.DoRsp(util.SuccCode, "成功", nil)
}
