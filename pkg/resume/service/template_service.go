package service

import (
	"fmt"
	"strings"

	"gosume/pkg/log"
	"gosume/pkg/resume/model"
	"gosume/pkg/resume/repo"
	"gosume/pkg/resume/template"
	"gosume/pkg/resume/vo"
	"gosume/pkg/util"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// TemplateService 管理模板的查询、增删改与导入。
type TemplateService struct {
	App      *application.App
	loader   *template.Loader // 模板加载器
	tempRepo *repo.TemplateRepo
	HTML     string
}

// ServiceName 返回服务名，供 Wails 绑定与前端调用使用。
func (s *TemplateService) ServiceName() string {
	return "TemplateService"
}

// Inject 注入依赖。unifiedHTML 为应用内置的统一简历 HTML 骨架。
func (s *TemplateService) Inject(app *application.App, loader *template.Loader, store *repo.TemplateRepo, unifiedHTML string) {
	s.App = app
	s.loader = loader
	s.tempRepo = store
	s.HTML = unifiedHTML
}

// ListTemplates 返回所有可用模板的元数据（内置 + 用户模板）。
func (s *TemplateService) ListTemplates() *util.Response {
	templates, err := s.loader.LoadAll()
	if err != nil {
		log.Errorf("[template_service] ListTemplates: 加载模板列表失败: %v", err)
		return util.DoRsp(util.ErrCode, fmt.Sprintf("加载模板列表失败: %s", err.Error()), nil)
	}

	var metas []vo.TemplateMeta
	for _, t := range templates {
		metas = append(metas, getTemplateMeta(t))
	}
	log.Infof("[template_service] ListTemplates: 共 %d 个模板", len(metas))
	return util.DoRsp(util.SuccCode, "成功", metas)
}

// GetTemplate 返回单个模板的元数据。
func (s *TemplateService) GetTemplate(id string) *util.Response {
	t, err := s.loader.LoadByID(id)
	if err != nil {
		log.Errorf("[template_service] GetTemplate: 模板不存在 id=%s: %v", id, err)
		return util.DoRsp(util.ErrCode, "模板不存在", nil)
	}
	meta := getTemplateMeta(t)
	return util.DoRsp(util.SuccCode, "成功", &meta)
}

// effectiveHTML 返回模板实际使用的 HTML：已迁移到统一骨架（uses_unified_html）
// 或模板无自带 HTML 时使用应用内置的 template.html（Gosume 一期改造）。
func (s *TemplateService) effectiveHTML(t *template.Template) string {
	if t.Meta.UseUnifiedHTML || strings.TrimSpace(t.HTML) == "" {
		return s.HTML
	}
	return t.HTML
}

// GetTemplateContent 返回模板的 HTML、CSS 及纸张规格。
func (s *TemplateService) GetTemplateContent(id string) *util.Response {
	t, err := s.loader.LoadByID(id)
	if err != nil {
		log.Errorf("[template_service] GetTemplateContent: 模板不存在 id=%s: %v", id, err)
		return util.DoRsp(util.ErrCode, "模板不存在", nil)
	}
	orientation := ""
	if len(t.Meta.Orientations) > 0 {
		orientation = t.Meta.Orientations[0]
	}
	return util.DoRsp(util.SuccCode, "成功", &vo.TemplateContent{
		HTML:        s.effectiveHTML(t),
		CSS:         t.CSS,
		PaperSize:   t.Meta.PaperSize,
		Orientation: orientation,
	})
}

// ImportTemplateResult 是用户模板包安装成功后返回给前端的结果。
type ImportTemplateResult struct {
	ID      string          `json:"id"`
	Name    string          `json:"name"`
	Version string          `json:"version"`
	Meta    vo.TemplateMeta `json:"meta"`
}

// ImportTemplatePackage 弹出原生文件对话框，导入本地 .zip 模板包。
// 用户取消选择时返回成功响应且 data 为空串。
func (s *TemplateService) ImportTemplatePackage() *util.Response {
	if s.App == nil {
		return util.DoRsp(util.ErrCode, "应用未初始化", nil)
	}

	filePath, err := s.App.Dialog.OpenFile().
		SetTitle("导入模板包").
		AddFilter("ZIP 文件 (*.zip)", "*.zip").
		AddFilter("所有文件 (*.*)", "*.*").
		CanChooseFiles(true).
		PromptForSingleSelection()
	if err != nil {
		if util.IsCancel(err) {
			return util.DoRsp(util.SuccCode, "已取消", "")
		}
		return util.DoRsp(util.ErrCode, "打开文件对话框失败", nil)
	}
	if filePath == "" {
		return util.DoRsp(util.SuccCode, "已取消", "")
	}
	return s.importTemplatePackageFromPath(filePath)
}

// importTemplatePackageFromPath 从指定路径解析并安装模板包。
// 解析 ZIP → 校验 ID 未被占用 → 写入 SQLite → 返回结果。
func (s *TemplateService) importTemplatePackageFromPath(filePath string) *util.Response {
	if strings.TrimSpace(filePath) == "" {
		return util.DoRsp(util.ErrCode, "模板包路径不能为空", nil)
	}

	pkg, err := template.LoadPackageFromZip(filePath)
	if err != nil {
		log.Errorf("[template_service] importTemplatePackageFromPath: 解析模板包失败 %s: %v", filePath, err)
		return util.DoRsp(util.ErrCode, fmt.Sprintf("解析模板包失败: %v", err), nil)
	}

	// 检查模板 ID 是否已经存在，存在则判断version
	if existing, _ := s.loader.LoadByID(pkg.Meta.ID); existing != nil {
		log.Warnf("[template_service] importTemplatePackageFromPath: 模板已存在 id=%s", pkg.Meta.ID)
		// 如果版本号相同，则提示用户模板已经存在，提示用户是否需要覆盖/不覆盖
		return util.DoRsp(util.ErrCode, "模板已存在", nil)
	}

	if err := s.tempRepo.Create(pkg.Meta, pkg.CSS); err != nil {
		log.Errorf("[template_service] importTemplatePackageFromPath: 保存模板失败 id=%s: %v", pkg.Meta.ID, err)
		return util.DoRsp(util.ErrCode, fmt.Sprintf("保存模板失败: %v", err), nil)
	}

	log.Infof("[template_service] importTemplatePackageFromPath: 已导入模板 id=%s name=%s", pkg.Meta.ID, pkg.Meta.Name)
	meta := getTemplateMeta(&template.Template{
		Meta:      pkg.Meta,
		CSS:       pkg.CSS,
		IsBuiltin: false,
	})
	return util.DoRsp(util.SuccCode, "成功", &ImportTemplateResult{
		ID:      pkg.Meta.ID,
		Name:    pkg.Meta.Name,
		Version: pkg.Meta.Version,
		Meta:    meta,
	})
}

// ValidateForTemplate 校验简历数据是否满足指定模板的要求。
func (s *TemplateService) ValidateForTemplate(templateID string, resume *model.Resume) *util.Response {
	t, err := s.loader.LoadByID(templateID)
	if err != nil {
		return util.DoRsp(util.SuccCode, "成功", &template.ValidationResult{
			Valid:  false,
			Errors: []string{fmt.Sprintf("模板不存在: %s", templateID)},
		})
	}
	return util.DoRsp(util.SuccCode, "成功", template.ValidateDataForTemplate(t, resume))
}

// CreateTemplate 创建一个用户模板。
func (s *TemplateService) CreateTemplate(meta template.Meta, css string) *util.Response {
	if meta.ID == "" {
		log.Errorf("[template_service] CreateTemplate: 模板 ID 不能为空")
		return util.DoRsp(util.ErrCode, "模板 ID 不能为空", nil)
	}
	if err := s.tempRepo.Create(meta, css); err != nil {
		log.Errorf("[template_service] CreateTemplate: 创建模板失败 id=%s: %v", meta.ID, err)
		return util.DoRsp(util.ErrCode, err.Error(), nil)
	}
	log.Infof("[template_service] CreateTemplate: 已创建模板 id=%s", meta.ID)
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// UpdateTemplate 更新已存在的用户模板。
func (s *TemplateService) UpdateTemplate(id string, meta template.Meta, css string) *util.Response {
	if meta.ID == "" {
		log.Errorf("[template_service] UpdateTemplate: 模板 ID 不能为空")
		return util.DoRsp(util.ErrCode, "模板 ID 不能为空", nil)
	}
	if err := s.tempRepo.Update(id, meta, css); err != nil {
		log.Errorf("[template_service] UpdateTemplate: 更新模板失败 id=%s: %v", id, err)
		return util.DoRsp(util.ErrCode, fmt.Sprintf("更新模板失败: %v", err), nil)
	}
	log.Infof("[template_service] UpdateTemplate: 已更新模板 id=%s", id)
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// DeleteTemplate 软删除用户模板。
func (s *TemplateService) DeleteTemplate(id string) *util.Response {
	if id == "" {
		log.Errorf("[template_service] DeleteTemplate: 模板 ID 不能为空")
		return util.DoRsp(util.ErrCode, "模板 ID 不能为空", nil)
	}
	if err := s.tempRepo.SoftDelete(id); err != nil {
		log.Errorf("[template_service] DeleteTemplate: 删除模板失败 id=%s: %v", id, err)
		return util.DoRsp(util.ErrCode, err.Error(), nil)
	}
	log.Infof("[template_service] DeleteTemplate: 已删除模板 id=%s", id)
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// CloneTemplate 把模板（内置或用户）复制为一个新的用户模板。
// 新模板版本号重置为 1.0.0。
func (s *TemplateService) CloneTemplate(sourceID, newID string) *util.Response {
	if newID == "" {
		return util.DoRsp(util.ErrCode, "新模板 ID 不能为空", nil)
	}

	src, err := s.loader.LoadByID(sourceID)
	if err != nil {
		log.Errorf("[template_service] CloneTemplate: 源模板不存在 id=%s: %v", sourceID, err)
		return util.DoRsp(util.ErrCode, fmt.Sprintf("模板不存在: %v", err), nil)
	}

	meta := src.Meta
	meta.ID = newID
	meta.Version = "1.0.0"

	// 检查新 ID 是否已被占用
	if existing, _ := s.loader.LoadByID(newID); existing != nil {
		log.Warnf("[template_service] CloneTemplate: 新模板 ID 已被占用 id=%s", newID)
		return util.DoRsp(util.ErrCode, "模板 ID 已被占用", nil)
	}

	if err := s.tempRepo.Create(meta, src.CSS); err != nil {
		log.Errorf("[template_service] CloneTemplate: 克隆模板失败 source=%s new=%s: %v", sourceID, newID, err)
		return util.DoRsp(util.ErrCode, fmt.Sprintf("克隆模板失败: %v", err), nil)
	}

	log.Infof("[template_service] CloneTemplate: 已克隆模板 %s -> %s", sourceID, newID)
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// getTemplateMeta 把内部模板结构转换为面向前端的元数据视图，
// 集中处理字段映射，避免各处重复转换代码。
func getTemplateMeta(t *template.Template) vo.TemplateMeta {
	return vo.TemplateMeta{
		ID:              t.Meta.ID,
		Name:            t.Meta.Name,
		Version:         t.Meta.Version,
		Author:          t.Meta.Author,
		Description:     t.Meta.Description,
		Category:        t.Meta.Category,
		Tags:            t.Meta.Tags,
		TargetLanguage:  t.Meta.TargetLanguage,
		PageCount:       t.Meta.PageCount,
		PaperSize:       t.Meta.PaperSize,
		Colors:          t.Meta.Colors,
		Features:        t.Meta.Features,
		UsesUnifiedHTML: t.Meta.UseUnifiedHTML,
		IsBuiltin:       t.IsBuiltin,
	}
}
