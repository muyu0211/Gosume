package service

import (
	"fmt"

	"gosume/pkg/model"
	"gosume/pkg/template"
)

// TemplateService manages template listing and operations.
type TemplateService struct {
	loader *template.Loader
}

// ServiceName returns the service name.
func (s *TemplateService) ServiceName() string {
	return "TemplateService"
}

// Inject sets up dependencies.
func (s *TemplateService) Inject(loader *template.Loader) {
	s.loader = loader
}

// GetTemplateMeta is a trimmed version of template.Meta for the frontend.
type GetTemplateMeta struct {
	ID            string              `json:"id"`
	Name          string              `json:"name"`
	Version       string              `json:"version"`
	Author        template.Author     `json:"author"`
	Description   string              `json:"description"`
	Category      string              `json:"category"`
	Tags          []string            `json:"tags"`
	TargetLanguage []string            `json:"target_language"`
	PageCount     template.PageCount  `json:"page_count"`
	PaperSize     string              `json:"paper_size"`
	Colors        *template.TemplateColors `json:"colors,omitempty"`
	Features      *template.TemplateFeatures `json:"features,omitempty"`
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
