package vo

import "gosume/pkg/resume/dto"

// TemplateMeta 面向前端裁剪后的模板元数据视图。
type TemplateMeta struct {
	ID              string                `json:"id"`
	Name            string                `json:"name"`
	Version         string                `json:"version"`
	Author          dto.Author            `json:"author"`
	Description     string                `json:"description"`
	Category        string                `json:"category"`
	Tags            []string              `json:"tags"`
	TargetLanguage  []string              `json:"target_language"`
	PageCount       dto.PageCount         `json:"page_count"`
	PaperSize       string                `json:"paper_size"`
	Colors          *dto.TemplateColors   `json:"colors,omitempty"`
	Features        *dto.TemplateFeatures `json:"features,omitempty"`
	UsesUnifiedHTML bool                  `json:"uses_unified_html,omitempty"`
	IsBuiltin       bool                  `json:"is_builtin"`
}

// TemplateContent 是模板的 HTML + CSS 内容及其纸张规格，供前端分页与导出使用。
type TemplateContent struct {
	HTML        string `json:"html"`
	CSS         string `json:"css"`
	PaperSize   string `json:"paper_size"`
	Orientation string `json:"orientation"`
}
