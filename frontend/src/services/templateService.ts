import type { TemplateMeta } from '../types/template'
import type { TemplateSet } from '../lib/template-engine'

const TEMPLATES_KEY = 'resume-craft-templates'

/**
 * Loads template metadata and content. In Wails mode, calls Go TemplateService.
 * In dev mode, loads built-in templates from the bundled definitions.
 */
export async function loadTemplateMetas(): Promise<TemplateMeta[]> {
  // Try loading from localStorage cache first
  const cached = localStorage.getItem(TEMPLATES_KEY)
  if (cached) {
    try {
      return JSON.parse(cached)
    } catch { /* ignore */ }
  }

  // Use built-in defaults (synced with templates/ directory + WelcomePage defaults)
  const defaults = getDefaultTemplates()
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(defaults))
  return defaults
}

export async function loadTemplateContent(templateId: string): Promise<TemplateSet> {
  // In production, fetch from Go backend via Wails
  // For now, return built-in template content
  return getBuiltinTemplateContent(templateId)
}

export async function saveTemplateMetas(templates: TemplateMeta[]): Promise<void> {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates))
}

function getDefaultTemplates(): TemplateMeta[] {
  return [
    {
      id: 'modern',
      name: '现代专业风',
      version: '1.0.0',
      author: { name: 'Resume Craft' },
      description: '适合互联网行业求职者，简洁干净的双栏布局',
      category: 'tech',
      tags: ['简洁', '双栏', '科技'],
      target_language: ['zh-CN', 'en-US'],
      page_count: { min: 1, max: 2, default: 1 },
      paper_size: 'A4',
      colors: { primary: '#2563EB', secondary: '#1E40AF', text: '#1F2937', background: '#FFFFFF', accent: '#DBEAFE' },
    },
    {
      id: 'classic',
      name: '经典正式风',
      version: '1.0.0',
      author: { name: 'Resume Craft' },
      description: '适合传统行业和正式场合，单栏布局，沉稳大气',
      category: 'business',
      tags: ['经典', '单栏', '正式'],
      target_language: ['zh-CN', 'en-US'],
      page_count: { min: 1, max: 2, default: 1 },
      paper_size: 'A4',
      colors: { primary: '#1F2937', secondary: '#374151', text: '#111827', background: '#FFFFFF', accent: '#F3F4F6' },
    },
  ]
}

function getBuiltinTemplateContent(templateId: string): TemplateSet {
  if (templateId === 'modern') return MODERN_TEMPLATE
  return CLASSIC_TEMPLATE
}

