package template

import (
	"fmt"
	"reflect"

	"gosume/pkg/model"
)

// ValidationResult holds the result of validating resume data against a template.
type ValidationResult struct {
	Valid    bool     `json:"valid"`
	Warnings []string `json:"warnings"`
	Errors   []string `json:"errors"`
}

// ValidateDataForTemplate checks if resume data satisfies the template's requirements.
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

func toFieldName(jsonField string) string {
	parts := split(jsonField, "_")
	for i, p := range parts {
		if len(p) > 0 {
			parts[i] = string(p[0]-32) + p[1:]
		}
	}
	return join(parts, "")
}

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
