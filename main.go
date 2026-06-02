package main

import (
	"embed"
	"fmt"
	"os"
	"path/filepath"

	"gosume/pkg/config"
	"gosume/pkg/export"
	"gosume/pkg/log"
	"gosume/pkg/model"
	"gosume/pkg/render"
	"gosume/pkg/service"
	"gosume/pkg/store"
	"gosume/pkg/template"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Config.json lives at the root of the default directory, which never changes.
	// User data defaults to a "data" subdirectory but can be changed by the user.
	configRoot := service.GetConfigRoot()
	os.MkdirAll(configRoot, 0755)
	configPath := filepath.Join(configRoot, "config.json")

	configMgr, err := config.NewManager(configPath)
	if err != nil {
		panic(fmt.Sprintf("Failed to init config manager: %v", err))
	}

	// One-time migration: move old data from configRoot to configRoot/data/
	// (previous versions stored user data alongside config.json at the root).
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

	// Effective data directory (user-configured or default).
	dataDir := configMgr.DataDir()
	os.MkdirAll(filepath.Join(dataDir, "autosave"), 0755)
	os.MkdirAll(filepath.Join(dataDir, "templates"), 0755)

	// 初始化日志
	log.Init(dataDir, "ResumeCraft", log.INFO, true)
	defer log.Close()

	log.Info("[main] data dir: %s", dataDir)

	templateLoader := template.NewLoader("./templates", filepath.Join(dataDir, "templates"))
	htmlRenderer := render.NewHTMLRenderer(&templateAdapter{loader: templateLoader})

	htmlExportAdapter := &htmlExportAdapter{renderer: htmlRenderer}
	pdfExporter := export.NewPDFExporter(htmlExportAdapter)
	docxExporter := export.NewDOCXExporter(htmlExportAdapter)
	pngExporter := export.NewPNGExporter(htmlExportAdapter)
	exportManager := export.NewExportManager(pdfExporter, docxExporter, pngExporter, htmlExportAdapter)

	projectStore := store.NewProjectStore(dataDir)
	resumeStore, err := store.NewResumeStore(dataDir)
	if err != nil {
		panic(fmt.Sprintf("Failed to open resume store: %v", err))
	}
	defer resumeStore.Close()

	resumeService := &service.ResumeService{}
	templateService := &service.TemplateService{}
	exportService := &service.ExportService{}
	fileService := &service.FileService{}
	systemService := &service.SystemService{}

	app := application.New(application.Options{
		Name:        "Gosume",
		Description: "桌面级简历制作工具",
		Services: []application.Service{
			application.NewService(resumeService),
			application.NewService(templateService),
			application.NewService(exportService),
			application.NewService(fileService),
			application.NewService(systemService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
	})

	application.RegisterEvent[int]("export:progress")
	application.RegisterEvent[string]("export:completed")
	application.RegisterEvent[string]("file:opened")
	application.RegisterEvent[string]("file:saved")
	application.RegisterEvent[string]("config:datadir-changed")

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:     "Gosume",
		Width:     1280,
		Height:    800,
		MinWidth:  960,
		MinHeight: 600,
		URL:       "/",
	})

	// 依赖注入
	resumeService.Inject(resumeStore, htmlRenderer)
	templateService.Inject(templateLoader)
	exportService.Inject(app, exportManager, resumeService)
	fileService.Inject(app, projectStore, resumeService)
	systemService.Inject(app, configMgr)

	// Register hot-reload callback for data directory changes.
	configMgr.OnChange(func(oldDir, newDir string) {
		log.Info("[main] data dir change: %s -> %s", oldDir, newDir)

		// 1. Flush and close old logger
		log.Close()

		// 2. Reopen stores at new location
		if err := resumeStore.Reopen(newDir); err != nil {
			log.Error("[main] failed to reopen resume store at %s: %v", newDir, err)
			configMgr.SetDataDir(oldDir)
			return
		}

		// 3. Update project store
		projectStore.SetDataDir(newDir)

		// 4. Update template loader user dir
		templateLoader.SetUserDir(filepath.Join(newDir, "templates"))

		// 5. Reinitialize logger at new location
		log.Init(newDir, "ResumeCraft", log.INFO, true)

		// 6. Re-inject services with updated dependencies
		resumeService.Inject(resumeStore, htmlRenderer)
		templateService.Inject(templateLoader)
		fileService.Inject(app, projectStore, resumeService)

		// 7. Notify frontend
		app.Event.Emit("config:datadir-changed", newDir)

		log.Info("[main] hot-reload complete, new data dir: %s", newDir)
	})

	// 启动应用
	if err := app.Run(); err != nil {
		log.Fatal("%v", err)
	}
}

// templateAdapter adapts template.Loader to render.TemplateLoader
type templateAdapter struct {
	loader *template.Loader
}

func (a *templateAdapter) LoadByID(id string) (*render.Template, error) {
	t, err := a.loader.LoadByID(id)
	if err != nil {
		return nil, err
	}
	return &render.Template{
		Meta:    render.TemplateMeta{ID: t.Meta.ID},
		HTML:    t.HTML,
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
			HTML:    t.HTML,
			CSS:     t.CSS,
			DirPath: t.DirPath,
		})
	}
	return result, nil
}

// htmlExportAdapter adapts render.HTMLRenderer to export.HTMLRenderer
type htmlExportAdapter struct {
	renderer *render.HTMLRenderer
}

func (a *htmlExportAdapter) Render(resume *model.Resume) (string, error) {
	return a.renderer.Render(resume)
}