// Built-in template content — synced with templates/modern/ and templates/classic/
const MODERN_TEMPLATE: TemplateSet = {
  html: `<!DOCTYPE html>
<html lang="{{.Meta.Language}}">
<head>
    <meta charset="UTF-8">
    <title>{{.Personal.FullName}} - 简历</title>
    <style>{{template "styles.css" .}}</style>
</head>
<body class="resume-page">
    <div class="resume-container">
        <div class="header">
            <div class="header-left">
                <h1>{{.Personal.FullName}}</h1>
                {{if .Personal.EnglishName}}<div class="english-name">英文名：{{.Personal.EnglishName}}</div>{{end}}
                {{if .Personal.JobTitle}}<div class="job-title">职位：{{.Personal.JobTitle}}</div>{{end}}
                {{if .Personal.YearsOfExp}}<div class="years-exp">工作年限：{{.Personal.YearsOfExp}}年</div>{{end}}
                <div class="contact-info">
                    {{if .Personal.Email}}<span class="contact-item"><span class="contact-label">邮箱：</span>{{.Personal.Email}}</span>{{end}}
                    {{if .Personal.Phone}}<span class="contact-item"><span class="contact-label">手机：</span>{{.Personal.Phone}}</span>{{end}}
                    {{if .Personal.Wechat}}<span class="contact-item"><span class="contact-label">微信：</span>{{.Personal.Wechat}}</span>{{end}}
                    {{if .Personal.QQ}}<span class="contact-item"><span class="contact-label">QQ：</span>{{.Personal.QQ}}</span>{{end}}
                    {{if .Personal.Location}}<span class="contact-item"><span class="contact-label">城市：</span>{{.Personal.Location}}</span>{{end}}
                </div>
                <div class="contact-info">
                    {{if .Personal.Website}}<span class="contact-item"><span class="contact-label">网站：</span>{{.Personal.Website}}</span>{{end}}
                    {{if .Personal.GitHub}}<span class="contact-item"><span class="contact-label">GitHub：</span>{{.Personal.GitHub}}</span>{{end}}
                    {{if .Personal.LinkedIn}}<span class="contact-item"><span class="contact-label">LinkedIn：</span>{{.Personal.LinkedIn}}</span>{{end}}
                </div>
            </div>
            {{if .Personal.Avatar}}<div class="header-avatar"><img src="{{.Personal.Avatar}}" alt="头像" /></div>{{end}}
        </div>
        {{if .Summary}}
        <div class="summary">个人总结：{{nl2br .Summary}}</div>
        {{end}}
        {{if .Jobs}}
        <div class="section-title">工作经历</div>
        {{range .Jobs}}
        <div class="experience-item">
            <div class="exp-header">
                <div>
                    <span class="company">公司：{{.Company}}</span>
                    {{if .Title}}<span class="title"> · 职位：{{.Title}}</span>{{end}}
                </div>
                <span class="date">{{dateRange .StartDate .EndDate .IsCurrent}}</span>
            </div>
            {{if .Location}}<div class="exp-location">地点：{{.Location}}</div>{{end}}
            {{if .Summary}}<div class="exp-summary">概述：{{.Summary}}</div>{{end}}
            {{if .Highlights}}
            <ul class="highlights">
                {{range .Highlights}}
                <li>{{.}}</li>
                {{end}}
            </ul>
            {{end}}
        </div>
        {{end}}
        {{end}}
        {{if .Education}}
        <div class="section-title">教育背景</div>
        {{range .Education}}
        <div class="education-item">
            <div class="edu-header">
                <span class="school">学校：{{.School}}</span>
                <span class="date">{{.StartDate}} - {{.EndDate}}</span>
            </div>
            <div class="edu-detail">学位：{{.Degree}} · 专业：{{.Major}}{{if .Minor}} · 辅修：{{.Minor}}{{end}}{{if .GPA}} · GPA：{{.GPA}}{{end}}</div>
            {{if .Highlights}}
            <ul class="highlights">
                {{range .Highlights}}
                <li>{{.}}</li>
                {{end}}
            </ul>
            {{end}}
        </div>
        {{end}}
        {{end}}
        {{if .Skills}}
        <div class="section-title">技能</div>
        <div class="skills-grid">
            {{range .Skills}}
            <div class="skill-category">
                <h4>技能分类：{{.Category}}</h4>
                {{range .Items}}
                <div class="skill-item">
                    <span>{{.Name}}</span>
                    {{if .Level}}<div class="skill-dots">{{skillLevel .Level}}</div>{{end}}
                </div>
                {{end}}
            </div>
            {{end}}
        </div>
        {{end}}
        {{if .Languages}}
        <div class="section-title">语言能力</div>
        <div class="inline-list">
            {{range .Languages}}
            <span><span class="label">{{.Name}}:</span> {{.Level}}</span>
            {{end}}
        </div>
        {{end}}
        {{if .Projects}}
        <div class="section-title">项目经历</div>
        {{range .Projects}}
        <div class="experience-item">
            <div class="exp-header">
                <div>
                    <span class="company">项目：{{.Name}}</span>
                    {{if .Role}}<span class="title"> · 角色：{{.Role}}</span>{{end}}
                </div>
                {{if .StartDate}}<span class="date">{{dateRange .StartDate .EndDate false}}</span>{{end}}
            </div>
            {{if .Summary}}<div class="exp-summary">概述：{{.Summary}}</div>{{end}}
            {{if .Highlights}}
            <ul class="highlights">
                {{range .Highlights}}
                <li>{{.}}</li>
                {{end}}
            </ul>
            {{end}}
        </div>
        {{end}}
        {{end}}
        {{if .Awards}}
        <div class="section-title">奖项荣誉</div>
        {{range .Awards}}
        <div class="custom-item">
            <h4>奖项：{{.Title}}</h4>
            <div class="subtitle">日期：{{.Date}}{{if .Issuer}} · 颁发机构：{{.Issuer}}{{end}}</div>
            {{if .Summary}}<div class="exp-summary">说明：{{.Summary}}</div>{{end}}
        </div>
        {{end}}
        {{end}}
        {{if .Custom}}
        {{range .Custom}}
        <div class="section-title">{{.Title}}</div>
        {{range .Items}}
        <div class="custom-item">
            <h4>{{.Title}}</h4>
            {{if .Subtitle}}<div class="subtitle">{{.Subtitle}}{{if .Date}} · {{.Date}}{{end}}</div>{{end}}
            {{if .Description}}<div class="exp-summary">{{nl2br .Description}}</div>{{end}}
            {{if .Highlights}}
            <ul class="highlights">
                {{range .Highlights}}
                <li>{{.}}</li>
                {{end}}
            </ul>
            {{end}}
        </div>
        {{end}}
        {{end}}
        {{end}}
    </div>
</body>
</html>`,
  css: '',
}
// CSS will be set below after the constants are initialized

