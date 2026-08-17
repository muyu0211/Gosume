package model

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"time"
)

// Resume 是简历的根结构。
//
// SummaryHidden 控制「个人总结」区块是否显示。使用指针 + omitempty 是为了兼容
// 历史数据：字段缺失时视为显示。
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

// PageMargin 是简历的页边距档位。枚举 key 即与前端约定的传输格式
// resume.meta.page_margin，由前端按模板组件映射为具体 CSS 值。
type PageMargin string

// 页边距档位取值。
const (
	PageMarginCompact     PageMargin = "compact"
	PageMarginNarrow      PageMargin = "narrow"
	PageMarginNormal      PageMargin = "normal"
	PageMarginWide        PageMargin = "wide"
	PageMarginComfortable PageMargin = "comfortable"
)

// SectionSpacing 是简历的内容区块间距档位。枚举 key 即与前端约定的传输格式
// resume.meta.section_spacing。
type SectionSpacing string

// 内容间距档位取值。
const (
	SectionSpacingCompact     SectionSpacing = "compact"
	SectionSpacingNarrow      SectionSpacing = "narrow"
	SectionSpacingNormal      SectionSpacing = "normal"
	SectionSpacingWide        SectionSpacing = "wide"
	SectionSpacingComfortable SectionSpacing = "comfortable"
)

// FontSize 是简历的基准字号，单位 pt。传输格式保持数字，以便该枚举引入前
// 已持久化的简历仍然有效。
type FontSize int

// 字号档位取值。
const (
	FontSizeSmall  FontSize = 9
	FontSizeMedium FontSize = 10
	FontSizeLarge  FontSize = 11
)

// ResumeMeta 保存简历文档的元数据。
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

// SetFieldByPath 按点号分隔的路径设置简历上的字段值。
//
// 路径示例："personal.full_name"、"jobs[0].company"。
// value 为该字段对应的 JSON 原文，由反射定位字段后反序列化写入。
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

// parsePath 把字段路径切分为片段序列，数组下标保留方括号形式。
// 例如 "jobs[0].company" → ["jobs", "[0]", "company"]。
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

// parseArrayIndex 解析 "[N]" 形式的片段，返回下标及其是否为数组下标。
func parseArrayIndex(part string) (int, bool) {
	if strings.HasPrefix(part, "[") && strings.HasSuffix(part, "]") {
		var idx int
		fmt.Sscanf(part, "[%d]", &idx)
		return idx, true
	}
	return 0, false
}

// toFieldName 把 JSON 字段名（snake_case）转换为结构体字段名（PascalCase）。
// 例如 "full_name" → "FullName"。
func toFieldName(jsonField string) string {
	parts := strings.Split(jsonField, "_")
	for i, p := range parts {
		if len(p) > 0 {
			parts[i] = strings.ToUpper(p[:1]) + p[1:]
		}
	}
	return strings.Join(parts, "")
}
