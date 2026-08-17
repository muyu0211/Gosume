package service

import (
	"fmt"
	"strings"

	"gosume/pkg/model"
	"gosume/pkg/store"
	"gosume/pkg/template"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// TemplateService 管理模板的查询、增删改与导入。
type TemplateService struct {
	wailsApp    *application.App
	loader      *template.Loader
	store       *store.TemplateStore
	unifiedHTML string
}

// ServiceName 返回服务名，供 Wails 绑定与前端调用使用。
func (s *TemplateService) ServiceName() string {
	return "TemplateService"
}

// Inject 注入依赖。unifiedHTML 为应用内置的统一简历 HTML 骨架。
func (s *TemplateService) Inject(app *application.App, loader *template.Loader, store *store.TemplateStore, unifiedHTML string) {
	s.wailsApp = app
	s.loader = loader
	s.store = store
	s.unifiedHTML = unifiedHTML
}

// GetTemplateMeta 是面向前端裁剪后的模板元数据视图。
type GetTemplateMeta struct {
	ID              string                     `json:"id"`
	Name            string                     `json:"name"`
	Version         string                     `json:"version"`
	Author          template.Author            `json:"author"`
	Description     string                     `json:"description"`
	Category        string                     `json:"category"`
	Tags            []string                   `json:"tags"`
	TargetLanguage  []string                   `json:"target_language"`
	PageCount       template.PageCount         `json:"page_count"`
	PaperSize       string                     `json:"paper_size"`
	Colors          *template.TemplateColors   `json:"colors,omitempty"`
	Features        *template.TemplateFeatures `json:"features,omitempty"`
	UsesUnifiedHTML bool                       `json:"uses_unified_html,omitempty"`
	IsBuiltin       bool                       `json:"is_builtin"`
}

// ListTemplates 返回所有可用模板的元数据（内置 + 用户模板）。
func (s *TemplateService) ListTemplates() ([]GetTemplateMeta, error) {
	templates, err := s.loader.LoadAll()
	if err != nil {
		return nil, UserWrap(err, "加载模板列表失败")
	}

	var metas []GetTemplateMeta
	for _, t := range templates {
		metas = append(metas, toGetTemplateMeta(t))
	}
	return metas, nil
}

// GetTemplate 返回单个模板的元数据。
func (s *TemplateService) GetTemplate(id string) (*GetTemplateMeta, error) {
	t, err := s.loader.LoadByID(id)
	if err != nil {
		return nil, err
	}
	meta := toGetTemplateMeta(t)
	return &meta, nil
}

// TemplateContent 是模板的 HTML + CSS 内容及其纸张规格，供前端分页与导出使用。
type TemplateContent struct {
	HTML        string `json:"html"`
	CSS         string `json:"css"`
	PaperSize   string `json:"paper_size"`
	Orientation string `json:"orientation"`
}

// effectiveHTML 返回模板实际使用的 HTML：已迁移到统一骨架（uses_unified_html）
// 或模板无自带 HTML 时使用应用内置的 template.html（Gosume 一期改造）。
func (s *TemplateService) effectiveHTML(t *template.Template) string {
	if t.Meta.UsesUnifiedHTML || strings.TrimSpace(t.HTML) == "" {
		return s.unifiedHTML
	}
	return t.HTML
}

// GetTemplateContent 返回模板的 HTML、CSS 及纸张规格。
func (s *TemplateService) GetTemplateContent(id string) (*TemplateContent, error) {
	t, err := s.loader.LoadByID(id)
	if err != nil {
		return nil, err
	}
	orientation := ""
	if len(t.Meta.Orientations) > 0 {
		orientation = t.Meta.Orientations[0]
	}
	return &TemplateContent{
		HTML:        s.effectiveHTML(t),
		CSS:         t.CSS,
		PaperSize:   t.Meta.PaperSize,
		Orientation: orientation,
	}, nil
}

// ImportTemplateResult 是用户模板包安装成功后返回给前端的结果。
type ImportTemplateResult struct {
	ID      string          `json:"id"`
	Name    string          `json:"name"`
	Version string          `json:"version"`
	Meta    GetTemplateMeta `json:"meta"`
}

// ImportTemplatePackage 弹出原生文件对话框，导入本地 .zip 模板包。
// 用户取消选择时返回 (nil, nil)。
func (s *TemplateService) ImportTemplatePackage() (*ImportTemplateResult, error) {
	if s.wailsApp == nil {
		return nil, UserMsg("应用未初始化")
	}

	filePath, err := s.wailsApp.Dialog.OpenFile().
		SetTitle("导入模板包").
		AddFilter("ZIP 文件 (*.zip)", "*.zip").
		AddFilter("所有文件 (*.*)", "*.*").
		CanChooseFiles(true).
		PromptForSingleSelection()
	if err != nil {
		if IsCancel(err) {
			return nil, nil
		}
		return nil, UserWrap(err, "打开文件对话框失败")
	}
	if filePath == "" {
		return nil, nil
	}
	return s.importTemplatePackageFromPath(filePath)
}

// importTemplatePackageFromPath 从指定路径解析并安装模板包。
// 解析 ZIP → 校验 ID 未被占用 → 写入 SQLite → 返回结果。
func (s *TemplateService) importTemplatePackageFromPath(filePath string) (*ImportTemplateResult, error) {
	if strings.TrimSpace(filePath) == "" {
		return nil, UserMsg("模板包路径不能为空")
	}

	pkg, err := template.LoadPackageFromZip(filePath)
	if err != nil {
		return nil, UserWrap(err, "无法解析模板包，请检查文件格式")
	}

	if existing, _ := s.loader.LoadByID(pkg.Meta.ID); existing != nil {
		return nil, UserMsg("模板已存在")
	}

	if err := s.store.Create(pkg.Meta, pkg.CSS); err != nil {
		return nil, UserWrap(err, "保存模板失败")
	}

	meta := toGetTemplateMeta(&template.Template{
		Meta:      pkg.Meta,
		CSS:       pkg.CSS,
		IsBuiltin: false,
	})
	return &ImportTemplateResult{
		ID:      pkg.Meta.ID,
		Name:    pkg.Meta.Name,
		Version: pkg.Meta.Version,
		Meta:    meta,
	}, nil
}

// ValidateForTemplate 校验简历数据是否满足指定模板的要求。
func (s *TemplateService) ValidateForTemplate(templateID string, resume *model.Resume) *template.ValidationResult {
	t, err := s.loader.LoadByID(templateID)
	if err != nil {
		return &template.ValidationResult{
			Valid:  false,
			Errors: []string{fmt.Sprintf("模板不存在: %s", templateID)},
		}
	}
	return template.ValidateDataForTemplate(t, resume)
}

// CreateTemplate 创建一个用户模板。
// Gosume 一期改造：不再接收 html，模板只由 meta + css 构成。
func (s *TemplateService) CreateTemplate(meta template.Meta, css string) error {
	if meta.ID == "" {
		return UserMsg("模板 ID 不能为空")
	}
	return UserWrap(s.store.Create(meta, css), "创建模板失败")
}

// UpdateTemplate 更新已存在的用户模板。
func (s *TemplateService) UpdateTemplate(id string, meta template.Meta, css string) error {
	return UserWrap(s.store.Update(id, meta, css), "更新模板失败")
}

// DeleteTemplate 软删除用户模板。
func (s *TemplateService) DeleteTemplate(id string) error {
	return UserWrap(s.store.SoftDelete(id), "删除模板失败")
}

// CloneTemplate 把模板（内置或用户）复制为一个新的用户模板。
// 新模板版本号重置为 1.0.0。
func (s *TemplateService) CloneTemplate(sourceID, newID string) error {
	if newID == "" {
		return UserMsg("新模板 ID 不能为空")
	}

	src, err := s.loader.LoadByID(sourceID)
	if err != nil {
		return UserWrap(err, "源模板不存在")
	}

	meta := src.Meta
	meta.ID = newID
	meta.Version = "1.0.0"

	// 检查新 ID 是否已被占用
	if existing, _ := s.loader.LoadByID(newID); existing != nil {
		return UserMsg("模板 ID 已被占用")
	}

	return UserWrap(s.store.Create(meta, src.CSS), "克隆模板失败")
}

// toGetTemplateMeta 把内部模板结构转换为面向前端的元数据视图，
// 集中处理字段映射，避免各处重复转换代码。
func toGetTemplateMeta(t *template.Template) GetTemplateMeta {
	return GetTemplateMeta{
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
		UsesUnifiedHTML: t.Meta.UsesUnifiedHTML,
		IsBuiltin:       t.IsBuiltin,
	}
}
