import { isWails, callService } from './backend'
import type { TemplateMeta } from '../types/template'
import type { TemplateSet } from '../lib/template-engine'

const TEMPLATES_KEY = 'resume-craft-templates'
const TEMPLATES_VERSION = 2

/**
 * Loads template metadata and content. In Wails mode, calls Go TemplateService.
 * In dev mode, loads built-in templates from the bundled definitions.
 */
export async function loadTemplateMetas(): Promise<TemplateMeta[]> {
  // In Wails mode, fetch from Go backend which reads from filesystem
  if (isWails()) {
    try {
      const metas = await callService<TemplateMeta[]>('TemplateService', 'ListTemplates')
      if (metas && metas.length > 0) return metas
    } catch { /* fallback to cache / built-in */ }
  }

  const versionKey = `${TEMPLATES_KEY}-version`

  // Try loading from localStorage cache if version matches
  const cachedVersion = localStorage.getItem(versionKey)
  if (cachedVersion === String(TEMPLATES_VERSION)) {
    const cached = localStorage.getItem(TEMPLATES_KEY)
    if (cached) {
      try {
        return JSON.parse(cached)
      } catch { /* ignore */ }
    }
  }

  // Use built-in defaults (synced with templates/ directory + WelcomePage defaults)
  const defaults = getDefaultTemplates()
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(defaults))
  localStorage.setItem(versionKey, String(TEMPLATES_VERSION))
  return defaults
}

export async function loadTemplateContent(templateId: string): Promise<TemplateSet> {
  if (isWails()) {
    try {
      const content = await callService<{ html: string; css: string }>('TemplateService', 'GetTemplateContent', templateId)
      if (content && content.html) return content
    } catch { /* fallback to built-in */ }
  }
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
      author: { name: 'Gosume' },
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
      author: { name: 'Gosume' },
      description: '适合传统行业和正式场合，单栏布局，沉稳大气',
      category: 'business',
      tags: ['经典', '单栏', '正式'],
      target_language: ['zh-CN', 'en-US'],
      page_count: { min: 1, max: 2, default: 1 },
      paper_size: 'A4',
      colors: { primary: '#1F2937', secondary: '#374151', text: '#111827', background: '#FFFFFF', accent: '#F3F4F6' },
    },
    {
      id: 'minimal',
      name: '极简清新风',
      version: '1.0.0',
      author: { name: 'Gosume' },
      description: '极简留白设计，细线分隔，适合注重内容表达的求职者',
      category: 'creative',
      tags: ['极简', '留白', '干净'],
      target_language: ['zh-CN', 'en-US'],
      page_count: { min: 1, max: 2, default: 1 },
      paper_size: 'A4',
      colors: { primary: '#334155', secondary: '#64748B', text: '#1E293B', background: '#FFFFFF', accent: '#F1F5F9' },
    },
    {
      id: 'creative',
      name: '创意设计风',
      version: '1.0.0',
      author: { name: 'Gosume' },
      description: '左侧色块边栏布局，突出个性与技能，适合设计创意类岗位',
      category: 'creative',
      tags: ['创意', '侧边栏', '色彩'],
      target_language: ['zh-CN', 'en-US'],
      page_count: { min: 1, max: 2, default: 1 },
      paper_size: 'A4',
      colors: { primary: '#6366F1', secondary: '#4F46E5', text: '#1E293B', background: '#FFFFFF', accent: '#EEF2FF' },
    },
    {
      id: 'executive',
      name: '高管精英风',
      version: '1.0.0',
      author: { name: 'Gosume' },
      description: '沉稳大气的深蓝金色搭配，适合管理、金融、咨询等高端岗位',
      category: 'business',
      tags: ['高端', '商务', '管理'],
      target_language: ['zh-CN', 'en-US'],
      page_count: { min: 1, max: 2, default: 1 },
      paper_size: 'A4',
      colors: { primary: '#1A2332', secondary: '#C8A45C', text: '#2D3748', background: '#FFFFFF', accent: '#F7F3EB' },
    },
    {
      id: 'compact',
      name: '紧凑高效风',
      version: '1.0.0',
      author: { name: 'Gosume' },
      description: '高密度紧凑排版，多栏技能布局，适合经验丰富的技术岗位',
      category: 'tech',
      tags: ['紧凑', '高效', '密集'],
      target_language: ['zh-CN', 'en-US'],
      page_count: { min: 1, max: 2, default: 1 },
      paper_size: 'A4',
      colors: { primary: '#0F766E', secondary: '#0D9488', text: '#1F2937', background: '#FFFFFF', accent: '#CCFBF1' },
    },
  ]
}