const CLASSIC_TEMPLATE: TemplateSet = {
  html: `<!DOCTYPE html>
<html lang="{{.Meta.Language}}">
<head>
    <meta charset="UTF-8">
    <title>{{.Personal.FullName}} - 简历</title>
    <style>{{template "styles.css" .}}</style>
</head>
<body class="resume-page">
    <div class="resume-container">
        <div class="header">
            {{if .Personal.Avatar}}<div class="header-avatar"><img src="{{.Personal.Avatar}}" alt="头像" /></div>{{end}}
            <h1>{{.Personal.FullName}}</h1>
            {{if .Personal.EnglishName}}<div class="english-name">英文名：{{.Personal.EnglishName}}</div>{{end}}
            {{if .Personal.JobTitle}}<div class="contact-line" style="margin-top:4pt;"><span>职位：{{.Personal.JobTitle}}</span></div>{{end}}
            {{if .Personal.YearsOfExp}}<div class="contact-line"><span>工作年限：{{.Personal.YearsOfExp}}年</span></div>{{end}}
            <div class="contact-line">
                {{if .Personal.Email}}<span>邮箱：{{.Personal.Email}}</span>{{end}}
                {{if .Personal.Phone}}<span>手机：{{.Personal.Phone}}</span>{{end}}
                {{if .Personal.Wechat}}<span>微信：{{.Personal.Wechat}}</span>{{end}}
                {{if .Personal.QQ}}<span>QQ：{{.Personal.QQ}}</span>{{end}}
                {{if .Personal.Location}}<span>城市：{{.Personal.Location}}</span>{{end}}
            </div>
            <div class="contact-line">
                {{if .Personal.Website}}<span>网站：{{.Personal.Website}}</span>{{end}}
                {{if .Personal.GitHub}}<span>GitHub：{{.Personal.GitHub}}</span>{{end}}
                {{if .Personal.LinkedIn}}<span>LinkedIn：{{.Personal.LinkedIn}}</span>{{end}}
            </div>
        </div>
        {{if .Summary}}
        <div class="summary">个人总结：{{nl2br .Summary}}</div>
        {{end}}
        {{if .Jobs}}
        <div class="section-title">工作经历</div>
        {{range .Jobs}}
        <div class="experience-item">
            <div class="exp-header">
                <div>
                    <span class="employer">公司：{{.Company}}</span>
                    {{if .Title}}— <span class="role">职位：{{.Title}}</span>{{end}}
                </div>
                <span class="date">{{dateRange .StartDate .EndDate .IsCurrent}}</span>
            </div>
            {{if .Location}}<div class="exp-location">地点：{{.Location}}</div>{{end}}
            {{if .Summary}}<div class="exp-summary">概述：{{.Summary}}</div>{{end}}
            {{if .Highlights}}
            <ul class="highlights">
                {{range .Highlights}}
                <li>{{.}}</li>
                {{end}}
            </ul>
            {{end}}
        </div>
        {{end}}
        {{end}}
        {{if .Education}}
        <div class="section-title">教育背景</div>
        {{range .Education}}
        <div class="education-item">
            <div class="edu-header">
                <span class="school">学校：{{.School}}</span>
                <span class="date">{{.StartDate}} - {{.EndDate}}</span>
            </div>
            <div class="edu-detail">学位：{{.Degree}} · 专业：{{.Major}}{{if .Minor}} · 辅修：{{.Minor}}{{end}}{{if .GPA}} · GPA：{{.GPA}}{{end}}</div>
            {{if .Highlights}}
            <ul class="highlights">
                {{range .Highlights}}
                <li>{{.}}</li>
                {{end}}
            </ul>
            {{end}}
        </div>
        {{end}}
        {{end}}
        {{if .Skills}}
        <div class="section-title">专业技能</div>
        {{range .Skills}}
        <div class="skill-category">
            <h4>技能分类：{{.Category}}</h4>
            <div class="skill-list">
                {{range .Items}}
                <span class="skill-item">
                    <span class="skill-name">{{.Name}}</span>
                    {{if .Level}}<span class="skill-level">({{skillLevel .Level}})</span>{{end}}
                </span>
                {{end}}
            </div>
        </div>
        {{end}}
        {{end}}
        {{if .Languages}}
        <div class="section-title">语言能力</div>
        <div class="inline-list">
            {{range .Languages}}
            <span><span class="label">{{.Name}}:</span> {{.Level}}</span>
            {{end}}
        </div>
        {{end}}
        {{if .Projects}}
        <div class="section-title">项目经历</div>
        {{range .Projects}}
        <div class="experience-item">
            <div class="exp-header">
                <span class="employer">项目：{{.Name}}</span>
                {{if .StartDate}}<span class="date">{{dateRange .StartDate .EndDate false}}</span>{{end}}
            </div>
            {{if .Role}}<div class="exp-location">角色: {{.Role}}</div>{{end}}
            {{if .Summary}}<div class="exp-summary">{{.Summary}}</div>{{end}}
            {{if .Highlights}}
            <ul class="highlights">
                {{range .Highlights}}
                <li>{{.}}</li>
                {{end}}
            </ul>
            {{end}}
        </div>
        {{end}}
        {{end}}
        {{if .Awards}}
        <div class="section-title">奖项荣誉</div>
        {{range .Awards}}
        <div class="custom-item">
            <h4>奖项：{{.Title}}</h4>
            <div class="subtitle">日期：{{.Date}}{{if .Issuer}} · 颁发机构：{{.Issuer}}{{end}}</div>
            {{if .Summary}}<div class="exp-summary">说明：{{.Summary}}</div>{{end}}
        </div>
        {{end}}
        {{end}}
        {{if .Custom}}
        {{range .Custom}}
        <div class="section-title">{{.Title}}</div>
        {{range .Items}}
        <div class="custom-item">
            <h4>{{.Title}}</h4>
            {{if .Subtitle}}<div class="subtitle">{{.Subtitle}}{{if .Date}} · {{.Date}}{{end}}</div>{{end}}
            {{if .Description}}<div class="exp-summary">{{nl2br .Description}}</div>{{end}}
            {{if .Highlights}}
            <ul class="highlights">
                {{range .Highlights}}
                <li>{{.}}</li>
                {{end}}
            </ul>
            {{end}}
        </div>
        {{end}}
        {{end}}
        {{end}}
    </div>
</body>
</html>`,
  css: '',
}

