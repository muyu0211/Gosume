package app

import (
	"embed"
	"os"
	"path/filepath"
	"runtime"

	"gosume/pkg/ai"
	"gosume/pkg/autofill"
	asvc "gosume/pkg/autofill/service"
	"gosume/pkg/config"
	"gosume/pkg/event"
	"gosume/pkg/log"
	recruitsvc "gosume/pkg/recruit/service"
	"gosume/pkg/resume/model"
	"gosume/pkg/resume/repo"
	rsvc "gosume/pkg/resume/service"
	"gosume/pkg/resume/template"
	"gosume/pkg/resume/template_export"
	settingSvc "gosume/pkg/setting"
	tsvc "gosume/pkg/tool/service"
	"gosume/pkg/util"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// App 持有已初始化的各组件，并负责应用的生命周期管理。
type App struct {
	wailsApp       *application.App
	stopWatch      chan struct{}
	browserManager *template_export.BrowserManager
}

// Run 启动应用事件循环，并在退出时停止模板监听、释放无头浏览器与关闭日志。
func (a *App) Run() {
	if a.stopWatch != nil {
		defer close(a.stopWatch)
	}
	defer log.Close()
	defer a.browserManager.Close()

	if err := a.wailsApp.Run(); err != nil {
		a.browserManager.Close()
		log.Fatalf("%v", err)
	}
}

// New 初始化全部组件并返回可运行的 App。
func New(assets, builtinTemplates embed.FS) *App {
	rootPath := util.GetRootPath()

	// 用户配置管理器
	userCfgMgr := config.InitConfigManager(rootPath)

	// 获取数据目录
	dataDir := userCfgMgr.DataDir()

	// 创建必要文件
	os.MkdirAll(filepath.Join(dataDir, "autosave"), 0755)

	// 数据存储
	log.Init(dataDir, config.GlobalConfig.App.Name, log.INFO, true)
	resumeStore := initResumeStore(dataDir)
	templateStore := initTemplateStore(resumeStore, builtinTemplates)
	initLegacyMigration(templateStore, dataDir)
	settingsRepo := initRecruitSettingsRepo(resumeStore)
	jobRepo, companyRepo := initRecruitRepos(resumeStore)

	// 模板加载器
	templateLoader := template.NewLoader(templateStore)
	stopWatch := initDevWatcher(templateStore)

	// 统一 HTML：全应用共享一份，模板包不携带 HTML。
	tempHTML, err := builtinTemplates.ReadFile("templates/template.html")
	if err != nil {
		log.Errorf("[main] read template.html: %v", err)
		tempHTML = []byte{}
	}

	// 全局统一样式：对所有模板生效，跟随 template.html 一同内嵌。
	tempGlobalCSS, err := builtinTemplates.ReadFile("templates/resume-global.css")
	if err != nil {
		log.Errorf("[main] read resume-global.css: %v", err)
		tempGlobalCSS = []byte{}
	}

	// 导出
	browserManager := template_export.NewBrowserManager()

	// 项目文件存储
	projectStore := repo.NewProjectRepo(dataDir)

	// 服务
	resumeSvc := &rsvc.ResumeService{}
	templateSvc := &rsvc.TemplateService{}
	exportSvc := &rsvc.ExportService{}
	fileSvc := &rsvc.FileService{}
	updateSvc := &rsvc.UpdateService{}
	communitySvc := &rsvc.CommunityService{}
	aiSvc := &rsvc.AIService{}
	systemSvc := &settingSvc.SystemService{}
	aiConfigSvc := &settingSvc.AIConfigService{}
	autofillSvc := &asvc.AutofillService{}
	toolSvc := &tsvc.ToolService{}
	recruitSvc := &recruitsvc.RecruitService{}

	// 一键填入本地桥：当前简历数据经 127.0.0.1 暴露给浏览器扩展。
	autofillBridge := autofill.NewBridge(dataDir, config.GlobalConfig.App.Version, func() *model.Resume {
		if r := resumeSvc.GetResume(); r != nil {
			if m, ok := r.Data.(*model.Resume); ok {
				return m
			}
		}
		return nil
	})
	// 随应用启动本地桥。
	if err := autofillBridge.Start(); err != nil {
		log.Errorf("[main] start autofill bridge: %v", err)
	}

	// 服务列表
	svcs := []application.Service{
		application.NewService(resumeSvc),
		application.NewService(templateSvc),
		application.NewService(exportSvc),
		application.NewService(systemSvc),
		application.NewService(aiConfigSvc),
		application.NewService(fileSvc),
		application.NewService(updateSvc),
		application.NewService(communitySvc),
		application.NewService(aiSvc),
		application.NewService(autofillSvc),
		application.NewService(toolSvc),
		application.NewService(recruitSvc),
	}

	// Wails 应用与窗口
	app, window := createApp(assets, svcs)

	// AI 配置来源：按当前数据目录实时读取 AI 配置——热切换/改配置即时生效，
	// 热切换流程无需对持有者重新注入。
	aiSource := func() (ai.AIUnit, bool) {
		return ai.LoadConfig(userCfgMgr.DataDir()).Active()
	}
	// 通用对话能力（润色 / Chat）：原样调用。
	aiChat := ai.NewDynamicChat(aiSource)

	// 依赖注入
	resumeSvc.Inject(app, resumeStore)
	templateSvc.Inject(app, templateLoader, templateStore, string(tempHTML), string(tempGlobalCSS))
	exportSvc.Inject(app, browserManager)
	systemSvc.Inject(app, userCfgMgr, window)
	aiConfigSvc.Inject(userCfgMgr)
	fileSvc.Inject(app, resumeStore, templateLoader, resumeSvc)
	updateSvc.Inject(app, userCfgMgr)
	communitySvc.Inject(app, templateLoader, templateStore)
	aiSvc.Inject(aiChat)
	autofillSvc.Inject(app, autofillBridge)
	toolSvc.Inject(app)
	recruitSvc.Inject(jobRepo, companyRepo, settingsRepo, aiChat)

	// 事件注册
	event.AddEvent(event.EXPORT_PROGRESS, 1)
	event.AddEvent(event.EXPORT_COMPLETED, "1")
	event.AddEvent(event.EXPORT_CANCELED, "1")
	event.AddEvent(event.FILE_OPENED, "1")
	event.AddEvent(event.FILE_SAVED, "1")
	event.AddEvent(event.FILE_IMPORTED, "1")
	event.AddEvent(event.CONFIG_DATADIR_CHANGED, "1")
	event.AddEvent(event.WINDOW_CLOSE_REQUESTED, "")
	event.AddEvent(event.UPDATE_PROGRESS, 1)
	event.AddEvent(event.UPDATE_RESULT, "1")
	event.RegisterEvents()

	// 数据目录变更回调：关闭日志 → 重开存储 → 重新注入依赖 → 通知前端。
	// 存储重开失败时回滚到旧目录，避免应用进入不可用状态。
	userCfgMgr.OnChange(func(oldDir, newDir string) {
		log.Infof("[main] data dir change: %s -> %s", oldDir, newDir)

		log.Close()

		if err := resumeStore.Reopen(newDir); err != nil {
			log.Errorf("[main] failed to reopen resume store at %s: %v", newDir, err)
			userCfgMgr.SetDataDir(oldDir)
			return
		}

		projectStore.SetDataDir(newDir)

		if err := templateStore.Reopen(resumeStore.DB(), builtinTemplates); err != nil {
			log.Errorf("[main] failed to reopen template store: %v", err)
		}

		// 求职进程存储跟随共享连接（Reopen 会关闭旧连接并创建新实例，必须逐一重指）
		if err := settingsRepo.Reopen(resumeStore.DB()); err != nil {
			log.Errorf("[main] failed to reopen recruit settings store: %v", err)
		}
		if err := jobRepo.Reopen(resumeStore.DB()); err != nil {
			log.Errorf("[main] failed to reopen job_process store: %v", err)
		}
		if err := companyRepo.Reopen(resumeStore.DB()); err != nil {
			log.Errorf("[main] failed to reopen job_company store: %v", err)
		}

		log.Init(newDir, "Gosume", log.INFO, true)

		// 重新注入依赖
		resumeSvc.Inject(app, resumeStore)
		templateSvc.Inject(app, templateLoader, templateStore, string(tempHTML), string(tempGlobalCSS))
		fileSvc.Inject(app, resumeStore, templateLoader, resumeSvc)

		app.Event.Emit("config:datadir-changed", newDir)

		log.Infof("[main] hot-reload complete, new data dir: %s", newDir)
	})

	log.Infof(" ============ [main] data dir: %s ============ ", dataDir)
	log.Infof(" ============ [main] app version: %s ============ ", config.GlobalConfig.App.Version)

	return &App{wailsApp: app, stopWatch: stopWatch, browserManager: browserManager}
}

// createApp 创建应用与主窗口，窗口参数来自 config.yaml。
func createApp(assets embed.FS, services []application.Service) (*application.App, *application.WebviewWindow) {
	app := application.New(application.Options{
		Name:        config.GlobalConfig.App.Name,
		Description: config.GlobalConfig.App.Description,
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
		Title:     config.GlobalConfig.Window.Title,
		Width:     config.GlobalConfig.Window.Width,
		Height:    config.GlobalConfig.Window.Height,
		MinWidth:  config.GlobalConfig.Window.MinWidth,
		MinHeight: config.GlobalConfig.Window.MinHeight,
		URL:       "/",
		Frameless: config.GlobalConfig.Window.Frameless,
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
