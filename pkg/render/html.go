package render

import (
	"bytes"
	"fmt"
	"html/template"
	"strings"

	"gosume/pkg/model"
)

// HTMLRenderer renders resume data into an HTML string using Go templates.
type HTMLRenderer struct {
	templateLoader TemplateLoader
	funcMap        template.FuncMap
}

// TemplateLoader is the interface for loading templates.
type TemplateLoader interface {
	LoadByID(id string) (*Template, error)
	LoadAll() ([]*Template, error)
}

// Template wraps the template system's Template type for the render package.
type Template struct {
	Meta    TemplateMeta
	HTML    string
	CSS     string
	DirPath string
}

// TemplateMeta is the minimal metadata needed by the renderer.
type TemplateMeta struct {
	ID string
}

// TemplateMetaMinimal is used to satisfy the TemplateLoader interface.
type TemplateMetaMinimal interface {
	GetID() string
}

// NewHTMLRenderer creates a new HTML renderer.
func NewHTMLRenderer(loader TemplateLoader) *HTMLRenderer {
	r := &HTMLRenderer{
		templateLoader: loader,
	}
	r.funcMap = template.FuncMap{
		"dateRange":  dateRange,
		"skillLevel": skillLevel,
		"i18n":       i18n,
		"nl2br":      nl2br,
		"safeHTML":   safeHTML,
		"defaultVal": defaultVal,
	}
	return r
}

// Render renders a resume with the template specified in resume.Meta.TemplateID.
func (r *HTMLRenderer) Render(resume *model.Resume) (string, error) {
	tmplID := resume.Meta.TemplateID
	if tmplID == "" {
		tmplID = "modern"
	}

	tmpl, err := r.templateLoader.LoadByID(tmplID)
	if err != nil {
		return "", fmt.Errorf("load template %s: %w", tmplID, err)
	}

	return r.RenderWithTemplate(resume, tmpl)
}

// RenderWithTemplate renders a resume with a specific template.
func (r *HTMLRenderer) RenderWithTemplate(resume *model.Resume, tmpl *Template) (string, error) {
	if tmpl.HTML == "" {
		return "", fmt.Errorf("template %s has no HTML content", tmpl.Meta.ID)
	}

	t := template.New("resume").Funcs(r.funcMap)

	// If the HTML references {{template "styles.css"}}, define it as a sub-template first
	if strings.Contains(tmpl.HTML, `{{template "styles.css"`) {
		if tmpl.CSS != "" {
			if _, err := t.New("styles.css").Parse(tmpl.CSS); err != nil {
				return "", fmt.Errorf("parse css template: %w", err)
			}
		}
	}

	t, err := t.Parse(tmpl.HTML)
	if err != nil {
		return "", fmt.Errorf("parse template: %w", err)
	}

	var buf bytes.Buffer
	if err := t.Execute(&buf, resume); err != nil {
		return "", fmt.Errorf("execute template: %w", err)
	}

	return buf.String(), nil
}

// Custom template functions

func dateRange(start, end string, isCurrent bool) string {
	if isCurrent || end == "" {
		return start + " - 至今"
	}
	return start + " - " + end
}

func skillLevel(level int) template.HTML {
	var buf strings.Builder
	for i := 0; i < 5; i++ {
		if i < level {
			buf.WriteString(`<span class="skill-dot filled"></span>`)
		} else {
			buf.WriteString(`<span class="skill-dot"></span>`)
		}
	}
	return template.HTML(buf.String())
}

func i18n(lang, zhKey, enKey string) string {
	if lang == "zh-CN" {
		return zhKey
	}
	return enKey
}

func nl2br(s string) template.HTML {
	escaped := template.HTMLEscapeString(s)
	return template.HTML(strings.ReplaceAll(escaped, "\n", "<br>"))
}

func safeHTML(s string) template.HTML {
	return template.HTML(s)
}

func defaultVal(defaultVal, val string) string {
	if val == "" {
		return defaultVal
	}
	return val
}
