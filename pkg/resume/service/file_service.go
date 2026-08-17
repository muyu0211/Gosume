package service

import (
	"gosume/pkg/resume/model"
	"gosume/pkg/resume/repo"
	"gosume/pkg/util"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// FileService 处理项目文件相关操作（打开、保存、最近打开列表）。
type FileService struct {
	app           *application.App
	projRepo      *repo.ProjectRepo
	resumeService *ResumeService
}

// ServiceName 返回服务名，供 Wails 绑定与前端调用使用。
func (s *FileService) ServiceName() string {
	return "FileService"
}

// Inject 注入依赖。
func (s *FileService) Inject(app *application.App, projectStore *repo.ProjectRepo, resumeSvc *ResumeService) {
	s.app = app
	s.projRepo = projectStore
	s.resumeService = resumeSvc
}

// OpenProject 弹出文件选择对话框，加载 .resume.json 项目文件。
//
// 加载成功后会把简历设为当前简历（身份重置）并发出 file:opened 事件。
// 用户取消选择时返回 (nil, nil)。
func (s *FileService) OpenProject() (*model.Resume, error) {
	filePath, err := s.app.Dialog.OpenFile().
		SetTitle("打开简历项目").
		AddFilter("简历项目文件 (*.resume.json)", "*.resume.json").
		AddFilter("所有文件 (*.*)", "*.*").
		CanChooseFiles(true).
		PromptForSingleSelection()
	if err != nil || filePath == "" {
		return nil, err
	}

	resume, err := s.projRepo.Load(filePath)
	if err != nil {
		return nil, util.UserWrap(err, "打开项目失败")
	}

	s.resumeService.InitResume(resume)
	s.app.Event.Emit("file:opened", filePath)

	return resume, nil
}

// SaveProject 把当前简历保存到文件，并返回最终写入的路径。
//
// filePath 为空时弹出保存对话框让用户选择路径；用户取消时返回空路径且不报错。
// 保存成功后发出 file:saved 事件。
func (s *FileService) SaveProject(filePath string) (string, error) {
	resume := s.resumeService.GetResume()
	if resume == nil {
		return "", util.UserMsg("未加载简历，无法保存")
	}

	if filePath == "" {
		var err error
		filePath, err = s.app.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
			Title:    "保存简历项目",
			Filename: "我的简历.resume.json",
			Filters: []application.FileFilter{
				{DisplayName: "简历项目文件 (*.resume.json)", Pattern: "*.resume.json"},
			},
		}).PromptForSingleSelection()
		if err != nil || filePath == "" {
			if util.IsCancel(err) {
				return "", nil
			}
			return "", util.UserWrap(err, "打开保存对话框失败")
		}
	}

	if err := s.projRepo.Save(filePath, resume); err != nil {
		return "", util.UserWrap(err, "保存项目失败")
	}

	s.app.Event.Emit("file:saved", filePath)
	return filePath, nil
}

// GetRecentFiles 返回最近打开的文件列表。
func (s *FileService) GetRecentFiles() ([]repo.RecentFile, error) {
	return s.projRepo.GetRecentFiles()
}
