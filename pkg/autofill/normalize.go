package autofill

import (
	"strconv"
	"strings"
	"time"

	"gosume/pkg/resume/model"
)

// Payload 是扩展取走的简历规范化数据结构。
//
// Fields 用稳定的规范键（canonical key）暴露常用的文本类字段，是扩展启发式
// 匹配表单控件的主要来源；各经历数组用于更精细的逐个填写。数据 == 对应用户
// 简历的原始语义，字段键属于扩展与 Go 之间的内部契约，可随能力演进。
type Payload struct {
	ResumeName  string            `json:"resume_name"`
	UpdatedAt   string            `json:"updated_at"`
	Fields      map[string]string `json:"fields"`
	Personal    model.Personal    `json:"personal"`
	Summary     string            `json:"summary"`
	Education   []model.Education `json:"education"`
	Jobs        []model.Job       `json:"jobs"`
	Internships []model.Internship `json:"internships"`
	Projects    []model.Project   `json:"projects"`
	Skills      []string          `json:"skills"`
	Languages   []model.Language  `json:"languages"`
	Awards      []model.Award     `json:"awards"`
}

// Normalize 把简历折叠为扩展可直接消费的 Payload。
// Hidden 条目不参与输出；Summary 为隐藏时置空。
func Normalize(r *model.Resume) Payload {
	p := Payload{
		ResumeName:  r.Meta.Name,
		UpdatedAt:   r.Meta.UpdatedAt.Format(time.RFC3339),
		Fields:      map[string]string{},
		Personal:    r.Personal,
		Education:   visibleEducation(r.Education),
		Jobs:        visibleJobs(r.Jobs),
		Internships: visibleInternships(r.Internships),
		Projects:    visibleProjects(r.Projects),
		Skills:      flattenSkills(r.Skills),
		Languages:   visibleLanguages(r.Languages),
		Awards:      visibleAwards(r.Awards),
	}

	if r.PersonalSummary.Summary != "" && !isHidden(r.PersonalSummary.Hidden) {
		p.Summary = r.PersonalSummary.Summary
	}

	f := p.Fields
	per := r.Personal
	put(f, "name", per.FullName)
	put(f, "english_name", per.EnglishName)
	put(f, "email", per.Email)
	put(f, "phone", per.Phone)
	put(f, "wechat", per.Wechat)
	put(f, "qq", per.QQ)
	put(f, "location", per.Location)
	put(f, "website", per.Website)
	put(f, "linkedin", per.LinkedIn)
	put(f, "github", per.GitHub)
	put(f, "birthday", per.Birthday)
	put(f, "gender", per.Gender)
	put(f, "target_position", per.JobTitle)
	if per.YearsOfExp > 0 {
		put(f, "years_of_exp", strconv.Itoa(per.YearsOfExp))
	}
	put(f, "summary", p.Summary)

	// 取首条可见教育经历填充常用表单字段。
	if len(p.Education) > 0 {
		e := p.Education[0]
		put(f, "school", e.School)
		put(f, "degree", e.Degree)
		put(f, "major", e.Major)
		put(f, "minor", e.Minor)
		put(f, "gpa", e.GPA)
		put(f, "edu_start_date", e.StartDate)
		put(f, "edu_end_date", e.EndDate)
	}

	// 取首条可见工作经历填充常用表单字段。
	if len(p.Jobs) > 0 {
		j := p.Jobs[0]
		put(f, "company", j.Company)
		put(f, "work_position", j.Title)
		put(f, "work_start_date", j.StartDate)
		put(f, "work_end_date", j.EndDate)
	}

	if len(p.Skills) > 0 {
		put(f, "skills", strings.Join(p.Skills, ", "))
	}
	return p
}

func put(m map[string]string, k, v string) {
	if strings.TrimSpace(v) != "" {
		m[k] = v
	}
}

func isHidden(h *bool) bool { return h != nil && *h }

func visibleEducation(list []model.Education) []model.Education {
	out := list[:0:0]
	for _, e := range list {
		if !isHidden(e.Hidden) {
			out = append(out, e)
		}
	}
	return out
}

func visibleJobs(list []model.Job) []model.Job {
	out := list[:0:0]
	for _, j := range list {
		if !isHidden(j.Hidden) {
			out = append(out, j)
		}
	}
	return out
}

func visibleInternships(list []model.Internship) []model.Internship {
	out := list[:0:0]
	for _, it := range list {
		if !isHidden(it.Hidden) {
			out = append(out, it)
		}
	}
	return out
}

func visibleProjects(list []model.Project) []model.Project {
	out := list[:0:0]
	for _, pj := range list {
		if !isHidden(pj.Hidden) {
			out = append(out, pj)
		}
	}
	return out
}

func visibleLanguages(list []model.Language) []model.Language {
	out := list[:0:0]
	for _, l := range list {
		if !isHidden(l.Hidden) {
			out = append(out, l)
		}
	}
	return out
}

func visibleAwards(list []model.Award) []model.Award {
	out := list[:0:0]
	for _, a := range list {
		if !isHidden(a.Hidden) {
			out = append(out, a)
		}
	}
	return out
}

func flattenSkills(groups []model.SkillGroup) []string {
	var names []string
	for _, g := range groups {
		if isHidden(g.Hidden) {
			continue
		}
		for _, s := range g.Items {
			if !isHidden(s.Hidden) && strings.TrimSpace(s.Name) != "" {
				names = append(names, s.Name)
			}
		}
	}
	return names
}