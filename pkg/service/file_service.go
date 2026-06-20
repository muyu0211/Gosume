package service

import (
	"gosume/pkg/model"
	"gosume/pkg/store"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// FileService handles project file operations (open, save, recent files).
type FileService struct {
	wailsApp      *application.App
	store         *store.ProjectStore
	resumeService *ResumeService
}

// ServiceName returns the service name.
func (s *FileService) ServiceName() string {
	return "FileService"
}

// Inject sets up dependencies.
func (s *FileService) Inject(app *application.App, projectStore *store.ProjectStore, resumeSvc *ResumeService) {
	s.wailsApp = app
	s.store = projectStore
	s.resumeService = resumeSvc
}

// OpenProject opens a file dialog to select and load a .resume.json file.
func (s *FileService) OpenProject() (*model.Resume, error) {
	filePath, err := s.wailsApp.Dialog.OpenFile().
		SetTitle("打开简历项目").
		AddFilter("简历项目文件 (*.resume.json)", "*.resume.json").
		AddFilter("所有文件 (*.*)", "*.*").
		CanChooseFiles(true).
		PromptForSingleSelection()
	if err != nil || filePath == "" {
		return nil, err
	}

	resume, err := s.store.Load(filePath)
	if err != nil {
		return nil, UserWrap(err, "打开项目失败")
	}

	s.resumeService.SetResume(resume)
	s.wailsApp.Event.Emit("file:opened", filePath)

	return resume, nil
}

// SaveProject saves the current resume to a file and returns the resolved path.
func (s *FileService) SaveProject(filePath string) (string, error) {
	resume := s.resumeService.GetResume()
	if resume == nil {
		return "", UserMsg("未加载简历，无法保存")
	}

	if filePath == "" {
		var err error
		filePath, err = s.wailsApp.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
			Title:    "保存简历项目",
			Filename: "我的简历.resume.json",
			Filters: []application.FileFilter{
				{DisplayName: "简历项目文件 (*.resume.json)", Pattern: "*.resume.json"},
			},
		}).PromptForSingleSelection()
		if err != nil || filePath == "" {
			if IsCancel(err) {
				return "", nil
			}
			return "", UserWrap(err, "打开保存对话框失败")
		}
	}

	if err := s.store.Save(filePath, resume); err != nil {
		return "", UserWrap(err, "保存项目失败")
	}

	s.wailsApp.Event.Emit("file:saved", filePath)
	return filePath, nil
}

// GetRecentFiles returns the list of recently opened files.
func (s *FileService) GetRecentFiles() ([]store.RecentFile, error) {
	return s.store.GetRecentFiles()
}
