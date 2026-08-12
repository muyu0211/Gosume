package service

import (
	"fmt"
	"strings"

	"gosume/pkg/model"
	"gosume/pkg/store"
	"gosume/pkg/template"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// TemplateService manages template listing and operations.
type TemplateService struct {
	wailsApp *application.App
	loader   *template.Loader
	store    *store.TemplateStore
}

// ServiceName returns the service name.
func (s *TemplateService) ServiceName() string {
	return "TemplateService"
}

// Inject sets up dependencies.
func (s *TemplateService) Inject(app *application.App, loader *template.Loader, store *store.TemplateStore) {
	s.wailsApp = app
	s.loader = loader
	s.store = store
}

// GetTemplateMeta is a trimmed version of template.Meta for the frontend.
type GetTemplateMeta struct {
	ID             string                     `json:"id"`
	Name           string                     `json:"name"`
	Version        string                     `json:"version"`
	Author         template.Author            `json:"author"`
	Description    string                     `json:"description"`
	Category       string                     `json:"category"`
	Tags           []string                   `json:"tags"`
	TargetLanguage []string                   `json:"target_language"`
	PageCount      template.PageCount         `json:"page_count"`
	PaperSize      string                     `json:"paper_size"`
	Colors         *template.TemplateColors   `json:"colors,omitempty"`
	Features       *template.TemplateFeatures `json:"features,omitempty"`
	IsBuiltin      bool                       `json:"is_builtin"`
}

// ListTemplates returns all available templates' metadata.
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

// GetTemplate returns a single template's metadata.
func (s *TemplateService) GetTemplate(id string) (*GetTemplateMeta, error) {
	t, err := s.loader.LoadByID(id)
	if err != nil {
		return nil, err
	}
	meta := toGetTemplateMeta(t)
	return &meta, nil
}

// TemplateContent is the HTML+CSS content for a template.
type TemplateContent struct {
	HTML string `json:"html"`
	CSS  string `json:"css"`
}

// GetTemplateContent returns a template's HTML and CSS content.
func (s *TemplateService) GetTemplateContent(id string) (*TemplateContent, error) {
	t, err := s.loader.LoadByID(id)
	if err != nil {
		return nil, err
	}
	return &TemplateContent{
		HTML: t.HTML,
		CSS:  t.CSS,
	}, nil
}

// ImportTemplateResult is returned after a user template package is installed.
type ImportTemplateResult struct {
	ID      string          `json:"id"`
	Name    string          `json:"name"`
	Version string          `json:"version"`
	Meta    GetTemplateMeta `json:"meta"`
}

// ImportTemplatePackage opens a native file dialog and imports a local template package.
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

	if err := s.store.Create(pkg.Meta, pkg.HTML, pkg.CSS); err != nil {
		return nil, UserWrap(err, "保存模板失败")
	}

	meta := toGetTemplateMeta(&template.Template{
		Meta:      pkg.Meta,
		HTML:      pkg.HTML,
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

// ValidateForTemplate checks if the current resume data satisfies template requirements.
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

// CreateTemplate creates a new user template.
func (s *TemplateService) CreateTemplate(meta template.Meta, html, css string) error {
	if meta.ID == "" {
		return UserMsg("模板 ID 不能为空")
	}
	return UserWrap(s.store.Create(meta, html, css), "创建模板失败")
}

// UpdateTemplate updates an existing user template.
func (s *TemplateService) UpdateTemplate(id string, meta template.Meta, html, css string) error {
	return UserWrap(s.store.Update(id, meta, html, css), "更新模板失败")
}

// DeleteTemplate soft-deletes a user template.
func (s *TemplateService) DeleteTemplate(id string) error {
	return UserWrap(s.store.SoftDelete(id), "删除模板失败")
}

// CloneTemplate duplicates a template (built-in or user) as a new user template.
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

	// Check for ID conflict
	if existing, _ := s.loader.LoadByID(newID); existing != nil {
		return UserMsg("模板 ID 已被占用")
	}

	return UserWrap(s.store.Create(meta, src.HTML, src.CSS), "克隆模板失败")
}

func toGetTemplateMeta(t *template.Template) GetTemplateMeta {
	return GetTemplateMeta{
		ID:             t.Meta.ID,
		Name:           t.Meta.Name,
		Version:        t.Meta.Version,
		Author:         t.Meta.Author,
		Description:    t.Meta.Description,
		Category:       t.Meta.Category,
		Tags:           t.Meta.Tags,
		TargetLanguage: t.Meta.TargetLanguage,
		PageCount:      t.Meta.PageCount,
		PaperSize:      t.Meta.PaperSize,
		Colors:         t.Meta.Colors,
		Features:       t.Meta.Features,
		IsBuiltin:      t.IsBuiltin,
	}
}