function getBuiltinTemplateContent(templateId: string): TemplateSet {
  switch (templateId) {
    case 'modern': return MODERN_TEMPLATE
    case 'classic': return CLASSIC_TEMPLATE
    case 'minimal': return MINIMAL_TEMPLATE
    case 'creative': return CREATIVE_TEMPLATE
    case 'executive': return EXECUTIVE_TEMPLATE
    case 'compact': return COMPACT_TEMPLATE
    default: return MODERN_TEMPLATE
  }
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


// ── Minimal Template ──

const MINIMAL_TEMPLATE: TemplateSet = {
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
            <h1>{{.Personal.FullName}}</h1>
            {{if .Personal.EnglishName}}<div class="english-name">{{.Personal.EnglishName}}</div>{{end}}
            {{if .Personal.JobTitle}}<div class="job-title">{{.Personal.JobTitle}}</div>{{end}}
            <div class="contact-line">
                {{if .Personal.Email}}<span>{{.Personal.Email}}</span>{{end}}
                {{if .Personal.Phone}}<span>{{.Personal.Phone}}</span>{{end}}
                {{if .Personal.Location}}<span>{{.Personal.Location}}</span>{{end}}
            </div>
            <div class="contact-line secondary">
                {{if .Personal.Website}}<span>{{.Personal.Website}}</span>{{end}}
                {{if .Personal.GitHub}}<span>{{.Personal.GitHub}}</span>{{end}}
                {{if .Personal.LinkedIn}}<span>{{.Personal.LinkedIn}}</span>{{end}}
                {{if .Personal.Wechat}}<span>微信：{{.Personal.Wechat}}</span>{{end}}
            </div>
        </div>
        {{if .Summary}}
        <div class="summary">{{nl2br .Summary}}</div>
        {{end}}
        {{if .Jobs}}
        <div class="section-title">工作经历</div>
        {{range .Jobs}}
        <div class="experience-item">
            <div class="exp-header">
                <div>
                    <span class="company">{{.Company}}</span>
                    {{if .Title}}<span class="title"> — {{.Title}}</span>{{end}}
                </div>
                <span class="date">{{dateRange .StartDate .EndDate .IsCurrent}}</span>
            </div>
            {{if .Location}}<div class="exp-location">{{.Location}}</div>{{end}}
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
        {{if .Education}}
        <div class="section-title">教育背景</div>
        {{range .Education}}
        <div class="education-item">
            <div class="edu-header">
                <span class="school">{{.School}}</span>
                <span class="date">{{.StartDate}} - {{.EndDate}}</span>
            </div>
            <div class="edu-detail">{{.Degree}} · {{.Major}}{{if .Minor}} · 辅修：{{.Minor}}{{end}}{{if .GPA}} · GPA：{{.GPA}}{{end}}</div>
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
            <h4>{{.Category}}</h4>
            <div class="skill-list">
                {{range .Items}}
                <span class="skill-item">{{.Name}}{{if .Level}} <span class="skill-level">{{skillLevel .Level}}</span>{{end}}</span>
                {{end}}
            </div>
        </div>
        {{end}}
        {{end}}
        {{if .Languages}}
        <div class="section-title">语言能力</div>
        <div class="inline-list">
            {{range .Languages}}
            <span><span class="label">{{.Name}}</span> {{.Level}}</span>
            {{end}}
        </div>
        {{end}}
        {{if .Projects}}
        <div class="section-title">项目经历</div>
        {{range .Projects}}
        <div class="experience-item">
            <div class="exp-header">
                <span class="company">{{.Name}}</span>
                {{if .StartDate}}<span class="date">{{dateRange .StartDate .EndDate false}}</span>{{end}}
            </div>
            {{if .Role}}<div class="exp-role">{{.Role}}</div>{{end}}
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
        <div class="award-item">
            <div class="award-header">
                <span class="award-title">{{.Title}}</span>
                <span class="date">{{.Date}}</span>
            </div>
            {{if .Issuer}}<div class="award-issuer">{{.Issuer}}</div>{{end}}
            {{if .Summary}}<div class="exp-summary">{{.Summary}}</div>{{end}}
        </div>
        {{end}}
        {{end}}
        {{if .Custom}}
        {{range .Custom}}
        <div class="section-title">{{.Title}}</div>
        {{range .Items}}
        <div class="custom-item">
            <h4>{{.Title}}</h4>
            {{if .Subtitle}}<div class="custom-subtitle">{{.Subtitle}}{{if .Date}} · {{.Date}}{{end}}</div>{{end}}
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

const MINIMAL_CSS = `:root {
    --font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
    --font-size-base: 10pt;
    --line-height: 1.6;
    --primary-color: #334155;
    --heading-color: #1E293B;
    --text-color: #334155;
    --muted-color: #94A3B8;
    --border-color: #E2E8F0;
    --accent-bg: #F8FAFC;
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
    padding: 20mm 22mm;
    background: #fff;
}
.resume-container { max-width: 100%; }
.header { margin-bottom: 24pt; }
.header h1 {
    font-size: 24pt;
    font-weight: 300;
    color: var(--heading-color);
    letter-spacing: 1pt;
    margin-bottom: 4pt;
}
.english-name { font-size: 10pt; color: var(--muted-color); font-weight: 300; margin-bottom: 2pt; }
.job-title { font-size: 11pt; color: var(--primary-color); font-weight: 400; margin-bottom: 8pt; }
.contact-line { display: flex; flex-wrap: wrap; gap: 2pt 20pt; font-size: 9pt; color: var(--muted-color); }
.contact-line.secondary { margin-top: 2pt; }
.summary { margin-bottom: 22pt; font-size: 9.5pt; line-height: 1.7; color: var(--muted-color); }
.section-title {
    font-size: 9pt;
    font-weight: 500;
    color: var(--muted-color);
    text-transform: uppercase;
    letter-spacing: 2pt;
    margin-bottom: 10pt;
    padding-bottom: 4pt;
    border-bottom: 0.5pt solid var(--border-color);
}
.experience-item { margin-bottom: 14pt; }
.exp-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2pt; }
.exp-header .company { font-weight: 600; font-size: 10pt; color: var(--heading-color); }
.exp-header .title { font-weight: 400; color: var(--primary-color); }
.exp-header .date { font-size: 8.5pt; color: var(--muted-color); white-space: nowrap; }
.exp-location { font-size: 8.5pt; color: var(--muted-color); margin-bottom: 2pt; }
.exp-role { font-size: 9pt; color: var(--muted-color); margin-bottom: 2pt; }
.exp-summary { font-size: 9pt; color: var(--text-color); margin-bottom: 3pt; }
.highlights { list-style: none; padding-left: 0; }
.highlights li {
    position: relative;
    padding-left: 12pt;
    margin-bottom: 1.5pt;
    font-size: 9pt;
    line-height: 1.5;
    color: var(--text-color);
}
.highlights li::before { content: "—"; position: absolute; left: 0; color: var(--muted-color); }
.education-item { margin-bottom: 10pt; }
.edu-header { display: flex; justify-content: space-between; align-items: baseline; }
.edu-header .school { font-weight: 600; font-size: 10pt; color: var(--heading-color); }
.edu-header .date { font-size: 8.5pt; color: var(--muted-color); }
.edu-detail { font-size: 9pt; color: var(--muted-color); }
.skill-category h4 { font-size: 9.5pt; font-weight: 500; color: var(--heading-color); margin-bottom: 3pt; }
.skill-category .skill-list { display: flex; flex-wrap: wrap; gap: 3pt 16pt; }
.skill-item { font-size: 9pt; color: var(--text-color); }
.skill-level { color: var(--muted-color); font-size: 8pt; }
.inline-list { display: flex; flex-wrap: wrap; gap: 4pt 18pt; font-size: 9pt; }
.inline-list .label { font-weight: 500; }
.award-item { margin-bottom: 6pt; }
.award-header { display: flex; justify-content: space-between; align-items: baseline; }
.award-title { font-weight: 600; font-size: 9.5pt; }
.award-issuer { font-size: 8.5pt; color: var(--muted-color); }
.custom-item { margin-bottom: 8pt; }
.custom-item h4 { font-size: 9.5pt; font-weight: 600; color: var(--heading-color); }
.custom-subtitle { font-size: 8.5pt; color: var(--muted-color); }
@media print {
    .resume-page { width: 100%; margin: 0; padding: 20mm 22mm; }
    @page { size: A4; margin: 0; }
}
.page-break { page-break-after: always; break-after: page; }
`

// ── Creative Template ──

const CREATIVE_TEMPLATE: TemplateSet = {
  html: `<!DOCTYPE html>
<html lang="{{.Meta.Language}}">
<head>
    <meta charset="UTF-8">
    <title>{{.Personal.FullName}} - 简历</title>
    <style>{{template "styles.css" .}}</style>
</head>
<body class="resume-page">
    <div class="resume-layout">
        <div class="resume-sidebar">
            {{if .Personal.Avatar}}<div class="sidebar-avatar"><img src="{{.Personal.Avatar}}" alt="头像" /></div>{{end}}
            <h1>{{.Personal.FullName}}</h1>
            {{if .Personal.EnglishName}}<div class="sidebar-eng-name">{{.Personal.EnglishName}}</div>{{end}}
            {{if .Personal.JobTitle}}<div class="sidebar-job">{{.Personal.JobTitle}}</div>{{end}}
            <div class="sidebar-section">
                <div class="sidebar-section-title">联系方式</div>
                {{if .Personal.Email}}<div class="sidebar-contact"><span class="sc-label">邮箱</span>{{.Personal.Email}}</div>{{end}}
                {{if .Personal.Phone}}<div class="sidebar-contact"><span class="sc-label">手机</span>{{.Personal.Phone}}</div>{{end}}
                {{if .Personal.Location}}<div class="sidebar-contact"><span class="sc-label">城市</span>{{.Personal.Location}}</div>{{end}}
                {{if .Personal.Wechat}}<div class="sidebar-contact"><span class="sc-label">微信</span>{{.Personal.Wechat}}</div>{{end}}
                {{if .Personal.Website}}<div class="sidebar-contact"><span class="sc-label">网站</span>{{.Personal.Website}}</div>{{end}}
                {{if .Personal.GitHub}}<div class="sidebar-contact"><span class="sc-label">GitHub</span>{{.Personal.GitHub}}</div>{{end}}
                {{if .Personal.LinkedIn}}<div class="sidebar-contact"><span class="sc-label">LinkedIn</span>{{.Personal.LinkedIn}}</div>{{end}}
            </div>
            {{if .Skills}}
            <div class="sidebar-section">
                <div class="sidebar-section-title">专业技能</div>
                {{range .Skills}}
                <div class="sidebar-skill-group">
                    <div class="sidebar-skill-cat">{{.Category}}</div>
                    {{range .Items}}
                    <div class="sidebar-skill-item">
                        <span>{{.Name}}</span>
                        {{if .Level}}<div class="skill-dots">{{skillLevel .Level}}</div>{{end}}
                    </div>
                    {{end}}
                </div>
                {{end}}
            </div>
            {{end}}
            {{if .Languages}}
            <div class="sidebar-section">
                <div class="sidebar-section-title">语言能力</div>
                {{range .Languages}}
                <div class="sidebar-lang"><span>{{.Name}}</span><span>{{.Level}}</span></div>
                {{end}}
            </div>
            {{end}}
        </div>
        <div class="resume-main">
            {{if .Summary}}
            <div class="section-title">个人总结</div>
            <div class="summary">{{nl2br .Summary}}</div>
            {{end}}
            {{if .Jobs}}
            <div class="section-title">工作经历</div>
            {{range .Jobs}}
            <div class="experience-item">
                <div class="exp-header">
                    <div>
                        <span class="company">{{.Company}}</span>
                        {{if .Title}}<span class="title">&nbsp;· {{.Title}}</span>{{end}}
                    </div>
                    <span class="date">{{dateRange .StartDate .EndDate .IsCurrent}}</span>
                </div>
                {{if .Location}}<div class="exp-location">{{.Location}}</div>{{end}}
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
            {{if .Education}}
            <div class="section-title">教育背景</div>
            {{range .Education}}
            <div class="education-item">
                <div class="edu-header">
                    <span class="school">{{.School}}</span>
                    <span class="date">{{.StartDate}} - {{.EndDate}}</span>
                </div>
                <div class="edu-detail">{{.Degree}} · {{.Major}}{{if .Minor}} · 辅修：{{.Minor}}{{end}}{{if .GPA}} · GPA：{{.GPA}}{{end}}</div>
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
            {{if .Projects}}
            <div class="section-title">项目经历</div>
            {{range .Projects}}
            <div class="experience-item">
                <div class="exp-header">
                    <span class="company">{{.Name}}</span>
                    {{if .StartDate}}<span class="date">{{dateRange .StartDate .EndDate false}}</span>{{end}}
                </div>
                {{if .Role}}<div class="exp-role">{{.Role}}</div>{{end}}
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
            <div class="award-item">
                <div class="award-header">
                    <span class="award-title">{{.Title}}</span>
                    <span class="date">{{.Date}}</span>
                </div>
                {{if .Issuer}}<div class="award-issuer">{{.Issuer}}</div>{{end}}
                {{if .Summary}}<div class="award-desc">{{.Summary}}</div>{{end}}
            </div>
            {{end}}
            {{end}}
            {{if .Custom}}
            {{range .Custom}}
            <div class="section-title">{{.Title}}</div>
            {{range .Items}}
            <div class="custom-item">
                <h4>{{.Title}}</h4>
                {{if .Subtitle}}<div class="custom-subtitle">{{.Subtitle}}{{if .Date}} · {{.Date}}{{end}}</div>{{end}}
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
    </div>
</body>
</html>`,
  css: '',
}

const CREATIVE_CSS = `:root {
    --font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
    --font-size-base: 9.5pt;
    --line-height: 1.5;
    --primary-color: #6366F1;
    --heading-color: #4338CA;
    --text-color: #334155;
    --muted-color: #64748B;
    --border-color: #E0E7FF;
    --sidebar-bg: #EEF2FF;
    --sidebar-text: #4338CA;
    --accent-bg: #F5F3FF;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
    font-family: var(--font-family);
    font-size: var(--font-size-base);
    line-height: var(--line-height);
    color: var(--text-color);
    background: #fff;
}
.resume-page { width: 210mm; min-height: 297mm; background: #fff; }
.resume-layout { display: flex; min-height: 297mm; }
.resume-sidebar {
    width: 38%;
    background: var(--sidebar-bg);
    padding: 20mm 8mm 16mm 12mm;
    color: var(--sidebar-text);
}
.sidebar-avatar { text-align: center; margin-bottom: 12pt; }
.sidebar-avatar img {
    width: 88pt; height: 110pt; object-fit: cover;
    border-radius: 50%; border: 3px solid var(--primary-color);
}
.resume-sidebar h1 { font-size: 18pt; font-weight: 700; color: var(--heading-color); margin-bottom: 2pt; }
.sidebar-eng-name { font-size: 9pt; color: var(--muted-color); margin-bottom: 2pt; }
.sidebar-job {
    font-size: 10pt; font-weight: 500; color: var(--primary-color);
    margin-bottom: 14pt; padding-bottom: 10pt; border-bottom: 1.5px solid var(--primary-color);
}
.sidebar-section { margin-bottom: 14pt; }
.sidebar-section-title {
    font-size: 8.5pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1.5pt; color: var(--primary-color); margin-bottom: 6pt;
}
.sidebar-contact { font-size: 8.5pt; margin-bottom: 3pt; display: flex; gap: 4pt; color: var(--text-color); }
.sc-label { font-weight: 600; color: var(--heading-color); min-width: 32pt; }
.sidebar-skill-group { margin-bottom: 6pt; }
.sidebar-skill-cat { font-size: 8.5pt; font-weight: 600; color: var(--heading-color); margin-bottom: 3pt; }
.sidebar-skill-item { display: flex; align-items: center; justify-content: space-between; font-size: 8pt; margin-bottom: 2pt; }
.skill-dots { display: flex; gap: 1.5pt; }
.skill-dot { width: 5pt; height: 5pt; border-radius: 50%; background: #C7D2FE; }
.skill-dot.filled { background: var(--primary-color); }
.sidebar-lang { display: flex; justify-content: space-between; font-size: 8.5pt; margin-bottom: 2pt; }
.resume-main { flex: 1; padding: 20mm 14mm 16mm 14mm; }
.summary {
    margin-bottom: 14pt; font-size: 9pt; line-height: 1.6; color: var(--text-color);
    padding: 8pt 10pt; background: var(--accent-bg); border-radius: 4pt; border-left: 3px solid var(--primary-color);
}
.section-title {
    font-size: 11pt; font-weight: 700; color: var(--heading-color);
    margin-bottom: 8pt; padding-bottom: 3pt; border-bottom: 1.5px solid var(--border-color);
}
.experience-item { margin-bottom: 12pt; }
.exp-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2pt; }
.exp-header .company { font-weight: 700; font-size: 10pt; color: var(--heading-color); }
.exp-header .title { font-weight: 500; color: var(--primary-color); }
.exp-header .date { font-size: 8pt; color: var(--muted-color); white-space: nowrap; }
.exp-location { font-size: 8pt; color: var(--muted-color); margin-bottom: 2pt; }
.exp-role { font-size: 8.5pt; color: var(--muted-color); margin-bottom: 2pt; }
.exp-summary { font-size: 8.5pt; color: var(--text-color); margin-bottom: 3pt; }
.highlights { list-style: none; padding-left: 0; }
.highlights li { position: relative; padding-left: 10pt; margin-bottom: 1.5pt; font-size: 8.5pt; line-height: 1.5; }
.highlights li::before { content: "\\25B8"; position: absolute; left: 0; color: var(--primary-color); font-size: 7pt; }
.education-item { margin-bottom: 8pt; }
.edu-header { display: flex; justify-content: space-between; align-items: baseline; }
.edu-header .school { font-weight: 700; font-size: 9.5pt; color: var(--heading-color); }
.edu-header .date { font-size: 8pt; color: var(--muted-color); }
.edu-detail { font-size: 8.5pt; color: var(--muted-color); }
.award-item { margin-bottom: 6pt; }
.award-header { display: flex; justify-content: space-between; align-items: baseline; }
.award-title { font-weight: 600; font-size: 9pt; }
.award-issuer { font-size: 8pt; color: var(--muted-color); }
.award-desc { font-size: 8.5pt; color: var(--muted-color); }
.custom-item { margin-bottom: 8pt; }
.custom-item h4 { font-size: 9.5pt; font-weight: 600; color: var(--heading-color); }
.custom-subtitle { font-size: 8.5pt; color: var(--muted-color); }
@media print {
    .resume-page { width: 100%; margin: 0; }
    @page { size: A4; margin: 0; }
}
.page-break { page-break-after: always; break-after: page; }
`

// ── Executive Template ──

const EXECUTIVE_TEMPLATE: TemplateSet = {
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
            <div class="header-rule"></div>
            <h1>{{.Personal.FullName}}</h1>
            {{if .Personal.EnglishName}}<div class="english-name">{{.Personal.EnglishName}}</div>{{end}}
            {{if .Personal.JobTitle}}<div class="job-title">{{.Personal.JobTitle}}</div>{{end}}
            {{if .Personal.YearsOfExp}}<div class="years-exp">工作年限：{{.Personal.YearsOfExp}}年</div>{{end}}
            <div class="contact-line">
                {{if .Personal.Email}}<span>{{.Personal.Email}}</span>{{end}}
                {{if .Personal.Phone}}<span>{{.Personal.Phone}}</span>{{end}}
                {{if .Personal.Location}}<span>{{.Personal.Location}}</span>{{end}}
                {{if .Personal.Wechat}}<span>微信：{{.Personal.Wechat}}</span>{{end}}
            </div>
            <div class="contact-line">
                {{if .Personal.Website}}<span>{{.Personal.Website}}</span>{{end}}
                {{if .Personal.GitHub}}<span>{{.Personal.GitHub}}</span>{{end}}
                {{if .Personal.LinkedIn}}<span>{{.Personal.LinkedIn}}</span>{{end}}
            </div>
            <div class="header-rule bottom"></div>
        </div>
        {{if .Summary}}
        <div class="summary">{{nl2br .Summary}}</div>
        {{end}}
        {{if .Jobs}}
        <div class="section-title">工作经历</div>
        {{range .Jobs}}
        <div class="experience-item">
            <div class="exp-header">
                <div>
                    <span class="company">{{.Company}}</span>
                    {{if .Title}}<span class="title"> — {{.Title}}</span>{{end}}
                </div>
                <span class="date">{{dateRange .StartDate .EndDate .IsCurrent}}</span>
            </div>
            {{if .Location}}<div class="exp-location">{{.Location}}</div>{{end}}
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
        {{if .Education}}
        <div class="section-title">教育背景</div>
        {{range .Education}}
        <div class="education-item">
            <div class="edu-header">
                <span class="school">{{.School}}</span>
                <span class="date">{{.StartDate}} - {{.EndDate}}</span>
            </div>
            <div class="edu-detail">{{.Degree}} · {{.Major}}{{if .Minor}} · 辅修：{{.Minor}}{{end}}{{if .GPA}} · GPA：{{.GPA}}{{end}}</div>
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
        <div class="skills-grid">
            {{range .Skills}}
            <div class="skill-category">
                <h4>{{.Category}}</h4>
                {{range .Items}}
                <div class="skill-item">
                    <span>{{.Name}}</span>
                    {{if .Level}}<span class="skill-dots">{{skillLevel .Level}}</span>{{end}}
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
            <span><span class="label">{{.Name}}</span> {{.Level}}</span>
            {{end}}
        </div>
        {{end}}
        {{if .Projects}}
        <div class="section-title">项目经历</div>
        {{range .Projects}}
        <div class="experience-item">
            <div class="exp-header">
                <div>
                    <span class="company">{{.Name}}</span>
                    {{if .Role}}<span class="title"> — {{.Role}}</span>{{end}}
                </div>
                {{if .StartDate}}<span class="date">{{dateRange .StartDate .EndDate false}}</span>{{end}}
            </div>
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
        <div class="award-item">
            <div class="award-header">
                <span class="award-title">{{.Title}}</span>
                <span class="date">{{.Date}}</span>
            </div>
            {{if .Issuer}}<div class="award-issuer">{{.Issuer}}</div>{{end}}
            {{if .Summary}}<div class="exp-summary">{{.Summary}}</div>{{end}}
        </div>
        {{end}}
        {{end}}
        {{if .Custom}}
        {{range .Custom}}
        <div class="section-title">{{.Title}}</div>
        {{range .Items}}
        <div class="custom-item">
            <h4>{{.Title}}</h4>
            {{if .Subtitle}}<div class="custom-subtitle">{{.Subtitle}}{{if .Date}} · {{.Date}}{{end}}</div>{{end}}
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

const EXECUTIVE_CSS = `:root {
    --font-family-heading: 'PingFang SC', 'Microsoft YaHei', 'Noto Serif SC', 'SimSun', serif;
    --font-family-body: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
    --font-size-base: 10.5pt;
    --line-height: 1.6;
    --primary-color: #1A2332;
    --gold-color: #C8A45C;
    --heading-color: #1A2332;
    --text-color: #2D3748;
    --muted-color: #718096;
    --border-color: #E2E8F0;
    --accent-bg: #F7F3EB;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
    font-family: var(--font-family-body);
    font-size: var(--font-size-base);
    line-height: var(--line-height);
    color: var(--text-color);
    background: #fff;
}
.resume-page { width: 210mm; min-height: 297mm; padding: 18mm 18mm; background: #fff; }
.resume-container { max-width: 100%; }
.header { text-align: center; margin-bottom: 20pt; }
.header-rule { height: 1.5pt; background: var(--gold-color); width: 60%; margin: 0 auto 12pt auto; }
.header-rule.bottom { margin: 12pt auto 0 auto; }
.header h1 {
    font-family: var(--font-family-heading);
    font-size: 22pt; font-weight: 700; color: var(--heading-color);
    letter-spacing: 3pt; margin-bottom: 4pt;
}
.english-name {
    font-family: var(--font-family-heading);
    font-size: 10pt; color: var(--gold-color); font-style: italic;
    margin-bottom: 4pt; letter-spacing: 1pt;
}
.job-title { font-size: 11pt; color: var(--primary-color); font-weight: 500; margin-bottom: 4pt; }
.years-exp { font-size: 9.5pt; color: var(--muted-color); margin-bottom: 8pt; }
.contact-line { display: flex; justify-content: center; flex-wrap: wrap; gap: 4pt 22pt; font-size: 9pt; color: var(--muted-color); }
.summary {
    margin-bottom: 18pt; text-align: justify; font-size: 10pt; line-height: 1.7;
    color: var(--text-color); padding: 10pt 14pt; background: var(--accent-bg);
    border-left: 2pt solid var(--gold-color);
}
.section-title {
    font-family: var(--font-family-heading);
    font-size: 12pt; font-weight: 700; color: var(--primary-color);
    margin-bottom: 8pt; padding-bottom: 3pt; border-bottom: 1pt solid var(--gold-color);
    letter-spacing: 1pt;
}
.experience-item { margin-bottom: 14pt; }
.exp-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3pt; }
.exp-header .company { font-weight: 700; font-size: 10.5pt; color: var(--heading-color); }
.exp-header .title { font-weight: 500; font-style: italic; color: var(--primary-color); }
.exp-header .date { font-size: 9pt; color: var(--gold-color); font-family: var(--font-family-heading); }
.exp-location { font-size: 9pt; color: var(--muted-color); margin-bottom: 3pt; }
.exp-summary { font-size: 9.5pt; color: var(--text-color); margin-bottom: 4pt; }
.highlights { list-style: none; padding-left: 0; }
.highlights li { position: relative; padding-left: 14pt; margin-bottom: 2pt; font-size: 9.5pt; line-height: 1.5; }
.highlights li::before { content: "\\25C6"; position: absolute; left: 0; color: var(--gold-color); font-size: 5pt; top: 4pt; }
.education-item { margin-bottom: 10pt; }
.edu-header { display: flex; justify-content: space-between; align-items: baseline; }
.edu-header .school { font-weight: 700; font-size: 10pt; color: var(--heading-color); }
.edu-header .date { font-size: 9pt; color: var(--gold-color); font-family: var(--font-family-heading); }
.edu-detail { font-size: 9.5pt; color: var(--muted-color); }
.skills-grid { display: flex; flex-wrap: wrap; gap: 10pt 24pt; }
.skill-category { min-width: 100pt; margin-bottom: 6pt; }
.skill-category h4 { font-size: 10pt; font-weight: 600; color: var(--heading-color); margin-bottom: 3pt; }
.skill-item { display: flex; align-items: center; justify-content: space-between; font-size: 9pt; margin-bottom: 2pt; }
.skill-dots { display: flex; gap: 2pt; }
.skill-dot { width: 6pt; height: 6pt; border: 1px solid var(--gold-color); background: transparent; }
.skill-dot.filled { background: var(--gold-color); }
.inline-list { display: flex; flex-wrap: wrap; gap: 4pt 20pt; font-size: 9.5pt; }
.inline-list .label { font-weight: 600; color: var(--primary-color); }
.award-item { margin-bottom: 8pt; }
.award-header { display: flex; justify-content: space-between; align-items: baseline; }
.award-title { font-weight: 600; font-size: 10pt; }
.award-issuer { font-size: 9pt; color: var(--muted-color); }
.custom-item { margin-bottom: 10pt; }
.custom-item h4 { font-size: 10.5pt; font-weight: 600; color: var(--heading-color); }
.custom-subtitle { font-size: 9pt; color: var(--muted-color); }
@media print {
    .resume-page { width: 100%; margin: 0; padding: 18mm 18mm; }
    @page { size: A4; margin: 0; }
}
.page-break { page-break-after: always; break-after: page; }
`

// ── Compact Template ──

const COMPACT_TEMPLATE: TemplateSet = {
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
                {{if .Personal.JobTitle}}<span class="job-title">{{.Personal.JobTitle}}</span>{{end}}
                {{if .Personal.YearsOfExp}}<span class="years-exp"> · {{.Personal.YearsOfExp}}年经验</span>{{end}}
            </div>
            <div class="header-right">
                {{if .Personal.Email}}<span>{{.Personal.Email}}</span>{{end}}
                {{if .Personal.Phone}}<span>{{.Personal.Phone}}</span>{{end}}
                {{if .Personal.Location}}<span>{{.Personal.Location}}</span>{{end}}
                {{if .Personal.GitHub}}<span>{{.Personal.GitHub}}</span>{{end}}
                {{if .Personal.Website}}<span>{{.Personal.Website}}</span>{{end}}
            </div>
        </div>
        {{if .Summary}}
        <div class="summary">{{nl2br .Summary}}</div>
        {{end}}
        {{if .Jobs}}
        <div class="section-title">工作经历</div>
        {{range .Jobs}}
        <div class="experience-item">
            <div class="exp-header">
                <div>
                    <span class="company">{{.Company}}</span>
                    {{if .Title}}<span class="title"> — {{.Title}}</span>{{end}}
                </div>
                <span class="date">{{dateRange .StartDate .EndDate .IsCurrent}}</span>
            </div>
            {{if .Location}}<div class="exp-location">{{.Location}}</div>{{end}}
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
        <div class="two-col">
            {{if .Education}}
            <div class="col-left">
                <div class="section-title">教育背景</div>
                {{range .Education}}
                <div class="education-item">
                    <div class="edu-header">
                        <span class="school">{{.School}}</span>
                        <span class="date">{{.StartDate}} - {{.EndDate}}</span>
                    </div>
                    <div class="edu-detail">{{.Degree}} · {{.Major}}{{if .Minor}} · {{.Minor}}{{end}}{{if .GPA}} · GPA:{{.GPA}}{{end}}</div>
                </div>
                {{end}}
            </div>
            {{end}}
            {{if .Skills}}
            <div class="col-right">
                <div class="section-title">专业技能</div>
                {{range .Skills}}
                <div class="skill-category">
                    <span class="skill-cat-name">{{.Category}}：</span>
                    {{range .Items}}
                    <span class="skill-tag">{{.Name}}{{if .Level}} {{skillLevel .Level}}{{end}}</span>
                    {{end}}
                </div>
                {{end}}
            </div>
            {{end}}
        </div>
        {{if .Languages}}
        <div class="languages-line">
            <span class="lang-label">语言能力：</span>
            {{range .Languages}}
            <span><span class="label">{{.Name}}</span> {{.Level}}</span>
            {{end}}
        </div>
        {{end}}
        {{if .Projects}}
        <div class="section-title">项目经历</div>
        {{range .Projects}}
        <div class="experience-item">
            <div class="exp-header">
                <div>
                    <span class="company">{{.Name}}</span>
                    {{if .Role}}<span class="title"> — {{.Role}}</span>{{end}}
                </div>
                {{if .StartDate}}<span class="date">{{dateRange .StartDate .EndDate false}}</span>{{end}}
            </div>
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
        <div class="awards-inline">
            {{range .Awards}}
            <span class="award-tag">{{.Title}} <span class="award-date">{{.Date}}</span></span>
            {{end}}
        </div>
        {{end}}
        {{if .Custom}}
        {{range .Custom}}
        <div class="section-title">{{.Title}}</div>
        {{range .Items}}
        <div class="custom-item">
            <h4>{{.Title}}</h4>
            {{if .Subtitle}}<div class="custom-subtitle">{{.Subtitle}}{{if .Date}} · {{.Date}}{{end}}</div>{{end}}
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

const COMPACT_CSS = `:root {
    --font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
    --font-size-base: 9pt;
    --line-height: 1.4;
    --primary-color: #0F766E;
    --heading-color: #115E59;
    --text-color: #1F2937;
    --muted-color: #6B7280;
    --border-color: #CCFBF1;
    --accent-bg: #F0FDFA;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
    font-family: var(--font-family);
    font-size: var(--font-size-base);
    line-height: var(--line-height);
    color: var(--text-color);
    background: #fff;
}
.resume-page { width: 210mm; min-height: 297mm; padding: 12mm 14mm; background: #fff; }
.resume-container { max-width: 100%; }
.header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 8pt; padding-bottom: 6pt; border-bottom: 2px solid var(--primary-color);
}
.header-left { display: flex; align-items: baseline; gap: 8pt; }
.header-left h1 { font-size: 16pt; font-weight: 700; color: var(--heading-color); }
.job-title { font-size: 9pt; color: var(--primary-color); font-weight: 500; }
.years-exp { font-size: 8pt; color: var(--muted-color); }
.header-right { display: flex; flex-wrap: wrap; gap: 2pt 12pt; font-size: 7.5pt; color: var(--muted-color); text-align: right; max-width: 50%; }
.summary { margin-bottom: 8pt; font-size: 8pt; line-height: 1.5; color: var(--text-color); }
.section-title {
    font-size: 9pt; font-weight: 700; color: #fff; background: var(--primary-color);
    padding: 2pt 6pt; margin-bottom: 5pt; letter-spacing: 0.5pt; display: inline-block;
}
.experience-item { margin-bottom: 7pt; }
.exp-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1pt; }
.exp-header .company { font-weight: 700; font-size: 9pt; color: var(--heading-color); }
.exp-header .title { font-weight: 500; color: var(--primary-color); font-size: 8.5pt; }
.exp-header .date { font-size: 7.5pt; color: var(--muted-color); white-space: nowrap; }
.exp-location { font-size: 7.5pt; color: var(--muted-color); margin-bottom: 1pt; }
.exp-summary { font-size: 8pt; color: var(--text-color); margin-bottom: 2pt; }
.highlights { list-style: none; padding-left: 0; columns: 2; column-gap: 16pt; }
.highlights li {
    position: relative; padding-left: 8pt; margin-bottom: 1pt;
    font-size: 7.5pt; line-height: 1.4; break-inside: avoid;
}
.highlights li::before { content: "\\203A"; position: absolute; left: 0; color: var(--primary-color); font-weight: 700; }
.two-col { display: flex; gap: 16pt; margin-bottom: 6pt; }
.col-left { flex: 1; }
.col-right { flex: 1; }
.education-item { margin-bottom: 5pt; }
.edu-header { display: flex; justify-content: space-between; align-items: baseline; }
.edu-header .school { font-weight: 700; font-size: 8.5pt; color: var(--heading-color); }
.edu-header .date { font-size: 7.5pt; color: var(--muted-color); }
.edu-detail { font-size: 7.5pt; color: var(--muted-color); }
.skill-category { margin-bottom: 4pt; font-size: 8pt; }
.skill-cat-name { font-weight: 600; color: var(--heading-color); }
.skill-tag { display: inline; margin-right: 6pt; font-size: 8pt; color: var(--text-color); }
.skill-dot { display: inline-block; width: 5pt; height: 5pt; border-radius: 2pt; background: #CCFBF1; margin-left: 1pt; vertical-align: middle; }
.skill-dot.filled { background: var(--primary-color); }
.languages-line { font-size: 8pt; color: var(--text-color); margin-bottom: 6pt; display: flex; flex-wrap: wrap; gap: 2pt 12pt; }
.lang-label { font-weight: 600; color: var(--heading-color); }
.languages-line .label { font-weight: 600; }
.awards-inline { display: flex; flex-wrap: wrap; gap: 4pt; margin-bottom: 6pt; }
.award-tag { font-size: 7.5pt; padding: 2pt 6pt; background: var(--accent-bg); border-radius: 2pt; color: var(--text-color); }
.award-date { color: var(--muted-color); }
.custom-item { margin-bottom: 5pt; }
.custom-item h4 { font-size: 8.5pt; font-weight: 600; color: var(--heading-color); }
.custom-subtitle { font-size: 7.5pt; color: var(--muted-color); }
@media print {
    .resume-page { width: 100%; margin: 0; padding: 12mm 14mm; }
    @page { size: A4; margin: 0; }
}
.page-break { page-break-after: always; break-after: page; }
`

// Assign CSS to template objects now that all constants are initialized
MODERN_TEMPLATE.css = MODERN_CSS;
CLASSIC_TEMPLATE.css = CLASSIC_CSS;
MINIMAL_TEMPLATE.css = MINIMAL_CSS;
CREATIVE_TEMPLATE.css = CREATIVE_CSS;
EXECUTIVE_TEMPLATE.css = EXECUTIVE_CSS;
COMPACT_TEMPLATE.css = COMPACT_CSS;
