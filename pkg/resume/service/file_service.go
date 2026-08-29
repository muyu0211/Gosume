package service

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"gosume/pkg/event"
	"gosume/pkg/log"
	"gosume/pkg/resume/model"
	"gosume/pkg/resume/repo"
	"gosume/pkg/resume/template"
	"gosume/pkg/util"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// FileService 处理 .gosume 简历文件的导出、解析预览与导入。
type FileService struct {
	app            *application.App
	resumeStore    *repo.ResumeRepo
	templateLoader *template.Loader
	resumeSvc      *ResumeService
}

// ServiceName 返回服务名，供 Wails 绑定与前端调用使用。
func (s *FileService) ServiceName() string {
	return "FileService"
}

// Inject 注入依赖。
func (s *FileService) Inject(app *application.App, resumeStore *repo.ResumeRepo, templateLoader *template.Loader, resumeSvc *ResumeService) {
	s.app = app
	s.resumeStore = resumeStore
	s.templateLoader = templateLoader
	s.resumeSvc = resumeSvc
}

// ExportFile 把当前简历导出为 .gosume 文件。
//
// 弹出保存对话框让用户选择路径；用户取消时返回成功响应且 data 为空串。
func (s *FileService) ExportFile() *util.Response {
	r := s.resumeSvc.GetResume()
	resume, _ := r.Data.(*model.Resume)
	if resume == nil {
		log.Errorf("[file_service] ExportFile: 未加载简历")
		return util.DoRsp(util.ErrCode, "未加载简历，无法导出", nil)
	}

	// 模板显示名：id 匹配失败时按 name 兜底（导入端 ResolveTemplate 同样先 id 后 name）。
	templateName := ""
	if t, err := s.templateLoader.LoadByID(resume.Meta.TemplateID); err == nil && t != nil {
		templateName = t.Meta.Name
	}

	// 构建信封
	envelope := Build(resume, util.AppVersion(), templateName)
	if envelope == nil {
		log.Errorf("[file_service] ExportFile: 构建信封失败")
		return util.DoRsp(util.ErrCode, "导出失败：简历数据为空", nil)
	}
	data, err := envelope.Marshal()
	if err != nil {
		log.Errorf("[file_service] ExportFile: 序列化信封失败: %v", err)
		return util.DoRsp(util.ErrCode, "导出失败", nil)
	}

	// 弹出保存对话框
	filePath, err := s.app.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:    "导出简历文件",
		Filename: fmt.Sprintf("%s.gosume", resume.Meta.Name),
		Filters: []application.FileFilter{
			{DisplayName: "Gosume 简历文件 (*.gosume)", Pattern: "*.gosume"},
			{DisplayName: "所有文件 (*.*)", Pattern: "*.*"},
		},
	}).PromptForSingleSelection()
	if err != nil {
		if util.IsCancel(err) {
			return util.DoRsp(util.SuccCode, "已取消", "")
		}
		log.Errorf("[file_service] ExportFile: 保存对话框失败: %v", err)
		return util.DoRsp(util.ErrCode, "打开保存对话框失败", nil)
	}
	if filePath == "" {
		return util.DoRsp(util.SuccCode, "已取消", "")
	}

	if err := os.WriteFile(filePath, data, 0o644); err != nil {
		log.Errorf("[file_service] ExportFile: 写入文件失败 %s: %v", filePath, err)
		return util.DoRsp(util.ErrCode, "导出失败", nil)
	}

	log.Infof("[file_service] ExportFile: 已导出 %s", filePath)
	return util.DoRsp(util.SuccCode, "成功", filePath)
}

// ParseFile 弹出文件选择对话框，解析并校验 .gosume 文件，
// 返回预览数据（已校验、未落库）。
func (s *FileService) ParseFile() *util.Response {
	filePath, err := s.app.Dialog.OpenFile().
		SetTitle("打开简历文件").
		AddFilter("Gosume 简历文件 (*.gosume)", "*.gosume").
		AddFilter("所有文件 (*.*)", "*.*").
		CanChooseFiles(true).
		PromptForSingleSelection()
	if err != nil {
		if util.IsCancel(err) {
			return util.DoRsp(util.SuccCode, "已取消", nil)
		}
		log.Errorf("[file_service] ParseFile: 打开文件对话框失败: %v", err)
		return util.DoRsp(util.ErrCode, "打开文件对话框失败", nil)
	}
	if filePath == "" {
		return util.DoRsp(util.SuccCode, "已取消", nil)
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		log.Errorf("[file_service] ParseFile: 读取文件失败 %s: %v", filePath, err)
		return util.DoRsp(util.ErrCode, "读取文件失败", nil)
	}

	var envelope ExportEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		log.Errorf("[file_service] ParseFile: 解析信封失败: %v", err)
		return util.DoRsp(util.ErrCode, "文件格式不正确，无法解析", nil)
	}
	if envelope.Data == nil {
		return util.DoRsp(util.ErrCode, "文件内容为空", nil)
	}

	// 校验模板是否存在
	resolution := template.ResolveTemplate(
		s.templateLoader,
		envelope.Data.Meta.TemplateID,
		envelope.TemplateName,
	)

	result := FileParseResult{
		FormatVersion: envelope.FormatVersion,
		ExportedAt:    envelope.ExportedAt,
		AppVersion:    envelope.AppVersion,
		Resume:        envelope.Data,
		Template:      resolution,
		Summary:       summarizeResume(envelope.Data),
	}
	return util.DoRsp(util.SuccCode, "成功", &result)
}

