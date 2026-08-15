package model

// WithoutHidden 返回一份移除了 Hidden 条目的副本。
//
// Gosume 一期：统一 HTML 不再写 {{if not .Hidden}} 守卫，隐藏完全由数据层负责——
// 后端渲染前调用本方法，过滤语义与前端 templateEngine.ts toGoShape 保持一致：
//   - 各条目数组（internships/jobs/projects/education/skills/languages/awards/custom）
//     移除 Hidden=true 的条目；
//   - SkillGroup.Items / CustomSection.Items 移除 Hidden=true 的子项；
//   - summary_hidden=true 时清空 Summary（对应前端 toGoShape 的 drop）。
//
// 原始 resume 不被修改。
func (r *Resume) WithoutHidden() *Resume {
	if r == nil {
		return nil
	}
	out := *r
	out.Internships = filterHidden(r.Internships, func(i *Internship) bool { return i.Hidden != nil && *i.Hidden })
	out.Jobs = filterHidden(r.Jobs, func(j *Job) bool { return j.Hidden != nil && *j.Hidden })
	out.Projects = filterHidden(r.Projects, func(p *Project) bool { return p.Hidden != nil && *p.Hidden })
	out.Education = filterHidden(r.Education, func(e *Education) bool { return e.Hidden != nil && *e.Hidden })
	out.Skills = filterHidden(r.Skills, func(s *SkillGroup) bool { return s.Hidden != nil && *s.Hidden })
	out.Languages = filterHidden(r.Languages, func(l *Language) bool { return l.Hidden != nil && *l.Hidden })
	out.Awards = filterHidden(r.Awards, func(a *Award) bool { return a.Hidden != nil && *a.Hidden })
	out.Custom = filterHidden(r.Custom, func(c *CustomSection) bool { return c.Hidden != nil && *c.Hidden })

	for i := range out.Skills {
		out.Skills[i].Items = filterHidden(out.Skills[i].Items, func(s *Skill) bool { return s.Hidden != nil && *s.Hidden })
	}
	for i := range out.Custom {
		out.Custom[i].Items = filterHidden(out.Custom[i].Items, func(c *CustomItem) bool { return c.Hidden != nil && *c.Hidden })
	}

	if r.SummaryHidden != nil && *r.SummaryHidden {
		out.Summary = ""
	}
	return &out
}

func filterHidden[T any](items []T, isHidden func(*T) bool) []T {
	out := make([]T, 0, len(items))
	for i := range items {
		if !isHidden(&items[i]) {
			out = append(out, items[i])
		}
	}
	return out
}
