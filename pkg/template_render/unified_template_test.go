package template_render

import (
	"os"
	"strings"
	"testing"

	"gosume/pkg/model"
)

// staticLoader returns a fixed template for the HTMLRenderer.
type staticLoader struct {
	t *Template
}

func (l staticLoader) LoadByID(id string) (*Template, error) { return l.t, nil }
func (l staticLoader) LoadAll() ([]*Template, error)         { return []*Template{l.t}, nil }

func unifiedTemplateForTest(t *testing.T) *Template {
	t.Helper()
	html, err := os.ReadFile("../../templates/template.html")
	if err != nil {
		t.Fatalf("read template.html: %v", err)
	}
	return &Template{
		Meta: TemplateMeta{ID: "unified-test"},
		HTML: string(html),
		CSS:  "body {}",
	}
}

// TestUnifiedTemplateRenders 验证统一 HTML（Gosume 一期改造）能被后端渲染器
// 解析并渲染出全部语义区与章节（覆盖所有数据形态的超集）。
func TestUnifiedTemplateRenders(t *testing.T) {
	r := NewHTMLRenderer(staticLoader{t: unifiedTemplateForTest(t)})
	out, err := r.RenderWithTemplate(sampleResumeForUnified(), unifiedTemplateForTest(t))
	if err != nil {
		t.Fatalf("RenderWithTemplate(unified) error = %v", err)
	}

	for _, want := range []string{
		`class="resume-page"`,
		`class="resume-container"`,
		`class="r-header"`,
		`class="r-header-text"`,
		`class="r-main"`,
		`class="r-avatar"`,
		`class="r-contact"`,
		`class="r-langs"`,
		`class="r-subtitle"`,
		`教育背景`, // 章节标题（i18n zh）
		`实习经历`,
		`工作经历`,
		`项目经历`,
		`荣誉奖项`,
		`技能`,
		`个人总结`,
		`skill-dot filled`,  // skillLevel 圆点
		`class="extra-row"`, // 项目 Extras
		`<ul class="highlights">`,
		`custom-item`,
		// data-id：方案 4（增量 diff）的稳定锚点，前端 morphdom / 未来 keyed diff 依赖。
		`data-id="i1"`,   // Internship
		`data-id="j1"`,   // Job
		`data-id="p1"`,   // Project
		`data-id="e1"`,   // Education
		`data-id="s1"`,   // SkillGroup
		`data-id="l1"`,   // Language
		`data-id="a1"`,   // Award
		`data-id="c1i1"`, // CustomItem
	} {
		if !strings.Contains(out, want) {
			t.Errorf("rendered unified HTML missing %q", want)
		}
	}
}

// TestUnifiedTemplateHidesEmptySections 验证空章节不输出（标题随数据自动隐藏）。
func TestUnifiedTemplateHidesEmptySections(t *testing.T) {
	tmpl := unifiedTemplateForTest(t)
	r := NewHTMLRenderer(staticLoader{t: tmpl})

	resume := &model.Resume{
		Version: "1.0",
		Meta:    model.ResumeMeta{TemplateID: "unified-test", Language: "zh-CN"},
		Personal: model.Personal{
			FullName: "测试",
		},
		// 无 jobs/education/projects 等数据
	}
	out, err := r.RenderWithTemplate(resume, tmpl)
	if err != nil {
		t.Fatalf("RenderWithTemplate(unified, empty) error = %v", err)
	}

	for _, absent := range []string{
		`class="experience-item"`,
		`class="education-item"`,
		`class="skill-category"`,
		`class="custom-item"`,
		`class="summary"`, // Summary 为空 → 个人总结隐藏
	} {
		if strings.Contains(out, absent) {
			t.Errorf("empty resume should not render %q", absent)
		}
	}
}

// TestUnifiedTemplateHiddenFiltered 验证统一 HTML 移除 Hidden 守卫后，
// 后端渲染由数据层 WithoutHidden 完成隐藏（与前端 toGoShape 语义一致）。
func TestUnifiedTemplateHiddenFiltered(t *testing.T) {
	tmpl := unifiedTemplateForTest(t)
	r := NewHTMLRenderer(staticLoader{t: tmpl})

	hidden := true
	resume := &model.Resume{
		Version: "1.0",
		Meta:    model.ResumeMeta{TemplateID: "unified-test", Language: "zh-CN"},
		Personal: model.Personal{
			FullName: "测试",
		},
		Summary:       "可见总结",
		SummaryHidden: &hidden,
		Jobs: []model.Job{
			{ID: "j-visible", Company: "可见公司", Title: "工程师"},
			{ID: "j-hidden", Company: "隐藏公司", Title: "工程师", Hidden: &hidden},
		},
		Skills: []model.SkillGroup{{
			ID:       "s1",
			Category: "技术",
			Items: []model.Skill{
				{Name: "Go", Level: 5},
				{Name: "隐藏技能", Level: 3, Hidden: &hidden},
			},
		}},
	}

	out, err := r.RenderWithTemplate(resume, tmpl)
	if err != nil {
		t.Fatalf("RenderWithTemplate(hidden) error = %v", err)
	}

	for _, want := range []string{"可见公司", "Go", "技术"} {
		if !strings.Contains(out, want) {
			t.Errorf("rendered output missing %q", want)
		}
	}
	for _, absent := range []string{"隐藏公司", "隐藏技能", "可见总结"} {
		if strings.Contains(out, absent) {
			t.Errorf("hidden content %q should not render", absent)
		}
	}
}

