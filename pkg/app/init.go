package app

import (
	"embed"
	"fmt"
	"gosume/pkg/log"
	"gosume/pkg/resume/repo"
	"os"
	"path/filepath"
)

// --- 初始化辅助函数 ---
// initResumeStore 打开简历存储；失败属于不可恢复错误，直接 panic。
func initResumeStore(dataDir string) *repo.ResumeRepo {
	s, err := repo.NewResumeStore(dataDir)
	if err != nil {
		panic(fmt.Sprintf("Failed to open resume store: %v", err))
	}
	return s
}

// initTemplateStore 初始化模板存储，复用简历存储的数据库连接。
// 失败属于不可恢复错误，直接 panic。
func initTemplateStore(resumeStore *repo.ResumeRepo, builtinTemplates embed.FS) *repo.TemplateRepo {
	s, err := repo.NewTemplateStore(resumeStore.DB(), builtinTemplates)
	if err != nil {
		panic(fmt.Sprintf("Failed to init template store: %v", err))
	}
	return s
}

// initLegacyMigration 把历史的文件式用户模板导入数据库，
// 导入成功后将原目录改名备份，避免重复导入。
func initLegacyMigration(templateStore *repo.TemplateRepo, dataDir string) {
	legacyDir := filepath.Join(dataDir, "templates")
	if imported, _ := templateStore.ImportFromFilesystem(legacyDir); imported > 0 {
		log.Infof("[main] migrated %d user templates from %s", imported, legacyDir)
		os.Rename(legacyDir, legacyDir+"_migrated_backup")
	}
}

// initDevWatcher 在工作目录存在 ./templates 时启动模板热重载监听。
// 该目录仅在开发环境存在，因此生产构建下返回 nil。
func initDevWatcher(templateStore *repo.TemplateRepo) chan struct{} {
	if _, err := os.Stat("./templates"); err == nil {
		stopWatch, err := templateStore.WatchDir("./templates")
		if err != nil {
			log.Warnf("[main] failed to start template watcher: %v", err)
			return nil
		}
		return stopWatch
	}
	return nil
}
