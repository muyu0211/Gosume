package template

import (
	"gosume/pkg/resume/dto"
	"gosume/pkg/resume/vo"
)

// TemplateLister 抽象「列出全部可用模板」能力，*template.Loader 已实现。
// 以接口而非具体类型接收，便于单测注入假实现。
type TemplateLister interface {
	LoadAll() ([]*dto.Template, error)
}

// TemplateResolution 是导入时的模板匹配结果。
type TemplateResolution struct {
	ReferencedID   string            `json:"referenced_id"`        // 文件引用的模板 id
	ReferencedName string            `json:"referenced_name"`      // 文件引用的模板名
	Matched        bool              `json:"matched"`              // 是否命中当前环境的现有模板
	MatchedID      string            `json:"matched_id,omitempty"` // 命中的模板 id
	Available      []vo.TemplateMeta `json:"available"`            // 未命中时供用户选择的模板列表
}

// ResolveTemplate 解析文件中的模板引用，匹配优先级：
//
//  1. 按 template id 精确匹配；
//  2. 失败则按 template name 精确匹配；
//  3. 均失败 → Matched=false，Available 携带当前全部模板（含元数据）
//     供前端引导用户手动选择替代模板。
func ResolveTemplate(lister TemplateLister, referencedID, referencedName string) TemplateResolution {
	res := TemplateResolution{
		ReferencedID:   referencedID,
		ReferencedName: referencedName,
		Available:      []vo.TemplateMeta{},
	}

	tmpls, err := lister.LoadAll()
	if err != nil {
		return res
	}

	for _, t := range tmpls {
		if t.Meta.ID == referencedID {
			res.Matched = true
			res.MatchedID = t.Meta.ID
			return res
		}
	}

	if referencedName != "" {
		for _, t := range tmpls {
			if t.Meta.Name == referencedName {
				res.Matched = true
				res.MatchedID = t.Meta.ID
				return res
			}
		}
	}

	for _, t := range tmpls {
		res.Available = append(res.Available, toMeta(t))
	}
	return res
}

// toMeta 与 service.getTemplateMeta 字段保持一致（template 包独立维护
// 转换，避免跨包依赖 service 未导出函数）。
func toMeta(t *dto.Template) vo.TemplateMeta {
	return vo.TemplateMeta{
		ID:              t.Meta.ID,
		Name:            t.Meta.Name,
		Version:         t.Meta.Version,
		Author:          t.Meta.Author,
		Description:     t.Meta.Description,
		Category:        t.Meta.Category,
		Tags:            t.Meta.Tags,
		TargetLanguage:  t.Meta.TargetLanguage,
		PageCount:       t.Meta.PageCount,
		PaperSize:       t.Meta.PaperSize,
		Colors:          t.Meta.Colors,
		Features:        t.Meta.Features,
		UsesUnifiedHTML: t.Meta.UseUnifiedHTML,
		IsBuiltin:       t.IsBuiltin,
	}
}
