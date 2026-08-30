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
}

type PersonalSummary struct {
	Summary string `json:"summary,omitempty"`
	Hidden  *bool  `json:"hidden,omitempty"`
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

// SchemaVersion 是简历数据的 schema 版本，与 App 版本（config.yaml 的 app.version）
// 解耦。字段结构未变时保持 "1.0"。NewResume 与前端 sampleData 均以本常量为准。
const SchemaVersion = "1.0"

// Migrate 把原始 JSON 反序列化为 Resume，并处理版本差异。
//
// 先只解析 version 字段，再按版本选择对应的解析逻辑；缺失或不支持的版本返回错误。
// 兼容历史数据：早期实现误把 App 版本号（如 "1.0.0"）写入了 version 字段，
// 其结构与 "1.0" 完全一致，此处一并按 1.0 解析并规范化回 "1.0"。
func Migrate(rawJSON []byte) (*Resume, error) {
	var versionInfo struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(rawJSON, &versionInfo); err != nil {
		return nil, fmt.Errorf("parse version: %w", err)
	}

	switch versionInfo.Version {
	case "1.0", "1.0.0":
		var r Resume
		if err := json.Unmarshal(rawJSON, &r); err != nil {
			return nil, fmt.Errorf("unmarshal v1.0: %w", err)
		}
		r.Version = SchemaVersion
		return &r, nil
	case "":
		return nil, fmt.Errorf("missing version field, cannot migrate")
	default:
		return nil, fmt.Errorf("unsupported data version: %s", versionInfo.Version)
	}
}
