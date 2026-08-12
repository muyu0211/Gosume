package template

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	htmltemplate "html/template"
	"io"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"gosume/pkg/model"
)

const (
	MaxTemplatePackageSize = 10 << 20
	MaxTemplateFileSize    = 2 << 20
)

var templateIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$`)

// Package is the validated content of a local .zip package.
type Package struct {
	Meta Meta
	HTML string
	CSS  string
}

// LoadPackageFromZip reads and validates a .zip package.
func LoadPackageFromZip(filePath string) (*Package, error) {
	reader, err := zip.OpenReader(filePath)
	if err != nil {
		return nil, fmt.Errorf("open template package: %w", err)
	}
	defer reader.Close()

	var total int64
	files := map[string][]byte{}
	for _, f := range reader.File {
		if f.FileInfo().IsDir() {
			continue
		}
		if err := validatePackagePath(f.Name); err != nil {
			return nil, err
		}
		if f.UncompressedSize64 > MaxTemplateFileSize {
			return nil, fmt.Errorf("template file %s is too large", f.Name)
		}
		total += int64(f.UncompressedSize64)
		if total > MaxTemplatePackageSize {
			return nil, fmt.Errorf("template package is too large")
		}

		base := filepath.Base(filepath.ToSlash(f.Name))
		switch base {
		case "template.json", "template.html", "styles.css":
			if _, exists := files[base]; exists {
				return nil, fmt.Errorf("duplicate %s in template package", base)
			}
			data, err := readZipFile(f)
			if err != nil {
				return nil, err
			}
			files[base] = data
		}
	}

	for _, required := range []string{"template.json", "template.html", "styles.css"} {
		if len(files[required]) == 0 {
			return nil, fmt.Errorf("missing required file: %s", required)
		}
	}

	var meta Meta
	if err := json.Unmarshal(files["template.json"], &meta); err != nil {
		return nil, fmt.Errorf("parse template.json: %w", err)
	}
	normalizeMeta(&meta)

	pkg := &Package{
		Meta: meta,
		HTML: string(files["template.html"]),
		CSS:  string(files["styles.css"]),
	}
	if err := ValidatePackage(pkg); err != nil {
		return nil, err
	}
	return pkg, nil
}

// ValidatePackage ensures imported templates work with both renderers used by Gosume.
func ValidatePackage(pkg *Package) error {
	if pkg == nil {
		return fmt.Errorf("template package is empty")
	}
	if err := validateMeta(pkg.Meta); err != nil {
		return err
	}
	if strings.TrimSpace(pkg.HTML) == "" {
		return fmt.Errorf("template.html is empty")
	}
	if strings.TrimSpace(pkg.CSS) == "" {
		return fmt.Errorf("styles.css is empty")
	}
	if err := validatePreviewCompatibleSyntax(pkg.HTML); err != nil {
		return err
	}
	if err := validateTemplateExecution(pkg); err != nil {
		return err
	}
	return nil
}

func validatePackagePath(name string) error {
	clean := filepath.ToSlash(filepath.Clean(name))
	if strings.HasPrefix(clean, "../") || clean == ".." || strings.HasPrefix(clean, "/") || filepath.IsAbs(name) {
		return fmt.Errorf("unsafe path in template package: %s", name)
	}
	return nil
}

func readZipFile(f *zip.File) ([]byte, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", f.Name, err)
	}
	defer rc.Close()

	var buf bytes.Buffer
	if _, err := io.CopyN(&buf, rc, MaxTemplateFileSize+1); err != nil && err != io.EOF {
		return nil, fmt.Errorf("read %s: %w", f.Name, err)
	}
	if buf.Len() > MaxTemplateFileSize {
		return nil, fmt.Errorf("template file %s is too large", f.Name)
	}
	return buf.Bytes(), nil
}

func normalizeMeta(meta *Meta) {
	meta.ID = strings.TrimSpace(meta.ID)
	meta.Name = strings.TrimSpace(meta.Name)
	meta.Version = strings.TrimSpace(meta.Version)
	meta.Author.Name = strings.TrimSpace(meta.Author.Name)
	meta.PaperSize = strings.TrimSpace(meta.PaperSize)
	if meta.TargetLanguage == nil {
		meta.TargetLanguage = []string{"zh-CN"}
	}
	if meta.Tags == nil {
		meta.Tags = []string{}
	}
	if meta.Category == "" {
		meta.Category = "custom"
	}
	if meta.PaperSize == "" {
		meta.PaperSize = "A4"
	}
	if meta.Orientations == nil {
		meta.Orientations = []string{"portrait"}
	}
	if meta.PageCount.Min == 0 {
		meta.PageCount.Min = 1
	}
	if meta.PageCount.Max == 0 {
		meta.PageCount.Max = 5
	}
	if meta.PageCount.Default == 0 {
		meta.PageCount.Default = 1
	}
}

func validateMeta(meta Meta) error {
	if !templateIDPattern.MatchString(meta.ID) {
		return fmt.Errorf("template id must be 2-64 characters and contain only letters, numbers, hyphens, or underscores")
	}
	if strings.TrimSpace(meta.Name) == "" {
		return fmt.Errorf("template name is required")
	}
	if strings.TrimSpace(meta.Version) == "" {
		return fmt.Errorf("template version is required")
	}
	if strings.TrimSpace(meta.Author.Name) == "" {
		return fmt.Errorf("template author name is required")
	}
	if meta.PaperSize != "A4" {
		return fmt.Errorf("only A4 templates are currently supported")
	}
	return nil
}

func validateTemplateExecution(pkg *Package) error {
	t := htmltemplate.New("resume").Funcs(htmltemplate.FuncMap{
		"dateRange":  previewDateRange,
		"skillLevel": previewSkillLevel,
		"i18n":       previewI18n,
		"nl2br":      previewNL2BR,
		"safeHTML":   previewSafeHTML,
		"safeURL":    previewSafeURL,
		"defaultVal": previewDefaultVal,
	})

	if strings.Contains(pkg.HTML, `{{template "styles.css"`) {
		if _, err := t.New("styles.css").Parse(pkg.CSS); err != nil {
			return fmt.Errorf("parse styles.css as template: %w", err)
		}
	}

	parsed, err := t.Parse(pkg.HTML)
	if err != nil {
		return fmt.Errorf("parse template.html: %w", err)
	}

	var buf bytes.Buffer
	if err := parsed.Execute(&buf, sampleResume(pkg.Meta.ID)); err != nil {
		return fmt.Errorf("execute template with sample data: %w", err)
	}
	return nil
}

func validatePreviewCompatibleSyntax(html string) error {
	actions := regexp.MustCompile(`\{\{([^{}]+)\}\}`).FindAllStringSubmatch(html, -1)
	for _, action := range actions {
		expr := strings.TrimSpace(action[1])
		if expr == "" || expr == "end" || expr == "else" {
			continue
		}
		if strings.Contains(expr, "|") || strings.Contains(expr, ":=") || strings.Contains(expr, "$") {
			return fmt.Errorf("unsupported template expression for live preview: {{%s}}", expr)
		}
		if strings.HasPrefix(expr, "template ") {
			if expr == `template "styles.css" .` {
				continue
			}
			return fmt.Errorf("only {{template \"styles.css\" .}} includes are supported")
		}
		if strings.HasPrefix(expr, "if ") || strings.HasPrefix(expr, "range ") {
			target := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(expr, "if "), "range "))
			if isSimpleTemplatePath(target) {
				continue
			}
			return fmt.Errorf("unsupported template control expression for live preview: {{%s}}", expr)
		}
		if strings.HasPrefix(expr, "with ") || strings.HasPrefix(expr, "block ") || strings.HasPrefix(expr, "define ") {
			return fmt.Errorf("unsupported template block for live preview: {{%s}}", expr)
		}
		if isSimpleTemplatePath(expr) || isSupportedFunctionCall(expr) {
			continue
		}
		return fmt.Errorf("unsupported template expression for live preview: {{%s}}", expr)
	}
	return nil
}

func isSimpleTemplatePath(expr string) bool {
	return regexp.MustCompile(`^\.[A-Za-z0-9_]*(\.[A-Za-z0-9_]+)*$`).MatchString(expr)
}

func isSupportedFunctionCall(expr string) bool {
	fields := strings.Fields(expr)
	if len(fields) == 0 {
		return false
	}
	switch fields[0] {
	case "dateRange", "skillLevel", "i18n", "nl2br", "safeHTML", "safeURL", "defaultVal":
		return true
	default:
		return false
	}
}

func sampleResume(templateID string) *model.Resume {
	now := time.Now()
	return &model.Resume{
		Version: "1.0",
		Meta: model.ResumeMeta{
			TemplateID:  templateID,
			Name:        "Sample Resume",
			Language:    "zh-CN",
			FontSize:    10,
			PageMargin:  "normal",
			CreatedAt:   now,
			UpdatedAt:   now,
			ExportCount: 0,
		},
		Personal: model.Personal{
			FullName:   "Sample User",
			Email:      "sample@example.com",
			Phone:      "138-0000-0000",
			Location:   "Shanghai",
			JobTitle:   "Frontend Engineer",
			YearsOfExp: 5,
			GitHub:     "github.com/sample",
		},
		Summary: "Experienced engineer focused on reliable products.",
		Jobs: []model.Job{{
			ID:         "sample-job",
			Company:    "Sample Company",
			Title:      "Senior Engineer",
			Location:   "Shanghai",
			StartDate:  "2020.01",
			EndDate:    "",
			IsCurrent:  true,
			Summary:    "Built product systems and improved delivery quality.",
			Highlights: []string{"Led core feature delivery", "Improved performance and reliability"},
		}},
		Projects: []model.Project{{
			ID:         "sample-project",
			Name:       "Template Compatibility",
			Role:       "Owner",
			StartDate:  "2023.01",
			EndDate:    "2023.06",
			Summary:    "Validated imported templates.",
			Highlights: []string{"Preview and export render consistently"},
		}},
		Education: []model.Education{{
			ID:        "sample-education",
			School:    "Sample University",
			Degree:    "Bachelor",
			Major:     "Computer Science",
			StartDate: "2016.09",
			EndDate:   "2020.06",
			GPA:       "3.8/4.0",
		}},
		Skills: []model.SkillGroup{{
			ID:       "sample-skills",
			Category: "Engineering",
			Items: []model.Skill{
				{Name: "React", Level: 5},
				{Name: "Go", Level: 4},
			},
		}},
		Languages: []model.Language{{
			ID:    "sample-language",
			Name:  "English",
			Level: "Fluent",
		}},
		Awards: []model.Award{{
			ID:      "sample-award",
			Title:   "Outstanding Project",
			Date:    "2023",
			Issuer:  "Sample Organization",
			Summary: "Recognized for delivery quality.",
		}},
		Custom: []model.CustomSection{{
			ID:    "sample-custom",
			Title: "Custom Section",
			Items: []model.CustomItem{{
				ID:          "sample-custom-item",
				Title:       "Custom Item",
				Subtitle:    "Subtitle",
				Date:        "2024",
				Description: "Additional information.",
				Highlights:  []string{"Flexible content"},
			}},
		}},
	}
}

func previewDateRange(start, end string, isCurrent bool) string {
	if start == "" {
		return ""
	}
	if isCurrent || end == "" {
		return start + " - 至今"
	}
	return start + " - " + end
}

func previewSkillLevel(level int) htmltemplate.HTML {
	var buf strings.Builder
	for i := 0; i < 5; i++ {
		if i < level {
			buf.WriteString(`<span class="skill-dot filled"></span>`)
		} else {
			buf.WriteString(`<span class="skill-dot"></span>`)
		}
	}
	return htmltemplate.HTML(buf.String())
}

func previewI18n(lang, zhKey, enKey string) string {
	if lang == "zh-CN" {
		return zhKey
	}
	return enKey
}

func previewNL2BR(s string) htmltemplate.HTML {
	escaped := htmltemplate.HTMLEscapeString(s)
	return htmltemplate.HTML(strings.ReplaceAll(escaped, "\n", "<br>"))
}

func previewSafeHTML(s string) htmltemplate.HTML {
	return htmltemplate.HTML(s)
}

func previewSafeURL(s string) htmltemplate.URL {
	return htmltemplate.URL(s)
}

func previewDefaultVal(defaultVal, val string) string {
	if val == "" {
		return defaultVal
	}
	return val
}
