package template

// TemplateStore 是模板持久化能力的抽象接口，由 store.TemplateStore 实现。
type TemplateStore interface {
	ListAll() ([]*Template, error)
	GetByID(id string) (*Template, error)
}

// Meta 是模板元数据，对应模板包中的 template.json。
type Meta struct {
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

// Template 是一个已加载的模板，包含元数据与文件内容。
type Template struct {
	Meta      Meta
	IsBuiltin bool
	DirPath   string
	HTML      string
	CSS       string
}

// Loader 基于 TemplateStore 加载模板。
type Loader struct {
	store TemplateStore
}

// NewLoader 创建由 TemplateStore 支撑的模板加载器。
func NewLoader(store TemplateStore) *Loader {
	return &Loader{store: store}
}

// LoadAll 加载全部模板（内置 + 用户创建）。
func (l *Loader) LoadAll() ([]*Template, error) {
	return l.store.ListAll()
}

// LoadByID 按 ID 加载单个模板。
func (l *Loader) LoadByID(id string) (*Template, error) {
	return l.store.GetByID(id)
}

// Error 是模板相关的错误类型，携带错误码便于前端区分处理。
type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Error 实现 error 接口，输出格式为 [错误码] 消息。
func (e *Error) Error() string { return "[" + e.Code + "] " + e.Message }