const MODERN_CSS = `
:root {
    --font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
    --font-size-base: 10pt;
    --line-height: 1.5;
    --primary-color: #2563EB;
    --heading-color: #1E40AF;
    --text-color: #1F2937;
    --muted-color: #6B7280;
    --border-color: #E5E7EB;
    --bg-accent: #F0F7FF;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
    font-family: var(--font-family);
    font-size: var(--font-size-base);
    line-height: var(--line-height);
    color: var(--text-color);
    background: #fff;
}
.resume-page {
    width: 210mm;
    min-height: 297mm;
    padding: 18mm 15mm;
    background: #fff;
}
.resume-container { max-width: 100%; }
.header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16pt;
    padding-bottom: 12pt;
    border-bottom: 2px solid var(--primary-color);
}
.header-left h1 {
    font-size: 22pt;
    font-weight: 700;
    color: var(--heading-color);
    margin-bottom: 4pt;
}
.header-left .job-title {
    font-size: 11pt;
    color: var(--muted-color);
    margin-bottom: 8pt;
}
.contact-info {
    display: flex;
    flex-wrap: wrap;
    gap: 4pt 16pt;
    font-size: 9pt;
    color: var(--muted-color);
}
.contact-label { font-weight: 600; color: var(--heading-color); }
.header-avatar { flex-shrink: 0; }
.header-avatar img { width: 72pt; height: 96pt; object-fit: cover; border-radius: 4pt; border: 1px solid var(--border-color); }
.english-name { font-size: 10pt; color: var(--muted-color); margin-bottom: 4pt; }
.years-exp { font-size: 9.5pt; color: var(--muted-color); margin-bottom: 6pt; }
.exp-location { font-size: 9pt; color: var(--muted-color); margin-bottom: 3pt; }
.summary {
    margin-bottom: 14pt;
    padding: 8pt 12pt;
    background: var(--bg-accent);
    border-radius: 4pt;
    font-size: 9.5pt;
    line-height: 1.6;
}
.section-title {
    font-size: 12pt;
    font-weight: 700;
    color: var(--heading-color);
    margin-bottom: 8pt;
    padding-bottom: 4pt;
    border-bottom: 1px solid var(--border-color);
    text-transform: uppercase;
    letter-spacing: 1pt;
}
.experience-item { margin-bottom: 12pt; }
.exp-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 3pt;
}
.exp-header .company { font-weight: 700; font-size: 10.5pt; }
.exp-header .title { color: var(--primary-color); font-weight: 600; }
.exp-header .date { font-size: 9pt; color: var(--muted-color); white-space: nowrap; }
.exp-summary { font-size: 9.5pt; margin-bottom: 4pt; color: #4B5563; }
.highlights { list-style: none; padding-left: 0; }
.highlights li {
    position: relative;
    padding-left: 12pt;
    margin-bottom: 2pt;
    font-size: 9.5pt;
    line-height: 1.5;
}
.highlights li::before {
    content: "•";
    position: absolute;
    left: 0;
    color: var(--primary-color);
    font-weight: 700;
}
.skills-grid { display: flex; flex-wrap: wrap; gap: 12pt; }
.skill-category { flex: 1; min-width: 120pt; }
.skill-category h4 {
    font-size: 9.5pt;
    font-weight: 600;
    color: var(--heading-color);
    margin-bottom: 4pt;
}
.skill-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2pt;
    font-size: 9pt;
}
.skill-dots { display: flex; gap: 2pt; }
.skill-dot { width: 7pt; height: 7pt; border-radius: 50%; background: var(--border-color); }
.skill-dot.filled { background: var(--primary-color); }
.education-item { margin-bottom: 8pt; }
.edu-header { display: flex; justify-content: space-between; align-items: baseline; }
.edu-header .school { font-weight: 700; font-size: 10pt; }
.edu-header .date { font-size: 9pt; color: var(--muted-color); }
.edu-detail { font-size: 9.5pt; color: #4B5563; }
.inline-list { display: flex; flex-wrap: wrap; gap: 4pt 16pt; font-size: 9.5pt; }
.inline-list .label { font-weight: 600; }
.custom-item { margin-bottom: 8pt; }
.custom-item h4 { font-size: 10pt; font-weight: 600; }
.custom-item .subtitle { font-size: 9pt; color: var(--muted-color); }
@media print {
    .resume-page { width: 100%; margin: 0; padding: 18mm 15mm; }
    @page { size: A4; margin: 0; }
}
.page-break { page-break-after: always; break-after: page; }
`