// TestAllBuiltinTemplatesRenderWithUnified 验证 16 套内置模板的 styles.css
// 都能与统一 HTML（templates/template.html）配对渲染（Gosume 一期改造 M3 验收）。
func TestAllBuiltinTemplatesRenderWithUnified(t *testing.T) {
	unifiedHTML, err := os.ReadFile("../../templates/template.html")
	if err != nil {
		t.Fatalf("read template.html: %v", err)
	}

	dirs, err := os.ReadDir("../../templates")
	if err != nil {
		t.Fatalf("read templates dir: %v", err)
	}

	rendered := 0
	for _, d := range dirs {
		if !d.IsDir() {
			continue
		}
		css, err := os.ReadFile("../../templates/" + d.Name() + "/styles.css")
		if err != nil {
			t.Fatalf("read styles.css of %s: %v", d.Name(), err)
		}
		tmpl := &Template{
			Meta: TemplateMeta{ID: d.Name()},
			HTML: string(unifiedHTML),
			CSS:  string(css),
		}
		r := NewHTMLRenderer(staticLoader{t: tmpl})
		out, err := r.RenderWithTemplate(sampleResumeForUnified(), tmpl)
		if err != nil {
			t.Fatalf("render %s with unified html: %v", d.Name(), err)
		}
		if !strings.Contains(out, `class="resume-page"`) {
			t.Fatalf("render %s: missing resume-page", d.Name())
		}
		rendered++
	}
	if rendered < 16 {
		t.Fatalf("expected 16 builtin templates, rendered %d", rendered)
	}
}

func sampleResumeForUnified() *model.Resume {
	return &model.Resume{
		Version: "1.0",
		Meta: model.ResumeMeta{
			TemplateID: "unified-test",
			Name:       "Unified",
			Language:   "zh-CN",
		},
		Personal: model.Personal{
			FullName:    "张三",
			EnglishName: "San Zhang",
			JobTitle:    "前端工程师",
			YearsOfExp:  5,
			Email:       "zhangsan@example.com",
			Phone:       "13800000000",
			Location:    "上海",
			Avatar:      "data:image/png;base64,AAAA",
		},
		Summary: "第一行\n第二行",
		Internships: []model.Internship{{
			ID:      "i1",
			Company: "实习公司",
			Title:   "实习生",
		}},
		Jobs: []model.Job{{
			ID:         "j1",
			Company:    "示例公司",
			Title:      "高级工程师",
			StartDate:  "2020.01",
			EndDate:    "",
			IsCurrent:  true,
			Summary:    "负责核心模块",
			Highlights: []string{"亮点一"},
		}},
		Projects: []model.Project{{
			ID:         "p1",
			Name:       "统一模板项目",
			Role:       "负责人",
			StartDate:  "2023.01",
			EndDate:    "2023.06",
			Summary:    "项目总结",
			Highlights: []string{"项目亮点"},
			Extras: []model.ExtraField{{
				Label: "链接",
				Value: "https://example.com",
			}},
		}},
		Education: []model.Education{{
			ID:        "e1",
			School:    "示例大学",
			Degree:    "本科",
			Major:     "计算机",
			StartDate: "2016.09",
			EndDate:   "2020.06",
		}},
		Skills: []model.SkillGroup{{
			ID:       "s1",
			Category: "前端",
			Items: []model.Skill{
				{Name: "React", Level: 5},
				{Name: "Go", Level: 3},
			},
		}},
		Languages: []model.Language{{
			ID:    "l1",
			Name:  "英语",
			Level: "流利",
		}},
		Awards: []model.Award{{
			ID:      "a1",
			Title:   "年度优秀员工",
			Issuer:  "示例公司",
			Summary: "奖励说明",
		}},
		Custom: []model.CustomSection{{
			ID:    "c1",
			Title: "自定义区块",
			Items: []model.CustomItem{{
				ID:          "c1i1",
				Title:       "自定义条目",
				Subtitle:    "副标题",
				Date:        "2024",
				Description: "描述内容",
				Highlights:  []string{"自定义亮点"},
			}},
		}},
	}
}