// ImportFile 导入 .gosume 简历：target_id 为空时新建，否则覆盖。
//
// 应用用户最终选定的模板后落库，并发出 file:imported 事件。
func (s *FileService) ImportFile(req FileImportRequest) *util.Response {
	if req.Resume == nil {
		return util.DoRsp(util.ErrCode, "导入数据为空", nil)
	}
	if req.Resume.Version == "" {
		req.Resume.Version = model.SchemaVersion
	}
	req.Resume.Meta.TemplateID = req.TemplateID

	var (
		id   string
		mode string
		err  error
	)
	if req.TargetID == "" {
		id, err = s.resumeStore.Create(req.Resume)
		mode = "new"
	} else {
		err = s.resumeStore.Update(req.TargetID, req.Resume)
		id = req.TargetID
		mode = "overwrite"
	}
	if err != nil {
		log.Errorf("[file_service] ImportFile: 导入失败: %v", err)
		return util.DoRsp(util.ErrCode, "导入失败", nil)
	}

	s.app.Event.Emit(event.FILE_IMPORTED, id)
	log.Infof("[file_service] ImportFile: 导入成功 id=%s mode=%s", id, mode)
	return util.DoRsp(util.SuccCode, "成功", FileImportResponse{ID: id, Mode: mode})
}

// FileParseResult 是 ParseFile 返回的预览数据（已校验、未落库），
// 与前端 types/gosume_file.ts 的 FileParseResult 结构对齐。
type FileParseResult struct {
	FormatVersion string                      `json:"format_version"`
	ExportedAt    time.Time                   `json:"exported_at"`
	AppVersion    string                      `json:"app_version"`
	Resume        *model.Resume               `json:"resume"`
	Template      template.TemplateResolution `json:"template"`
	Summary       ResumeSummary               `json:"summary"`
}

// ResumeSummary 是导入预览的简历内容摘要，与前端 ResumeSummary 对齐。
type ResumeSummary struct {
	Name      string `json:"name"`
	Jobs      int    `json:"jobs"`
	Education int    `json:"education"`
	Projects  int    `json:"projects"`
	Skills    int    `json:"skills"`
	Languages int    `json:"languages"`
	Awards    int    `json:"awards"`
}

// FileImportRequest 是 ImportFile 的请求参数，与前端 FileImportRequest 对齐。
type FileImportRequest struct {
	Resume     *model.Resume `json:"resume"`
	TargetID   string        `json:"target_id"`   // 空 = 新建；非空 = 覆盖该 ID 简历
	TemplateID string        `json:"template_id"` // 最终确定的模板 id（matched_id 或用户选择）
}

// FileImportResponse 是 ImportFile 的返回结果，与前端 FileImportResponse 对齐。
type FileImportResponse struct {
	ID   string `json:"id"`
	Mode string `json:"mode"` // "new" | "overwrite"
}

// summarizeResume 统计简历各区块条目数，用于导入预览摘要。
func summarizeResume(r *model.Resume) ResumeSummary {
	return ResumeSummary{
		Name:      r.Personal.FullName,
		Jobs:      len(r.Jobs),
		Education: len(r.Education),
		Projects:  len(r.Projects),
		Skills:    len(r.Skills),
		Languages: len(r.Languages),
		Awards:    len(r.Awards),
	}
}

// FormatVersion 当前信封格式版本。信封字段结构变化（增删字段）时递增。
// 与简历数据 schema 版本（model.SchemaVersion）相互独立。
const FormatVersion = "1.0"

// ExportEnvelope .gosume 文件的最外层结构。
type ExportEnvelope struct {
	FormatVersion string        `json:"format_version"`          // 信封格式版本，恒为 FormatVersion
	Data          *model.Resume `json:"data"`                    // 简历完整数据（与 DB 存储结构一致）
	ExportedAt    time.Time     `json:"exported_at"`             // 导出时间
	AppVersion    string        `json:"app_version"`             // 导出方应用版本（config.GlobalConfig.App.Version）
	TemplateName  string        `json:"template_name,omitempty"` // 模板显示名（id 匹配失败时按 name 兜底）
}

// Build 把当前简历打包为可导出的信封：
//
//   - 剥离布局档位：page_margin / section_spacing / font_size 归一化为全局
//     默认常量（normal / normal / medium），防止接收方不存在自定义档位导致
//     样式解析失败（与 AGENTS.md「两侧均须保留 normal 档作为回退」对齐）；
//   - 不删字段（保持 Resume JSON 形状完整，前端类型无需可选化）；
//   - 原始 resume 不被修改，导出的是副本。
//
// resume 为 nil 时返回 nil，由调用方处理。
func Build(resume *model.Resume, appVersion, templateName string) *ExportEnvelope {
	if resume == nil {
		return nil
	}
	return &ExportEnvelope{
		FormatVersion: FormatVersion,
		ExportedAt:    time.Now(),
		AppVersion:    appVersion,
		TemplateName:  templateName,
		Data:          exportData(resume),
	}
}

// exportData 返回剥离布局档位后的导出副本（不改原始 resume）。
func exportData(r *model.Resume) *model.Resume {
	out := *r
	m := r.Meta
	m.PageMargin = model.PageMarginNormal
	m.SectionSpacing = model.SectionSpacingNormal
	m.FontSize = model.FontSizeMedium
	out.Meta = m
	return &out
}

// Marshal 序列化为缩进 JSON（纯文本、可读、git 友好）。
func (e *ExportEnvelope) Marshal() ([]byte, error) {
	return json.MarshalIndent(e, "", "  ")
}
