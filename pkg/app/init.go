package app

import (
	"embed"
	"fmt"
	"gosume/pkg/export"
	"gosume/pkg/log"
	"gosume/pkg/render"
	"gosume/pkg/service"
	"gosume/pkg/store"
	"gosume/pkg/template"
	"gosume/pkg/user_config"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// --- 初始化辅助函数 ---

// initConfig 初始化配置管理器，并完成历史数据目录的一次性迁移。
// 配置初始化失败属于不可恢复错误，直接 panic。
func initConfig() *user_config.Manager {
	configRoot := service.GetConfigRoot()
	os.MkdirAll(configRoot, 0755)

	configMgr, err := user_config.NewManager(configRoot)
	if err != nil {
		panic(fmt.Sprintf("Failed to init config manager: %v", err))
	}

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
