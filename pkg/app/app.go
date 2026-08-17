package app

import (
	"embed"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"gosume/pkg/appconfig"
	"gosume/pkg/config"
	"gosume/pkg/export"
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
func New(assets, builtinTemplates embed.FS, appCfg *appconfig.AppConfig) *App {
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

	svcs := []application.Service{
		application.NewService(resumeSvc),
		application.NewService(templateSvc),
		application.NewService(exportSvc),
		application.NewService(fileSvc),
		application.NewService(systemSvc),
	}

	// Wails 应用与窗口
	wailsApp, win := createWailsApp(assets, svcs, appCfg)

	// 依赖注入
	resumeSvc.Inject(resumeStore, htmlRenderer)
	templateSvc.Inject(wailsApp, templateLoader, templateStore, string(unifiedHTML))
	exportSvc.Inject(wailsApp, exportManager)
	fileSvc.Inject(wailsApp, projectStore, resumeSvc)
	systemSvc.Inject(wailsApp, configMgr, win, appCfg)

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
		templateSvc.Inject(wailsApp, templateLoader, templateStore, string(unifiedHTML))
		fileSvc.Inject(wailsApp, projectStore, resumeSvc)

		wailsApp.Event.Emit("config:datadir-changed", newDir)

		log.Info("[main] hot-reload complete, new data dir: %s", newDir)
	})

	return &App{wailsApp: wailsApp, stopWatch: stopWatch}
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

// --- 初始化辅助函数 ---

// initConfig 初始化配置管理器，并完成历史数据目录的一次性迁移。
// 配置初始化失败属于不可恢复错误，直接 panic。
func initConfig() *config.Manager {
	configRoot := service.GetConfigRoot()
	os.MkdirAll(configRoot, 0755)

	configMgr, err := config.NewManager(configRoot)
	if err != nil {
		panic(fmt.Sprintf("Failed to init config manager: %v", err))
	}

	// 一次性迁移：把早期直接存放在 configRoot 的数据移入 configRoot/data/
	defaultDataDir := configMgr.DefaultDir()
	if _, err := os.Stat(filepath.Join(defaultDataDir, "gosume.db")); os.IsNotExist(err) {
		if _, err := os.Stat(filepath.Join(configRoot, "gosume.db")); err == nil {
			fmt.Printf("[main] migrating data from %s to %s\n", configRoot, defaultDataDir)
			os.MkdirAll(defaultDataDir, 0755)
			for _, name := range []string{"gosume.db", "gosume.db-wal", "gosume.db-shm", "recent.json"} {
				os.Rename(filepath.Join(configRoot, name), filepath.Join(defaultDataDir, name))
			}
			for _, sub := range []string{"autosave", "templates", "log"} {
				os.Rename(filepath.Join(configRoot, sub), filepath.Join(defaultDataDir, sub))
			}
		}
	}

	return configMgr
}

// initResumeStore 打开简历存储；失败属于不可恢复错误，直接 panic。
func initResumeStore(dataDir string) *store.ResumeStore {
	s, err := store.NewResumeStore(dataDir)
	if err != nil {
		panic(fmt.Sprintf("Failed to open resume store: %v", err))
	}
	return s
}

// initTemplateStore 初始化模板存储，复用简历存储的数据库连接。
// 失败属于不可恢复错误，直接 panic。
func initTemplateStore(resumeStore *store.ResumeStore, builtinTemplates embed.FS) *store.TemplateStore {
	s, err := store.NewTemplateStore(resumeStore.DB(), builtinTemplates)
	if err != nil {
		panic(fmt.Sprintf("Failed to init template store: %v", err))
	}
	return s
}

// initLegacyMigration 把历史的文件式用户模板导入数据库，
// 导入成功后将原目录改名备份，避免重复导入。
func initLegacyMigration(templateStore *store.TemplateStore, dataDir string) {
	legacyDir := filepath.Join(dataDir, "templates")
	if imported, _ := templateStore.ImportFromFilesystem(legacyDir); imported > 0 {
		log.Info("[main] migrated %d user templates from %s", imported, legacyDir)
		os.Rename(legacyDir, legacyDir+"_migrated_backup")
	}
}

