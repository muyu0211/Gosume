package app

import (
	"embed"
	"fmt"
	"os"
	"path/filepath"
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

// App holds all initialized components and manages the application lifecycle.
type App struct {
	wailsApp  *application.App
	stopWatch chan struct{}
}

// New initializes all components and returns an App ready to run.
//
// appCfg 为应用级编译期配置（来自 app.yaml），用于驱动窗口尺寸、版本号等
// 框架级参数；与 pkg/config 用户运行时配置 config.json 区分。
func New(assets, builtinTemplates embed.FS, appCfg *appconfig.AppConfig) *App {
	// Config
	configMgr := initConfig()

	// Logger
	dataDir := configMgr.DataDir()
	os.MkdirAll(filepath.Join(dataDir, "autosave"), 0755)
	log.Init(dataDir, appCfg.App.Name, log.INFO, true)
	log.Info("[main] data dir: %s", dataDir)
	log.Info("[main] app version: %s", appCfg.App.Version)

	// Data stores
	resumeStore := initResumeStore(dataDir)
	templateStore := initTemplateStore(resumeStore, builtinTemplates)
	initLegacyMigration(templateStore, dataDir)

	// Template loader
	templateLoader := template.NewLoader(templateStore)
	stopWatch := initDevWatcher(templateStore)

	// 统一 HTML（Gosume 一期改造）：全应用共享一份，模板包不再携带 HTML。
	// 已迁移模板（uses_unified_html=true）或模板无自带 HTML 时，渲染/预览使用它。
	unifiedHTML, err := builtinTemplates.ReadFile("templates/template.html")
	if err != nil {
		log.Error("[main] read template.html: %v", err)
		unifiedHTML = []byte{}
	}

	// Render & export
	htmlRenderer := render.NewHTMLRenderer(&templateAdapter{loader: templateLoader, unifiedHTML: string(unifiedHTML)})
	exportManager := initExportManager()

	// Project store
	projectStore := store.NewProjectStore(dataDir)

	// Services
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

	// Wails app & window
	wailsApp, win := createWailsApp(assets, svcs, appCfg)

	// Dependency injection
	resumeSvc.Inject(resumeStore, htmlRenderer)
	templateSvc.Inject(wailsApp, templateLoader, templateStore, string(unifiedHTML))
	exportSvc.Inject(wailsApp, exportManager)
	fileSvc.Inject(wailsApp, projectStore, resumeSvc)
	systemSvc.Inject(wailsApp, configMgr, win, appCfg)

	// Events
	registerEvents()

	// Data directory change callback
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

// Run starts the application event loop.
func (a *App) Run() {
	if a.stopWatch != nil {
		defer close(a.stopWatch)
	}
	defer log.Close()
	if err := a.wailsApp.Run(); err != nil {
		log.Fatal("%v", err)
	}
}

// --- init helpers ---

func initConfig() *config.Manager {
	configRoot := service.GetConfigRoot()
	os.MkdirAll(configRoot, 0755)
	configPath := filepath.Join(configRoot, "config.json")

	configMgr, err := config.NewManager(configPath)
	if err != nil {
		panic(fmt.Sprintf("Failed to init config manager: %v", err))
	}

	// One-time migration: move old data from configRoot to configRoot/data/
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

func initResumeStore(dataDir string) *store.ResumeStore {
	s, err := store.NewResumeStore(dataDir)
	if err != nil {
		panic(fmt.Sprintf("Failed to open resume store: %v", err))
	}
	return s
}

func initTemplateStore(resumeStore *store.ResumeStore, builtinTemplates embed.FS) *store.TemplateStore {
	s, err := store.NewTemplateStore(resumeStore.DB(), builtinTemplates)
	if err != nil {
		panic(fmt.Sprintf("Failed to init template store: %v", err))
	}
	return s
}

func initLegacyMigration(templateStore *store.TemplateStore, dataDir string) {
	legacyDir := filepath.Join(dataDir, "templates")
	if imported, _ := templateStore.ImportFromFilesystem(legacyDir); imported > 0 {
		log.Info("[main] migrated %d user templates from %s", imported, legacyDir)
		os.Rename(legacyDir, legacyDir+"_migrated_backup")
	}
}

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

func initExportManager() *export.ExportManager {
	browser := export.NewBrowserManager()
	return export.NewExportManager(browser)
}

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
	win := app.Window.NewWithOptions(winOpts)

	return app, win
}

func registerEvents() {
	application.RegisterEvent[int]("export:progress")
	application.RegisterEvent[string]("export:completed")
	application.RegisterEvent[string]("file:opened")
	application.RegisterEvent[string]("file:saved")
	application.RegisterEvent[string]("config:datadir-changed")
}

// --- adapters ---

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