const CLASSIC_CSS = `
:root {
    --font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Serif SC', 'SimSun', serif;
    --font-size-base: 10.5pt;
    --line-height: 1.6;
    --primary-color: #1F2937;
    --heading-color: #111827;
    --text-color: #1F2937;
    --muted-color: #4B5563;
    --border-color: #374151;
    --accent-color: #374151;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
    font-family: var(--font-family);
    font-size: var(--font-size-base);
    line-height: var(--line-height);
    color: var(--text-color);
    background: #fff;
}
.resume-page {
    width: 210mm;
    min-height: 297mm;
    padding: 22mm 20mm;
    background: #fff;
}
.resume-container { max-width: 100%; }
.header {
    text-align: center;
    margin-bottom: 16pt;
    padding-bottom: 12pt;
    border-bottom: 1.5pt solid var(--border-color);
}
.header h1 {
    font-size: 20pt;
    font-weight: 700;
    color: var(--heading-color);
    letter-spacing: 2pt;
    margin-bottom: 6pt;
}
.header .contact-line {
    font-size: 9.5pt;
    color: var(--muted-color);
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 4pt 18pt;
}
.header-avatar { margin-bottom: 8pt; }
.header-avatar img { width: 64pt; height: 80pt; object-fit: cover; border-radius: 4pt; border: 1px solid var(--border-color); }
.english-name { font-size: 10pt; color: var(--muted-color); margin-bottom: 4pt; }
.exp-location { font-size: 9pt; color: var(--muted-color); margin-bottom: 3pt; }
.summary {
    margin-bottom: 16pt;
    text-align: justify;
    font-size: 10pt;
    line-height: 1.7;
}
.section-title {
    font-size: 11pt;
    font-weight: 700;
    color: var(--heading-color);
    margin-bottom: 8pt;
    padding-bottom: 3pt;
    border-bottom: 0.75pt solid var(--border-color);
    text-transform: uppercase;
    letter-spacing: 1.5pt;
}
.experience-item { margin-bottom: 12pt; }
.exp-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2pt; }
.exp-header .employer { font-weight: 700; font-size: 10.5pt; }
.exp-header .role { font-weight: 600; font-style: italic; }
.exp-header .date { font-size: 9pt; color: var(--muted-color); }
.exp-location { font-size: 9pt; color: var(--muted-color); margin-bottom: 3pt; }
.exp-summary { font-size: 10pt; margin-bottom: 4pt; }
.highlights { list-style: none; padding-left: 0; }
.highlights li {
    position: relative;
    padding-left: 14pt;
    margin-bottom: 2pt;
    font-size: 10pt;
    line-height: 1.5;
}
.highlights li::before { content: "—"; position: absolute; left: 0; color: var(--accent-color); }
.skill-category { margin-bottom: 6pt; }
.skill-category h4 { font-size: 10pt; font-weight: 700; color: var(--heading-color); margin-bottom: 3pt; }
.skill-category .skill-list { display: flex; flex-wrap: wrap; gap: 3pt 16pt; font-size: 10pt; }
.skill-item .skill-name { font-weight: 500; }
.skill-item .skill-level { color: var(--muted-color); font-size: 9pt; }
.education-item { margin-bottom: 8pt; }
.edu-header { display: flex; justify-content: space-between; align-items: baseline; }
.edu-header .school { font-weight: 700; font-size: 10.5pt; }
.edu-header .date { font-size: 9pt; color: var(--muted-color); }
.edu-detail { font-size: 10pt; color: var(--muted-color); }
.inline-list { display: flex; flex-wrap: wrap; gap: 4pt 20pt; font-size: 10pt; }
.inline-list .label { font-weight: 600; }
.custom-item { margin-bottom: 8pt; }
.custom-item h4 { font-size: 10.5pt; font-weight: 600; }
.custom-item .subtitle { font-size: 9.5pt; color: var(--muted-color); }
@media print {
    .resume-page { width: 100%; margin: 0; padding: 22mm 20mm; }
    @page { size: A4; margin: 0; }
}
.page-break { page-break-after: always; break-after: page; }
`

// Assign CSS to template objects now that all constants are initialized
MODERN_TEMPLATE.css = MODERN_CSS;
CLASSIC_TEMPLATE.css = CLASSIC_CSS;