// initDevWatcher 在工作目录存在 ./templates 时启动模板热重载监听。
// 该目录仅在开发环境存在，因此生产构建下返回 nil。
func initDevWatcher(templateStore *store.TemplateStore) chan struct{} {
	if _, err := os.Stat("./templates"); err == nil {
		stopWatch, err := templateStore.WatchDir("./templates")
		if err != nil {
			log.Warn("[main] failed to start template watcher: %v", err)
			return nil
		}
		return stopWatch
	}
	return nil
}

// initExportManager 创建导出管理器及其依赖的无头浏览器管理器。
func initExportManager() *export.ExportManager {
	browser := export.NewBrowserManager()
	return export.NewExportManager(browser)
}

// createWailsApp 创建 Wails 应用与主窗口，窗口参数来自 app.yaml。
func createWailsApp(assets embed.FS, services []application.Service, appCfg *appconfig.AppConfig) (*application.App, *application.WebviewWindow) {
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

	if runtime.GOOS == "darwin" {
		// macOS 上放弃自绘标题栏：保留原生红绿灯（关闭/最小化/全屏）按钮，
		// 使用隐藏内嵌标题栏（透明标题栏 + 隐藏标题 + 内容延伸到标题栏下方），
		// 让窗口外观与原生 macOS 应用一致，而不是像 Windows 程序那样带自绘按钮。
		// 注意：Frameless(borderless) 会移除红绿灯，因此必须关闭并改用 TitleBar 配置。
		winOpts.Frameless = false
		winOpts.Mac.TitleBar = application.MacTitleBarHiddenInset
	}
	win := app.Window.NewWithOptions(winOpts)

	return app, win
}

// registerEvents 注册后端向前端发送的 Wails 事件及其数据类型。
func registerEvents() {
	application.RegisterEvent[int]("export:progress")
	application.RegisterEvent[string]("export:completed")
	application.RegisterEvent[string]("file:opened")
	application.RegisterEvent[string]("file:saved")
	application.RegisterEvent[string]("config:datadir-changed")
}

// --- 适配器 ---

// templateAdapter 把 template.Loader 适配为 render.TemplateLoader 接口，
// 并在加载时统一决定模板实际使用的 HTML。
type templateAdapter struct {
	loader      *template.Loader
	unifiedHTML string
}

// effectiveHTML 返回模板实际使用的 HTML：已迁移到统一骨架（uses_unified_html）
// 或模板无自带 HTML 时使用应用内置的 template.html。
func (a *templateAdapter) effectiveHTML(t *template.Template) string {
	if t.Meta.UsesUnifiedHTML || strings.TrimSpace(t.HTML) == "" {
		return a.unifiedHTML
	}
	return t.HTML
}

// LoadByID 按 ID 加载模板并转换为渲染层所需的结构。
func (a *templateAdapter) LoadByID(id string) (*render.Template, error) {
	t, err := a.loader.LoadByID(id)
	if err != nil {
		return nil, err
	}
	return &render.Template{
		Meta:    render.TemplateMeta{ID: t.Meta.ID},
		HTML:    a.effectiveHTML(t),
		CSS:     t.CSS,
		DirPath: t.DirPath,
	}, nil
}

// LoadAll 加载全部模板并转换为渲染层所需的结构。
func (a *templateAdapter) LoadAll() ([]*render.Template, error) {
	templates, err := a.loader.LoadAll()
	if err != nil {
		return nil, err
	}
	var result []*render.Template
	for _, t := range templates {
		result = append(result, &render.Template{
			Meta:    render.TemplateMeta{ID: t.Meta.ID},
			HTML:    a.effectiveHTML(t),
			CSS:     t.CSS,
			DirPath: t.DirPath,
		})
	}
	return result, nil
}
