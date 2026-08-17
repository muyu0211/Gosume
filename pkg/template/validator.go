package template

import (
	"fmt"
	"reflect"

	"gosume/pkg/model"
)

// ValidationResult 是简历数据针对模板要求的校验结果。
type ValidationResult struct {
	Valid    bool     `json:"valid"`
	Warnings []string `json:"warnings"`
	Errors   []string `json:"errors"`
}

// ValidateDataForTemplate 校验简历数据是否满足模板的字段要求。
//
// 模板未声明 data_schema 时视为无约束，直接返回校验通过。
// 列表型区块（jobs/education/skills）会逐条校验并在错误信息中标注下标。
func ValidateDataForTemplate(tmpl *Template, resume *model.Resume) *ValidationResult {
	result := &ValidationResult{Valid: true}
	if tmpl.Meta.DataSchema == nil {
		return result
	}

	schema := tmpl.Meta.DataSchema
	if schema.Personal != nil {
		checkRequired(result, "personal", resume.Personal, schema.Personal.Required)
	}

	if schema.Jobs != nil {
		for i, job := range resume.Jobs {
			checkRequired(result, fmt.Sprintf("jobs[%d]", i), job, schema.Jobs.Required)
		}
	}

	if schema.Education != nil {
		for i, edu := range resume.Education {
			checkRequired(result, fmt.Sprintf("education[%d]", i), edu, schema.Education.Required)
		}
	}

	if schema.Skills != nil {
		for i, sg := range resume.Skills {
			checkRequired(result, fmt.Sprintf("skills[%d]", i), sg, schema.Skills.Required)
		}
	}

	return result
}

// checkRequired 通过反射检查 obj 上的必填字段是否为零值，
// 缺失时向 result 追加错误并标记校验不通过。
func checkRequired(result *ValidationResult, section string, obj any, required []string) {
	v := reflect.ValueOf(obj)
	for _, field := range required {
		f := v.FieldByName(toFieldName(field))
		if !f.IsValid() || f.IsZero() {
			result.Errors = append(result.Errors,
				fmt.Sprintf("缺少必填字段: %s.%s", section, field))
			result.Valid = false
		}
	}
}

// toFieldName 把 JSON 字段名（snake_case）转换为结构体字段名（PascalCase）。
// 例如 "full_name" → "FullName"。
func toFieldName(jsonField string) string {
	parts := split(jsonField, "_")
	for i, p := range parts {
		if len(p) > 0 {
			parts[i] = string(p[0]-32) + p[1:]
		}
	}
	return join(parts, "")
}

// split 按 sep 的首字节切分字符串（本包内部使用的轻量实现）。
func split(s, sep string) []string {
	var parts []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == sep[0] {
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	parts = append(parts, s[start:])
	return parts
}

// join 用 sep 连接字符串切片（本包内部使用的轻量实现）。
func join(parts []string, sep string) string {
	if len(parts) == 0 {
		return ""
	}
	result := parts[0]
	for i := 1; i < len(parts); i++ {
		result += sep + parts[i]
	}
	return result
}
