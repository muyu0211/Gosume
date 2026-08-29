package dto

// Template 是一个已加载的模板，包含元数据与文件内容。
type Template struct {
	Meta       TemplateMeta
	IsBuiltin  bool
	IsFavorite bool
	DirPath    string
	HTML       string
	CSS        string
}

// ImportLog 是模板包导入历史记录，用于模板市场的"导入记录"视图。
type ImportLog struct {
	ID           int64  `json:"id"`
	TemplateID   string `json:"template_id"`
	TemplateName string `json:"template_name"`
	Source       string `json:"source"` // local | share
	ImportedAt   string `json:"imported_at"`
}

// TemplateMeta 是模板元数据，对应模板包中的 template.json。
type TemplateMeta struct {
	ID             string            `json:"id"`
	Name           string            `json:"name"`
	NameEn         string            `json:"name_en"`
	Version        string            `json:"version"`
	Author         Author            `json:"author"`
	Description    string            `json:"description"`
	DescriptionEn  string            `json:"description_en"`
	Category       string            `json:"category"`
	Tags           []string          `json:"tags"`
	TargetLanguage []string          `json:"target_language"`
	PageCount      PageCount         `json:"page_count"`
	PaperSize      string            `json:"paper_size"`
	Orientations   []string          `json:"orientations"`
	Colors         *TemplateColors   `json:"colors,omitempty"`
	Features       *TemplateFeatures `json:"features,omitempty"`
	Sections       Sections          `json:"sections"`
	DataSchema     *DataSchema       `json:"data_schema,omitempty"`
	CSSVariables   map[string]string `json:"css_variables,omitempty"`
	UseUnifiedHTML bool              `json:"uses_unified_html,omitempty"`
}

// Author 是模板作者信息。
type Author struct {
	Name  string `json:"name"`
	Email string `json:"email,omitempty"`
	URL   string `json:"url,omitempty"`
}

// PageCount 描述模板建议的页数范围与默认页数。
type PageCount struct {
	Min     int `json:"min"`
	Max     int `json:"max"`
	Default int `json:"default"`
}

// TemplateColors 是模板的配色方案。
type TemplateColors struct {
	Primary    string `json:"primary"`
	Secondary  string `json:"secondary"`
	Text       string `json:"text"`
	Background string `json:"background"`
	Accent     string `json:"accent"`
}

// TemplateFeatures 标记模板支持的可选特性。
type TemplateFeatures struct {
	Avatar         bool `json:"avatar"`
	SkillBars      bool `json:"skill_bars"`
	QRCode         bool `json:"qr_code"`
	LinksClickable bool `json:"links_clickable"`
}

// Sections 描述模板的区块构成：必需、可选与布局顺序。
type Sections struct {
	Required []string `json:"required"`
	Optional []string `json:"optional"`
	Layout   []string `json:"layout"`
}

// DataSchema 描述模板对简历各区块字段的要求，用于数据校验。
type DataSchema struct {
	Personal  *SectionSchema `json:"personal,omitempty"`
	Jobs      *SectionSchema `json:"jobs,omitempty"`
	Education *SectionSchema `json:"education,omitempty"`
	Skills    *SectionSchema `json:"skills,omitempty"`
	Custom    *CustomSchema  `json:"custom,omitempty"`
}

// SectionSchema 是单个区块的必填与可选字段清单。
type SectionSchema struct {
	Required []string `json:"required"`
	Optional []string `json:"optional"`
}

// CustomSchema 描述模板对自定义模块的支持情况与数量上限。
type CustomSchema struct {
	Enabled  bool `json:"enabled"`
	MaxItems int  `json:"max_items"`
}
