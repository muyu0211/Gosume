package template

// TemplateStore is the interface for template persistence, implemented by store.TemplateStore.
type TemplateStore interface {
	ListAll() ([]*Template, error)
	GetByID(id string) (*Template, error)
}

// Meta is the template metadata from template.json.
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
}

type Author struct {
	Name  string `json:"name"`
	Email string `json:"email,omitempty"`
	URL   string `json:"url,omitempty"`
}

type PageCount struct {
	Min     int `json:"min"`
	Max     int `json:"max"`
	Default int `json:"default"`
}

type TemplateColors struct {
	Primary    string `json:"primary"`
	Secondary  string `json:"secondary"`
	Text       string `json:"text"`
	Background string `json:"background"`
	Accent     string `json:"accent"`
}

type TemplateFeatures struct {
	Avatar         bool `json:"avatar"`
	SkillBars      bool `json:"skill_bars"`
	QRCode         bool `json:"qr_code"`
	LinksClickable bool `json:"links_clickable"`
}

type Sections struct {
	Required []string `json:"required"`
	Optional []string `json:"optional"`
	Layout   []string `json:"layout"`
}

type DataSchema struct {
	Personal  *SectionSchema `json:"personal,omitempty"`
	Jobs      *SectionSchema `json:"jobs,omitempty"`
	Education *SectionSchema `json:"education,omitempty"`
	Skills    *SectionSchema `json:"skills,omitempty"`
	Custom    *CustomSchema  `json:"custom,omitempty"`
}

type SectionSchema struct {
	Required []string `json:"required"`
	Optional []string `json:"optional"`
}

type CustomSchema struct {
	Enabled  bool `json:"enabled"`
	MaxItems int  `json:"max_items"`
}

// Template is a loaded template with its metadata and file contents.
type Template struct {
	Meta      Meta
	IsBuiltin bool
	DirPath   string
	HTML      string
	CSS       string
	DOCXPath  string
}

// Loader loads templates from a TemplateStore implementation.
type Loader struct {
	store TemplateStore
}

// NewLoader creates a template loader backed by a TemplateStore.
func NewLoader(store TemplateStore) *Loader {
	return &Loader{store: store}
}

// LoadAll loads all templates (builtin + user-created).
func (l *Loader) LoadAll() ([]*Template, error) {
	return l.store.ListAll()
}

// LoadByID loads a single template by its ID.
func (l *Loader) LoadByID(id string) (*Template, error) {
	return l.store.GetByID(id)
}

// Error is a template-related error.
type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *Error) Error() string { return "[" + e.Code + "] " + e.Message }
