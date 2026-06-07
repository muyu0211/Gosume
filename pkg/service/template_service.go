package service

import (
	"fmt"

	"gosume/pkg/model"
	"gosume/pkg/store"
	"gosume/pkg/template"
)

// TemplateService manages template listing and operations.
type TemplateService struct {
	loader *template.Loader
	store  *store.TemplateStore
}

// ServiceName returns the service name.
func (s *TemplateService) ServiceName() string {
	return "TemplateService"
}

// Inject sets up dependencies.
func (s *TemplateService) Inject(loader *template.Loader, store *store.TemplateStore) {
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
		return nil, err
	}

	var metas []GetTemplateMeta
	for _, t := range templates {
		metas = append(metas, GetTemplateMeta{
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
		})
	}
	return metas, nil
}

// GetTemplate returns a single template's metadata.
func (s *TemplateService) GetTemplate(id string) (*GetTemplateMeta, error) {
	t, err := s.loader.LoadByID(id)
	if err != nil {
		return nil, err
	}
	return &GetTemplateMeta{
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
	}, nil
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
		return fmt.Errorf("template ID is required")
	}
	return s.store.Create(meta, html, css)
}

// UpdateTemplate updates an existing user template.
func (s *TemplateService) UpdateTemplate(id string, meta template.Meta, html, css string) error {
	return s.store.Update(id, meta, html, css)
}

// DeleteTemplate soft-deletes a user template.
func (s *TemplateService) DeleteTemplate(id string) error {
	return s.store.SoftDelete(id)
}

// CloneTemplate duplicates a template (built-in or user) as a new user template.
func (s *TemplateService) CloneTemplate(sourceID, newID string) error {
	if newID == "" {
		return fmt.Errorf("new template ID is required")
	}

	src, err := s.loader.LoadByID(sourceID)
	if err != nil {
		return err
	}

	meta := src.Meta
	meta.ID = newID
	meta.Version = "1.0.0"

	// Check for ID conflict
	if existing, _ := s.loader.LoadByID(newID); existing != nil {
		return fmt.Errorf("template ID %s already exists", newID)
	}

	return s.store.Create(meta, src.HTML, src.CSS)
}
