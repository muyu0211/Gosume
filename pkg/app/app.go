package app

import (
	"embed"
	"os"
	"path/filepath"
	"runtime"

	"gosume/pkg/app_config"
	"gosume/pkg/log"
	"gosume/pkg/render"
	"gosume/pkg/service"
	"gosume/pkg/store"
	"gosume/pkg/template"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// App 持有已初始化的各组件，并负责应用的生命周期管理。
type App struct {
	wailsApp  *application.App
	stopWatch chan struct{}
}

// New 初始化全部组件并返回可运行的 App。
//
// 装配顺序：配置 → 日志 → 存储层 → 模板加载器 → 渲染与导出 → 服务 →
// Wails 应用与窗口 → 依赖注入 → 事件与数据目录变更回调。
//
// appCfg 为应用级编译期配置（来自 app.yaml），用于驱动窗口尺寸、版本号等
// 框架级参数；与 pkg/config 用户运行时配置 config.json 区分。
func New(assets, builtinTemplates embed.FS, appCfg *app_config.AppConfig) *App {
	// 配置
	configMgr := initConfig()

	// 日志
	dataDir := configMgr.DataDir()
	os.MkdirAll(filepath.Join(dataDir, "autosave"), 0755)
	log.Init(dataDir, appCfg.App.Name, log.INFO, true)
	log.Info("[main] data dir: %s", dataDir)
	log.Info("[main] app version: %s", appCfg.App.Version)

	// 数据存储
	resumeStore := initResumeStore(dataDir)
	templateStore := initTemplateStore(resumeStore, builtinTemplates)
	initLegacyMigration(templateStore, dataDir)

	// 模板加载器
	templateLoader := template.NewLoader(templateStore)
	stopWatch := initDevWatcher(templateStore)

	// 统一 HTML（Gosume 一期改造）：全应用共享一份，模板包不再携带 HTML。
	unifiedHTML, err := builtinTemplates.ReadFile("templates/template.html")
	if err != nil {
		log.Error("[main] read template.html: %v", err)
		unifiedHTML = []byte{}
	}

	// 渲染与导出
	htmlRenderer := render.NewHTMLRenderer(&templateAdapter{loader: templateLoader, unifiedHTML: string(unifiedHTML)})
	exportManager := initExportManager()

	// 项目文件存储
	projectStore := store.NewProjectStore(dataDir)

	// 服务
	resumeSvc := &service.ResumeService{}
	templateSvc := &service.TemplateService{}
	exportSvc := &service.ExportService{}
	fileSvc := &service.FileService{}
	systemSvc := &service.SystemService{}

	// 服务列表
	svcs := []application.Service{
		application.NewService(resumeSvc),
		application.NewService(templateSvc),
		application.NewService(exportSvc),
		application.NewService(fileSvc),
		application.NewService(systemSvc),
	}

	// Wails 应用与窗口
	app, window := createApp(assets, svcs, appCfg)

	// 依赖注入
	resumeSvc.Inject(resumeStore, htmlRenderer)
	templateSvc.Inject(app, templateLoader, templateStore, string(unifiedHTML))
	exportSvc.Inject(app, exportManager)
	fileSvc.Inject(app, projectStore, resumeSvc)
	systemSvc.Inject(app, configMgr, window, appCfg)

	// 事件注册
	registerEvents()

	// 数据目录变更回调：关闭日志 → 重开存储 → 重新注入依赖 → 通知前端。
	// 存储重开失败时回滚到旧目录，避免应用进入不可用状态。
	configMgr.OnChange(func(oldDir, newDir string) {
		log.Info("[main] data dir change: %s -> %s", oldDir, newDir)

		log.Close()

		if err := resumeStore.Reopen(newDir); err != nil {
			log.Error("[main] failed to reopen resume store at %s: %v", newDir, err)
			configMgr.SetDataDir(oldDir)
			return
		}

		projectStore.SetDataDir(newDir)

		if err := templateStore.Reopen(resumeStore.DB(), builtinTemplates); err != nil {
			log.Error("[main] failed to reopen template store: %v", err)
		}

		log.Init(newDir, "Gosume", log.INFO, true)

		resumeSvc.Inject(resumeStore, htmlRenderer)
		templateSvc.Inject(app, templateLoader, templateStore, string(unifiedHTML))
		fileSvc.Inject(app, projectStore, resumeSvc)

		app.Event.Emit("config:datadir-changed", newDir)

		log.Info("[main] hot-reload complete, new data dir: %s", newDir)
	})

	return &App{wailsApp: app, stopWatch: stopWatch}
}

// Run 启动应用事件循环，并在退出时停止模板监听与关闭日志。
func (a *App) Run() {
	if a.stopWatch != nil {
		defer close(a.stopWatch)
	}
	defer log.Close()
	if err := a.wailsApp.Run(); err != nil {
		log.Fatal("%v", err)
	}
}

// createApp 创建应用与主窗口，窗口参数来自 app.yaml。
func createApp(assets embed.FS, services []application.Service, appCfg *app_config.AppConfig) (*application.App, *application.WebviewWindow) {
	app := application.New(application.Options{
		Name:        appCfg.App.Name,
		Description: appCfg.App.Description,
		Services:    services,
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
	})

	winOpts := application.WebviewWindowOptions{
		Name:      "main",
		Title:     appCfg.Window.Title,
		Width:     appCfg.Window.Width,
		Height:    appCfg.Window.Height,
		MinWidth:  appCfg.Window.MinWidth,
		MinHeight: appCfg.Window.MinHeight,
		URL:       "/",
		Frameless: appCfg.Window.Frameless,
	}

	switch runtime.GOOS {
	case "windows":
	case "darwin":
		winOpts.Frameless = false
		winOpts.Mac.TitleBar = application.MacTitleBarHiddenInset
	}

	win := app.Window.NewWithOptions(winOpts)

	return app, win
}
