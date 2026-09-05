package model

import (
	"encoding/json"
	"fmt"
	"time"
)

// Resume 是简历的根结构。
//
// SummaryHidden 控制「个人总结」区块是否显示。使用指针 + omitempty 是为了兼容
// 历史数据：字段缺失时视为显示。
type Resume struct {
	Version         string          `json:"version"`
	Meta            ResumeMeta      `json:"meta"`
	Personal        Personal        `json:"personal"`
	PersonalSummary PersonalSummary `json:"personal_summary"`
	Internships     []Internship    `json:"internships,omitempty"`
	Jobs            []Job           `json:"jobs,omitempty"`
	Projects        []Project       `json:"projects,omitempty"`
	Education       []Education     `json:"education,omitempty"`
	Skills          []SkillGroup    `json:"skills,omitempty"`
	Languages       []Language      `json:"languages,omitempty"`
	Awards          []Award         `json:"awards,omitempty"`
	Custom          []CustomSection `json:"custom,omitempty"`
	CustomCSS       string          `json:"custom_css,omitempty"`
}

type PersonalSummary struct {
	Summary string `json:"summary,omitempty"`
	Hidden  *bool  `json:"hidden,omitempty"`
}

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
	TemplateID  string    `json:"template_id"`
	Name        string    `json:"name"`
	Language    string    `json:"language"`
	FontSize    FontSize  `json:"font_size"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	ExportCount int       `json:"export_count"`
}

// SchemaVersion 是简历数据的 schema 版本，与 App 版本（config.yaml 的 app.version）
// 解耦。字段结构未变时保持 "1.0"。NewResume 与前端 sampleData 均以本常量为准。
//
// v1.1：新增 per-resume custom_css（样式定制统一由注入 CSS 承载），并从
// personal 移除 avatar_width/height/avatar_radius/header_layout 四个样式字段。
// 不再做样式迁移兼容：旧数据缺失这些样式时 custom_css 为空，渲染回退模板原生外观。
const SchemaVersion = "1.1"

// Migrate 把原始 JSON 反序列化为 Resume，并统一 version 为当前 SchemaVersion。
// 不迁移任何字段：本次改动仅涉及样式渲染，旧数据丢失的样式（页边距/内容间距/
// 头像尺寸/圆角/布局）由模板初始值兜底。
func Migrate(rawJSON []byte) (*Resume, error) {
	var versionInfo struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(rawJSON, &versionInfo); err != nil {
		return nil, fmt.Errorf("parse version: %w", err)
	}

	switch versionInfo.Version {
	case SchemaVersion, "1.0", "1.0.0":
		var r Resume
		if err := json.Unmarshal(rawJSON, &r); err != nil {
			return nil, fmt.Errorf("unmarshal %q: %w", versionInfo.Version, err)
		}
		r.Version = SchemaVersion
		return &r, nil
	case "":
		return nil, fmt.Errorf("missing version field, cannot load")
	default:
		return nil, fmt.Errorf("unsupported data version: %s", versionInfo.Version)
	}
}
