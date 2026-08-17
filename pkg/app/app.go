package app

import (
	"embed"
	"os"
	"path/filepath"
	"runtime"

	"gosume/pkg/config"
	"gosume/pkg/log"
	"gosume/pkg/resume/repo"
	"gosume/pkg/resume/service"
	"gosume/pkg/resume/template"
	"gosume/pkg/resume/template_render"
	"gosume/pkg/user_config"
	"gosume/pkg/util"

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
func New(assets, builtinTemplates embed.FS) *App {
	rootPath := util.GetRootPath()

	// 用户配置管理器
	userCfgMgr := user_config.InitConfigManager(rootPath)

	// 获取数据目录
	dataDir := userCfgMgr.DataDir()

	// 创建必要文件
	os.MkdirAll(filepath.Join(dataDir, "autosave"), 0755)

	// 数据存储
	log.Init(dataDir, config.GlobalConfig.App.Name, log.INFO, true)
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
	htmlRenderer := template_render.NewHTMLRenderer(&templateAdapter{loader: templateLoader, unifiedHTML: string(unifiedHTML)})
	exportManager := initExportManager()

	// 项目文件存储
	projectStore := repo.NewProjectRepo(dataDir)

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
	app, window := createApp(assets, svcs, config.GlobalConfig)

	// 依赖注入
	resumeSvc.Inject(resumeStore, htmlRenderer)
	templateSvc.Inject(app, templateLoader, templateStore, string(unifiedHTML))
	exportSvc.Inject(app, exportManager)
	fileSvc.Inject(app, projectStore, resumeSvc)
	systemSvc.Inject(app, userCfgMgr, window, config.GlobalConfig)

	// 事件注册
	registerEvents()

	// 数据目录变更回调：关闭日志 → 重开存储 → 重新注入依赖 → 通知前端。
	// 存储重开失败时回滚到旧目录，避免应用进入不可用状态。
	userCfgMgr.OnChange(func(oldDir, newDir string) {
		log.Info("[main] data dir change: %s -> %s", oldDir, newDir)

		log.Close()

		if err := resumeStore.Reopen(newDir); err != nil {
			log.Error("[main] failed to reopen resume store at %s: %v", newDir, err)
			userCfgMgr.SetDataDir(oldDir)
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

	log.Info(" ============ [main] data dir: %s ============ ", dataDir)
	log.Info(" ============ [main] app version: %s ============ ", config.GlobalConfig.App.Version)

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

// createApp 创建应用与主窗口，窗口参数来自 config.yaml。
func createApp(assets embed.FS, services []application.Service, appCfg *config.Config) (*application.App, *application.WebviewWindow) {
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
