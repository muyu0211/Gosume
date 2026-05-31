package template

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Meta is the template metadata from template.json.
type Meta struct {
	ID              string            `json:"id"`
	Name            string            `json:"name"`
	NameEn          string            `json:"name_en"`
	Version         string            `json:"version"`
	Author          Author            `json:"author"`
	Description     string            `json:"description"`
	DescriptionEn   string            `json:"description_en"`
	Category        string            `json:"category"`
	Tags            []string          `json:"tags"`
	TargetLanguage  []string          `json:"target_language"`
	PageCount       PageCount         `json:"page_count"`
	PaperSize       string            `json:"paper_size"`
	Orientations    []string          `json:"orientations"`
	Colors          *TemplateColors   `json:"colors,omitempty"`
	Features        *TemplateFeatures `json:"features,omitempty"`
	Sections        Sections          `json:"sections"`
	DataSchema      *DataSchema       `json:"data_schema,omitempty"`
	CSSVariables    map[string]string `json:"css_variables,omitempty"`
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

// Loader loads templates from embedFS (builtin) and user directory.
type Loader struct {
	builtinFS  map[string]string // templateID -> dirPath (for builtin templates loaded from embed)
	builtinDir string
	userDir    string
	templates  map[string]*Template
}

// NewLoader creates a template loader.
func NewLoader(builtinDir, userDir string) *Loader {
	return &Loader{
		builtinDir: builtinDir,
		userDir:    userDir,
		templates:  make(map[string]*Template),
	}
}

// SetUserDir updates the user templates directory and clears the template cache.
func (l *Loader) SetUserDir(dir string) {
	l.userDir = dir
	l.templates = make(map[string]*Template)
}

// LoadAll loads all templates (builtin + user-installed).
func (l *Loader) LoadAll() ([]*Template, error) {
	var all []*Template

	builtin, err := l.loadFromDir(l.builtinDir)
	if err != nil {
		return nil, err
	}
	for _, t := range builtin {
		t.IsBuiltin = true
		l.templates[t.Meta.ID] = t
		all = append(all, t)
	}

	if l.userDir != "" {
		userTemplates, err := l.loadFromDir(l.userDir)
		if err != nil && !os.IsNotExist(err) {
			return nil, err
		}
		for _, t := range userTemplates {
			t.IsBuiltin = false
			if _, exists := l.templates[t.Meta.ID]; !exists {
				l.templates[t.Meta.ID] = t
				all = append(all, t)
			}
		}
	}

	return all, nil
}

// LoadByID loads a single template by its ID.
func (l *Loader) LoadByID(id string) (*Template, error) {
	if t, ok := l.templates[id]; ok {
		return t, nil
	}
	_, _ = l.LoadAll()
	if t, ok := l.templates[id]; ok {
		return t, nil
	}
	return nil, &Error{Code: "TEMPLATE_NOT_FOUND", Message: "template not found: " + id}
}

func (l *Loader) loadFromDir(dir string) ([]*Template, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var templates []*Template
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		tmplDir := filepath.Join(dir, entry.Name())

		metaPath := filepath.Join(tmplDir, "template.json")
		metaData, err := os.ReadFile(metaPath)
		if err != nil {
			continue // skip directories without template.json
		}

		var meta Meta
		if err := json.Unmarshal(metaData, &meta); err != nil {
			continue
		}

		t := &Template{
			Meta:    meta,
			DirPath: tmplDir,
		}

		if htmlData, err := os.ReadFile(filepath.Join(tmplDir, "template.html")); err == nil {
			t.HTML = string(htmlData)
		}
		if cssData, err := os.ReadFile(filepath.Join(tmplDir, "styles.css")); err == nil {
			t.CSS = string(cssData)
		}

		docxPath := filepath.Join(tmplDir, "template.docx")
		if _, err := os.Stat(docxPath); err == nil {
			t.DOCXPath = docxPath
		}

		templates = append(templates, t)
	}
	return templates, nil
}

// Error is a template-related error.
type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *Error) Error() string { return "[" + e.Code + "] " + e.Message }
