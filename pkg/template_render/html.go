package template_render

import (
	"bytes"
	"fmt"
	"html/template"
	"strings"

	"gosume/pkg/model"
)

// HTMLRenderer 使用 Go html/template 把简历数据渲染为 HTML 字符串。
type HTMLRenderer struct {
	templateLoader TemplateLoader
	funcMap        template.FuncMap
}

// TemplateLoader 是模板加载能力的抽象接口。
type TemplateLoader interface {
	LoadByID(id string) (*Template, error)
	LoadAll() ([]*Template, error)
}

// Template 是 render 包内使用的模板结构，对模板系统的类型做了适配封装。
type Template struct {
	Meta    TemplateMeta
	HTML    string
	CSS     string
	DirPath string
}

// TemplateMeta 是渲染器所需的最小模板元数据。
type TemplateMeta struct {
	ID string
}

// TemplateMetaMinimal 用于满足 TemplateLoader 接口对元数据的最小要求。
type TemplateMetaMinimal interface {
	GetID() string
}

// NewHTMLRenderer 创建 HTML 渲染器，并注册模板可用的自定义函数。
func NewHTMLRenderer(loader TemplateLoader) *HTMLRenderer {
	r := &HTMLRenderer{
		templateLoader: loader,
	}
	r.funcMap = template.FuncMap{
		"dateRange":  dateRange,
		"skillLevel": skillLevel,
		"i18n":       i18n,
		"nl2br":      nl2br,
		"safeHTML":   safeHTML,
		"safeURL":    safeURL,
		"defaultVal": defaultVal,
	}
	return r
}

// Render 使用 resume.Meta.TemplateID 指定的模板渲染简历。
// TemplateID 为空时回退到默认模板。
func (r *HTMLRenderer) Render(resume *model.Resume) (string, error) {
	tmplID := resume.Meta.TemplateID
	if tmplID == "" {
		tmplID = "a406004d-d3b8-4900-969f-8094f8e85cf0"
	}

	tmpl, err := r.templateLoader.LoadByID(tmplID)
	if err != nil {
		return "", fmt.Errorf("load template %s: %w", tmplID, err)
	}

	return r.RenderWithTemplate(resume, tmpl)
}

// RenderWithTemplate 使用指定模板渲染简历。
//
// 渲染前先过滤隐藏条目；若模板 HTML 引用了 {{template "styles.css"}}，
// 会把 CSS 注册为同名子模板后再解析。
func (r *HTMLRenderer) RenderWithTemplate(resume *model.Resume, tmpl *Template) (string, error) {
	if tmpl.HTML == "" {
		return "", fmt.Errorf("template %s has no HTML content", tmpl.Meta.ID)
	}

	// Gosume 一期：统一 HTML 不写 Hidden 守卫，隐藏由数据层负责（前端 toGoShape /
	// 后端 WithoutHidden），两处语义保持一致。
	resume = resume.WithoutHidden()

	t := template.New("resume").Funcs(r.funcMap)

	// 模板 HTML 若引用 {{template "styles.css"}}，需先注册同名子模板
	if strings.Contains(tmpl.HTML, `{{template "styles.css"`) {
		if tmpl.CSS != "" {
			if _, err := t.New("styles.css").Parse(tmpl.CSS); err != nil {
				return "", fmt.Errorf("parse css template: %w", err)
			}
		}
	}

	t, err := t.Parse(tmpl.HTML)
	if err != nil {
		return "", fmt.Errorf("parse template: %w", err)
	}

	var buf bytes.Buffer
	if err := t.Execute(&buf, resume); err != nil {
		return "", fmt.Errorf("execute template: %w", err)
	}

	return buf.String(), nil
}

// --- 模板自定义函数 ---

// dateRange 拼接起止日期；在职或无结束日期时显示为「至今」。
func dateRange(start, end string, isCurrent bool) string {
	if start == "" {
		return ""
	}
	if isCurrent || end == "" {
		return start + " - 至今"
	}
	return start + " - " + end
}

// skillLevel 把 0–5 的技能等级渲染为 5 个圆点，前 level 个为实心。
func skillLevel(level int) template.HTML {
	var buf strings.Builder
	for i := 0; i < 5; i++ {
		if i < level {
			buf.WriteString(`<span class="skill-dot filled"></span>`)
		} else {
			buf.WriteString(`<span class="skill-dot"></span>`)
		}
	}
	return template.HTML(buf.String())
}

// i18n 按语言选择文案：lang 为 zh-CN 时返回中文，否则返回英文。
func i18n(lang, zhKey, enKey string) string {
	if lang == "zh-CN" {
		return zhKey
	}
	return enKey
}

// nl2br 先做 HTML 转义，再把换行替换为 <br>。
// 因为转义在替换之前完成，用户输入不会被当作标签解析。
func nl2br(s string) template.HTML {
	escaped := template.HTMLEscapeString(s)
	return template.HTML(strings.ReplaceAll(escaped, "\n", "<br>"))
}

// safeHTML 把字符串标记为可信 HTML，跳过自动转义。
//
// 安全提示：该函数会绕过 html/template 的 XSS 防护，仅可用于模板自身提供的
// 可信片段，切勿传入用户输入的简历内容。
func safeHTML(s string) template.HTML {
	return template.HTML(s)
}

// safeURL 把字符串标记为可信 URL，跳过 URL 过滤。
//
// 安全提示：会绕过 html/template 对 javascript: 等危险协议的拦截，
// 仅可用于可信来源的链接。
func safeURL(s string) template.URL {
	return template.URL(s)
}

// defaultVal 在 val 为空时返回 defaultVal，否则返回 val。
// 参数顺序为 (默认值, 实际值)，便于在模板中以管道方式调用。
func defaultVal(defaultVal, val string) string {
	if val == "" {
		return defaultVal
	}
	return val
}
