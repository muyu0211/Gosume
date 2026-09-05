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
	IsFavorite      bool                  `json:"is_favorite"`
}

// TemplateCategory 是模板分类及其数量，用于模板市场分类筛选。
type TemplateCategory struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// TemplateListResponse 是模板列表分页查询的返回结果。
type TemplateListResponse struct {
	Total    int            `json:"total"`
	Page     int            `json:"page"`
	PageSize int            `json:"page_size"`
	Items    []TemplateMeta `json:"items"`
}

// ImportLog 是模板包导入历史记录（面向模板市场"导入记录"视图）。
type ImportLog struct {
	ID           int64  `json:"id"`
	TemplateID   string `json:"template_id"`
	TemplateName string `json:"template_name"`
	Source       string `json:"source"`
	ImportedAt   string `json:"imported_at"`
}

// TemplateContent 是模板的 HTML + CSS 内容及其纸张规格，供前端分页与导出使用。
type TemplateContent struct {
	HTML        string `json:"html"`
	CSS         string `json:"css"`
	GlobalCSS   string `json:"global_css,omitempty"` // 全局统一样式（resume-global.css），对所有模板生效
	PaperSize   string `json:"paper_size"`
	Orientation string `json:"orientation"`
}
