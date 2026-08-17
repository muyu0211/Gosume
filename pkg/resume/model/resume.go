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

// WithoutHidden 返回一份移除了 Hidden 条目的副本。
//
// Gosume 一期：统一 HTML 不再写 {{if not .Hidden}} 守卫，隐藏完全由数据层负责——
// 后端渲染前调用本方法，过滤语义与前端 templateEngine.ts toGoShape 保持一致：
//   - 各条目数组（internships/jobs/projects/education/skills/languages/awards/custom）
//     移除 Hidden=true 的条目；
//   - SkillGroup.Items / CustomSection.Items 移除 Hidden=true 的子项；
//   - personal_summary.hidden=true 时清空 PersonalSummary.Summary（对应前端
//     templateEngine.ts toGoShape 清空 summary 文本，与模板 {{if .PersonalSummary.Summary}} 对齐）。
//
// 原始 resume 不被修改。
func (r *Resume) WithoutHidden() *Resume {
	if r == nil {
		return nil
	}
	out := *r
	// 单元素：PersonalSummary 隐藏时清空 Summary（非切片，不能用 filterSlice）。
	out.PersonalSummary = filterItem(r.PersonalSummary, func(p *PersonalSummary) bool { return hiddenOf(p.Hidden) })
	// 切片：各条目数组移除 Hidden=true 的条目。
	out.Internships = filterSlice(r.Internships, func(i *Internship) bool { return hiddenOf(i.Hidden) })
	out.Jobs = filterSlice(r.Jobs, func(j *Job) bool { return hiddenOf(j.Hidden) })
	out.Projects = filterSlice(r.Projects, func(p *Project) bool { return hiddenOf(p.Hidden) })
	out.Education = filterSlice(r.Education, func(e *Education) bool { return hiddenOf(e.Hidden) })
	out.Languages = filterSlice(r.Languages, func(l *Language) bool { return hiddenOf(l.Hidden) })
	out.Awards = filterSlice(r.Awards, func(a *Award) bool { return hiddenOf(a.Hidden) })
	// Group：先过滤组本身，再过滤每组 Items 子项。
	out.Skills = filterGroup(r.Skills,
		func(s *SkillGroup) bool { return hiddenOf(s.Hidden) },
		func(s SkillGroup) SkillGroup {
			s.Items = filterSlice(s.Items, func(i *Skill) bool { return hiddenOf(i.Hidden) })
			return s
		},
	)
	out.Custom = filterGroup(r.Custom,
		func(c *CustomSection) bool { return hiddenOf(c.Hidden) },
		func(c CustomSection) CustomSection {
			c.Items = filterSlice(c.Items, func(i *CustomItem) bool { return hiddenOf(i.Hidden) })
			return c
		},
	)
	return &out
}

// hiddenOf 统一的「是否隐藏」判定：Hidden 为 nil（历史数据）或 false 视为显示，
// 仅 Hidden != nil 且为 true 时才隐藏。供所有过滤函数复用，避免各处重复
// `i.Hidden != nil && *i.Hidden` 写法。
func hiddenOf(h *bool) bool {
	return h != nil && *h
}

// filterSlice 过滤切片中 Hidden 为 true 的元素，返回新切片（不修改入参）。
func filterSlice[T any](items []T, isHidden func(*T) bool) []T {
	out := make([]T, 0, len(items))
	for i := range items {
		if !isHidden(&items[i]) {
			out = append(out, items[i])
		}
	}
	return out
}

// filterItem 过滤单个元素：隐藏时返回 T 的零值（即「丢弃」），否则原样返回。
// 适用于 PersonalSummary 这类非切片字段——隐藏即清空其语义内容。
func filterItem[T any](item T, isHidden func(*T) bool) T {
	if isHidden(&item) {
		var zero T
		return zero
	}
	return item
}

// filterGroup 过滤「带子项切片的组」：先过滤组本身（Hidden 的组整体丢弃），
// 再对每个保留的组调用 itemsFilter 过滤其 Items 子项。itemsFilter 由调用方
// 提供（因 Items 字段名/类型因组而异），接收整组、返回子项已过滤的整组，
// 从而一套逻辑同时覆盖 SkillGroup、CustomSection 等所有 Group 结构。
func filterGroup[T any](
	groups []T,
	isGroupHidden func(*T) bool,
	itemsFilter func(T) T,
) []T {
	out := make([]T, 0, len(groups))
	for i := range groups {
		if isGroupHidden(&groups[i]) {
			continue
		}
		out = append(out, itemsFilter(groups[i]))
	}
	return out
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
