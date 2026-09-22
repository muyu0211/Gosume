package setting

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"gosume/pkg/log"
	"gosume/pkg/util"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// 数据目录：查看 / 选择 / 迁移热切换（SystemService 上的方法，独立成文件便于维护）。
// 迁移范围含 SQLite 三件套、模板与自动保存子目录、AI 配置（ai_config.json）等，
// 与 pkg/app 的 OnChange 热重载回调（store 重开）配合完成目录切换。

// GetDataDir 返回当前的应用数据目录。
func (s *SystemService) GetDataDir() *util.Response {
	return util.DoRsp(util.SuccCode, "成功", s.configMgr.DataDir())
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
		log.Errorf("[setting.data_dir] SetDataDir: 访问目录失败 %s: %v", newDir, err)
		return util.DoRsp(util.ErrCode, "访问目录失败", nil)
	}
	if !info.IsDir() {
		log.Errorf("[setting.data_dir] SetDataDir: 所选路径不是目录 %s", newDir)
		return util.DoRsp(util.ErrCode, "所选路径不是目录", nil)
	}

	// 在新位置创建所需子目录
	for _, sub := range []string{"autosave", "templates", "log"} {
		if err := os.MkdirAll(filepath.Join(newDir, sub), 0755); err != nil {
			log.Errorf("[setting.data_dir] SetDataDir: 创建子目录失败 %s/%s: %v", newDir, sub, err)
			return util.DoRsp(util.ErrCode, "创建子目录失败", nil)
		}
	}

	// 把旧目录的数据迁移到新目录，并记录成功迁移的条目
	migrated, err := migrateDataDir(oldDir, newDir)
	if err != nil {
		log.Errorf("[setting.data_dir] SetDataDir: 迁移数据失败 %s -> %s: %v", oldDir, newDir, err)
		return util.DoRsp(util.ErrCode, "迁移数据失败", nil)
	}

	// 持久化配置并触发 OnChange 回调（各 store 切换到新目录）
	if err := s.configMgr.SetDataDir(newDir); err != nil {
		log.Errorf("[setting.data_dir] SetDataDir: 保存配置失败: %v", err)
		return util.DoRsp(util.ErrCode, "保存配置失败", nil)
	}

	// 清理旧目录——只删除已确认迁移成功的条目，避免误删
	cleanMigrated(oldDir, migrated)

	log.Infof("[setting.data_dir] SetDataDir: 数据目录已切换 %s -> %s", oldDir, newDir)
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

	files := []string{"gosume.db", "gosume.db-wal", "gosume.db-shm", "recent.json", "ai_config.json"}
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
