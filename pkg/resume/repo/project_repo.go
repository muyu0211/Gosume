package repo

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"gosume/pkg/resume/model"
)

// ProjectRepo 负责 .resume.json 项目文件的读写，以及最近打开文件的维护。
type ProjectRepo struct {
	dataDir string
	db      *sql.DB
}

// NewProjectRepo 创建项目文件存储。
func NewProjectRepo(dataDir string) *ProjectRepo {
	return &ProjectRepo{dataDir: dataDir}
}

// SetDataDir 更新自动保存与最近文件所使用的数据目录，用于数据目录热切换。
func (s *ProjectRepo) SetDataDir(dir string) {
	s.dataDir = dir
}

// Load 读取 .resume.json 文件并解析为 Resume，同时记入最近打开列表。
func (s *ProjectRepo) Load(filePath string) (*model.Resume, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("read file: %w", err)
	}

	resume, err := model.Migrate(data)
	if err != nil {
		return nil, fmt.Errorf("migrate data: %w", err)
	}

	s.addRecentFile(filePath, resume)
	return resume, nil
}

// Save 以原子方式把 Resume 写入 .resume.json 文件（先写 .tmp 再 rename），
// 并刷新 meta.updated_at 与最近打开列表。
func (s *ProjectRepo) Save(filePath string, resume *model.Resume) error {
	resume.Meta.UpdatedAt = time.Now()

	data, err := json.MarshalIndent(resume, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	tmpPath := filePath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, filePath); err != nil {
		return err
	}

	s.addRecentFile(filePath, resume)
	return nil
}

// SaveAutoSave 把简历保存到数据目录下的 autosave 子目录。
func (s *ProjectRepo) SaveAutoSave(resume *model.Resume) error {
	autosaveDir := filepath.Join(s.dataDir, "autosave")
	os.MkdirAll(autosaveDir, 0755)

	path := filepath.Join(autosaveDir, "autosave.resume.json")
	return s.Save(path, resume)
}

// LoadAutoSave 尝试加载自动保存文件；文件不存在时返回 (nil, nil)。
func (s *ProjectRepo) LoadAutoSave() (*model.Resume, error) {
	path := filepath.Join(s.dataDir, "autosave", "autosave.resume.json")
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil, nil
	}
	return s.Load(path)
}

// RecentFile 是最近打开文件列表中的一项。
type RecentFile struct {
	Path      string    `json:"path"`
	Name      string    `json:"name"`
	UpdatedAt time.Time `json:"updated_at"`
}

// GetRecentFiles 返回最近打开的文件列表；列表文件不存在时返回空切片。
func (s *ProjectRepo) GetRecentFiles() ([]RecentFile, error) {
	recentPath := filepath.Join(s.dataDir, "recent.json")
	data, err := os.ReadFile(recentPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []RecentFile{}, nil
		}
		return nil, err
	}

	var files []RecentFile
	json.Unmarshal(data, &files)
	return files, nil
}

// addRecentFile 把文件置顶到最近打开列表：去重后前插，并截断至 20 条。
// 该操作属于辅助记录，失败不影响主流程，故忽略错误。
func (s *ProjectRepo) addRecentFile(path string, resume *model.Resume) {
	recentPath := filepath.Join(s.dataDir, "recent.json")

	files, _ := s.GetRecentFiles()

	// 移除同路径的旧条目，避免重复
	for i, f := range files {
		if f.Path == path {
			files = append(files[:i], files[i+1:]...)
			break
		}
	}

	// 前插新条目；无姓名时用文件名兜底
	name := resume.Personal.FullName
	if name == "" {
		name = filepath.Base(path)
	}
	files = append([]RecentFile{{
		Path:      path,
		Name:      name,
		UpdatedAt: time.Now(),
	}}, files...)

	// 最多保留 20 条
	if len(files) > 20 {
		files = files[:20]
	}

	data, _ := json.MarshalIndent(files, "", "  ")
	os.WriteFile(recentPath, data, 0644)
}
