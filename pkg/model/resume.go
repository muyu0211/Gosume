package model

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"time"
)

// Resume is the root structure for a resume.
// SummaryHidden toggles visibility of the "个人总结" section. Pointer + omitempty
// keeps backward compatibility with legacy resumes (treated as visible).
type Resume struct {
	Version       string          `json:"version"`
	Meta          ResumeMeta      `json:"meta"`
	Personal      Personal        `json:"personal"`
	Summary       string          `json:"summary,omitempty"`
	SummaryHidden *bool           `json:"summary_hidden,omitempty"`
	Internships   []Internship    `json:"internships,omitempty"`
	Jobs          []Job           `json:"jobs,omitempty"`
	Projects      []Project       `json:"projects,omitempty"`
	Education     []Education     `json:"education,omitempty"`
	Skills        []SkillGroup    `json:"skills,omitempty"`
	Languages     []Language      `json:"languages,omitempty"`
	Awards        []Award         `json:"awards,omitempty"`
	Custom        []CustomSection `json:"custom,omitempty"`
}

// PageMargin is the page-margin level of a resume. The enum keys are the
// wire format shared with the frontend (resume.meta.page_margin); the
// frontend maps each level to concrete CSS values per template component.
type PageMargin string

// Page margin levels.
const (
	PageMarginCompact     PageMargin = "compact"
	PageMarginNarrow      PageMargin = "narrow"
	PageMarginNormal      PageMargin = "normal"
	PageMarginWide        PageMargin = "wide"
	PageMarginComfortable PageMargin = "comfortable"
)

// SectionSpacing is the content-block spacing level of a resume. The enum
// keys are the wire format shared with the frontend
// (resume.meta.section_spacing).
type SectionSpacing string

// Section spacing levels.
const (
	SectionSpacingCompact     SectionSpacing = "compact"
	SectionSpacingNarrow      SectionSpacing = "narrow"
	SectionSpacingNormal      SectionSpacing = "normal"
	SectionSpacingWide        SectionSpacing = "wide"
	SectionSpacingComfortable SectionSpacing = "comfortable"
)

// FontSize is the base font size of a resume in pt. The wire format stays
// numeric so resumes persisted before this enum was introduced remain valid.
type FontSize int

// Font size levels.
const (
	FontSizeSmall  FontSize = 9
	FontSizeMedium FontSize = 10
	FontSizeLarge  FontSize = 11
)

// ResumeMeta holds metadata about the resume document.
type ResumeMeta struct {
	TemplateID     string         `json:"template_id"`
	Name           string         `json:"name"`
	Language       string         `json:"language"`
	FontSize       FontSize       `json:"font_size"`
	PageMargin     PageMargin     `json:"page_margin"`
	SectionSpacing SectionSpacing `json:"section_spacing"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	ExportCount    int            `json:"export_count"`
}

// SetFieldByPath sets a field on the resume by dot-separated path.
// Path examples: "personal.full_name", "jobs[0].company"
func SetFieldByPath(obj any, path string, value json.RawMessage) error {
	parts := parsePath(path)
	if len(parts) == 0 {
		return fmt.Errorf("empty path")
	}

	v := reflect.ValueOf(obj).Elem()
	for i, part := range parts {
		isLast := i == len(parts)-1

		if idx, isArray := parseArrayIndex(part); isArray {
			if v.Kind() != reflect.Slice {
				return fmt.Errorf("expected slice at %s, got %s", part, v.Kind())
			}
			if idx >= v.Len() {
				return fmt.Errorf("index %d out of range (len=%d) at %s", idx, v.Len(), part)
			}
			v = v.Index(idx)
			if v.Kind() == reflect.Ptr {
				v = v.Elem()
			}
			continue
		}

		fieldName := toFieldName(part)
		f := v.FieldByName(fieldName)
		if !f.IsValid() {
			return fmt.Errorf("field %s not found on %s", part, v.Type().Name())
		}

		if isLast {
			target := reflect.New(f.Type())
			if err := json.Unmarshal(value, target.Interface()); err != nil {
				return fmt.Errorf("unmarshal value for %s: %w", path, err)
			}
			f.Set(target.Elem())
			return nil
		}

		if f.Kind() == reflect.Ptr {
			if f.IsNil() {
				f.Set(reflect.New(f.Type().Elem()))
			}
			f = f.Elem()
		}
		v = f
	}
	return nil
}

func parsePath(path string) []string {
	var parts []string
	current := strings.Builder{}
	for i := 0; i < len(path); i++ {
		ch := path[i]
		if ch == '.' {
			parts = append(parts, current.String())
			current.Reset()
		} else if ch == '[' {
			if current.Len() > 0 {
				parts = append(parts, current.String())
				current.Reset()
			}
			j := i + 1
			for j < len(path) && path[j] != ']' {
				current.WriteByte(path[j])
				j++
			}
			parts = append(parts, "["+current.String()+"]")
			current.Reset()
			i = j
		} else {
			current.WriteByte(ch)
		}
	}
	if current.Len() > 0 {
		parts = append(parts, current.String())
	}
	return parts
}

func parseArrayIndex(part string) (int, bool) {
	if strings.HasPrefix(part, "[") && strings.HasSuffix(part, "]") {
		var idx int
		fmt.Sscanf(part, "[%d]", &idx)
		return idx, true
	}
	return 0, false
}

func toFieldName(jsonField string) string {
	parts := strings.Split(jsonField, "_")
	for i, p := range parts {
		if len(p) > 0 {
			parts[i] = strings.ToUpper(p[:1]) + p[1:]
		}
	}
	return strings.Join(parts, "")
}
