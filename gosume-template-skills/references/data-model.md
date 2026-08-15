# 数据模型参考

简历数据根对象为 `model.Resume`（Go 结构体）。模板通过 `{{.Field}}` 访问。所有字段名使用 PascalCase（Go 结构体字段名），不是 JSON 的 snake_case。

## 条目隐藏字段（Hidden / SummaryHidden）

所有条目类型都有可选的 `Hidden` 字段（`*bool`，nil 或 false 为可见），个人总结区块用 `SummaryHidden`。标准接入写法（与全部内置模板一致）：

```html
{{range .Jobs}}{{if not .Hidden}}
<div class="experience-item">...</div>
{{end}}{{end}}

{{if and .Summary (not .SummaryHidden)}}
<div class="summary">{{nl2br .Summary}}</div>
{{end}}
```

- 前端渲染时数据层已过滤 `Hidden=true` 的条目，且 `summary_hidden=true` 时 `Summary` 字段同样在数据层清空——因此即使模板只写 `{{if .Summary}}`（旧写法）也能响应隐藏开关；`{{if not .Hidden}}` / `{{if and .Summary (not .SummaryHidden)}}` 守卫是双保险，照抄内置写法即可
- 全部条目隐藏时，外层 `{{if .Jobs}}` 因数组为空而不渲染标题——模板无需额外处理

## 顶层结构

| 模板路径 | 类型 | 说明 |
|----------|------|------|
| `{{.Meta.Language}}` | string | 简历语言，`"zh-CN"` 或 `"en-US"` |
| `{{.Personal}}` | Personal | 个人信息 |
| `{{.Summary}}` | string | 个人总结（纯文本，用 `nl2br` 渲染换行） |
| `{{.Internships}}` | []Internship | 实习经历数组 |
| `{{.Jobs}}` | []Job | 工作经历数组 |
| `{{.Projects}}` | []Project | 项目经历数组 |
| `{{.Education}}` | []Education | 教育经历数组 |
| `{{.Skills}}` | []SkillGroup | 技能分组数组 |
| `{{.Languages}}` | []Language | 语言能力数组 |
| `{{.Awards}}` | []Award | 奖项数组 |
| `{{.Custom}}` | []CustomSection | 自定义区块数组 |

> 注意：`Meta` 只暴露 `Language` 字段给模板用，其他元数据（TemplateID、CreatedAt 等）不需要在模板中渲染。

## Personal（个人信息）

| 模板路径 | JSON key | 类型 | 说明 |
|----------|----------|------|------|
| `{{.Personal.FullName}}` | `full_name` | string | 姓名 |
| `{{.Personal.EnglishName}}` | `english_name` | string | 英文名 |
| `{{.Personal.Email}}` | `email` | string | 邮箱 |
| `{{.Personal.Phone}}` | `phone` | string | 手机号 |
| `{{.Personal.Wechat}}` | `wechat` | string | 微信 |
| `{{.Personal.QQ}}` | `qq` | string | QQ |
| `{{.Personal.Location}}` | `location` | string | 所在城市 |
| `{{.Personal.Website}}` | `website` | string | 个人网站 |
| `{{.Personal.LinkedIn}}` | `linkedin` | string | LinkedIn |
| `{{.Personal.GitHub}}` | `github` | string | GitHub |
| `{{.Personal.Avatar}}` | `avatar` | string | 头像（Base64 data URI 或文件路径） |
| `{{.Personal.Birthday}}` | `birthday` | string | 生日 |
| `{{.Personal.Gender}}` | `gender` | string | 性别 |
| `{{.Personal.JobTitle}}` | `job_title` | string | 求职意向/职位 |
| `{{.Personal.YearsOfExp}}` | `years_of_exp` | int | 工作年限（整数） |

## Job / Internship（工作/实习经历）

字段完全相同。

| 模板路径（range 内） | JSON key | 类型 | 说明 |
|----------------------|----------|------|------|
| `{{.ID}}` | `id` | string | 条目 ID（一般不渲染） |
| `{{.Company}}` | `company` | string | 公司名 |
| `{{.CompanyURL}}` | `company_url` | string | 公司网址 |
| `{{.Title}}` | `title` | string | 职位 |
| `{{.Location}}` | `location` | string | 工作地点 |
| `{{.StartDate}}` | `start_date` | string | 开始日期（如 `2020.01`） |
| `{{.EndDate}}` | `end_date` | string | 结束日期 |
| `{{.IsCurrent}}` | `is_current` | bool | 是否在职（影响 dateRange 显示"至今"） |
| `{{.Summary}}` | `summary` | string | 经历概述 |
| `{{.Highlights}}` | `highlights` | []string | 亮点列表（数组，需 range） |
| `{{.Keywords}}` | `keywords` | []string | 关键词列表 |

> 日期范围渲染：`{{dateRange .StartDate .EndDate .IsCurrent}}`，返回 `2020.01 - 2023.06` 或 `2020.01 - 至今`。

## Project（项目经历）

| 模板路径（range 内） | JSON key | 类型 | 说明 |
|----------------------|----------|------|------|
| `{{.ID}}` | `id` | string | 条目 ID |
| `{{.Name}}` | `name` | string | 项目名 |
| `{{.URL}}` | `url` | string | 项目网址 |
| `{{.Role}}` | `role` | string | 担任角色 |
| `{{.StartDate}}` | `start_date` | string | 开始日期 |
| `{{.EndDate}}` | `end_date` | string | 结束日期 |
| `{{.Summary}}` | `summary` | string | 项目概述 |
| `{{.Highlights}}` | `highlights` | []string | 亮点列表 |
| `{{.Keywords}}` | `keywords` | []string | 关键词 |
| `{{.Extras}}` | `extras` | []ExtraField | 自定义键值对数组 |

### ExtraField（项目自定义字段）

| 模板路径（range .Extras 内） | 类型 | 说明 |
|------------------------------|------|------|
| `{{.ID}}` | string | 字段 ID |
| `{{.Label}}` | string | 标签（如"技术栈"） |
| `{{.Value}}` | string | 值（多行文本，用 `nl2br` 渲染） |

渲染示例：
```html
{{if .Extras}}
{{range .Extras}}
<div class="extra-row"><span class="extra-label">{{.Label}}:</span> <span class="extra-value">{{nl2br .Value}}</span></div>
{{end}}
{{end}}
```

## Education（教育经历）

| 模板路径（range 内） | JSON key | 类型 | 说明 |
|----------------------|----------|------|------|
| `{{.ID}}` | `id` | string | 条目 ID |
| `{{.School}}` | `school` | string | 学校 |
| `{{.Degree}}` | `degree` | string | 学位 |
| `{{.Major}}` | `major` | string | 专业 |
| `{{.Minor}}` | `minor` | string | 辅修 |
| `{{.StartDate}}` | `start_date` | string | 开始日期 |
| `{{.EndDate}}` | `end_date` | string | 结束日期 |
| `{{.GPA}}` | `gpa` | string | GPA |
| `{{.Courses}}` | `courses` | string | 主修课程 |
| `{{.Highlights}}` | `highlights` | []string | 亮点列表 |

> 教育经历的日期范围一般用 `{{.StartDate}} - {{.EndDate}}` 直接拼接，因为教育经历通常没有"至今"语义。若需支持在读，也可用 `{{dateRange .StartDate .EndDate false}}`。

## SkillGroup / Skill（技能）

### SkillGroup

| 模板路径（range 内） | JSON key | 类型 | 说明 |
|----------------------|----------|------|------|
| `{{.ID}}` | `id` | string | 分组 ID |
| `{{.Category}}` | `category` | string | 分类名（如"编程语言"） |
| `{{.Items}}` | `items` | []Skill | 技能项数组 |

### Skill（range .Items 内）

| 模板路径 | JSON key | 类型 | 说明 |
|----------|----------|------|------|
| `{{.Name}}` | `name` | string | 技能名 |
| `{{.Level}}` | `level` | int | 等级 0-5（0 表示未评级） |
| `{{.Icon}}` | `icon` | string | 图标（一般不用） |

> 等级渲染：`{{skillLevel .Level}}`，返回 5 个 `<span class="skill-dot">` 或 `<span class="skill-dot filled">`。Level 3 会渲染 3 个 filled + 2 个 empty。模板 CSS 必须定义这两个类。

## Language（语言能力）

| 模板路径（range 内） | JSON key | 类型 | 说明 |
|----------------------|----------|------|------|
| `{{.ID}}` | `id` | string | 条目 ID |
| `{{.Name}}` | `name` | string | 语言名（如"英语"） |
| `{{.Level}}` | `level` | string | 熟练程度（如"流利"） |
| `{{.Proficiency}}` | `proficiency` | string | 补充说明 |

## Award（奖项）

| 模板路径（range 内） | JSON key | 类型 | 说明 |
|----------------------|----------|------|------|
| `{{.ID}}` | `id` | string | 条目 ID |
| `{{.Title}}` | `title` | string | 奖项名 |
| `{{.Date}}` | `date` | string | 获奖日期 |
| `{{.Issuer}}` | `issuer` | string | 颁发机构 |
| `{{.Summary}}` | `summary` | string | 说明 |

## CustomSection / CustomItem（自定义区块）

### CustomSection

| 模板路径（range 内） | JSON key | 类型 | 说明 |
|----------------------|----------|------|------|
| `{{.ID}}` | `id` | string | 区块 ID |
| `{{.Title}}` | `title` | string | 区块标题（如"兴趣爱好"） |
| `{{.Items}}` | `items` | []CustomItem | 条目数组 |

### CustomItem（range .Items 内）

| 模板路径 | JSON key | 类型 | 说明 |
|----------|----------|------|------|
| `{{.ID}}` | `id` | string | 条目 ID |
| `{{.Title}}` | `title` | string | 条目标题 |
| `{{.Subtitle}}` | `subtitle` | string | 副标题 |
| `{{.Date}}` | `date` | string | 日期 |
| `{{.Description}}` | `description` | string | 描述（多行，用 `nl2br`） |
| `{{.Highlights}}` | `highlights` | []string | 亮点列表 |

## 完整区块渲染模板

以下是所有区块的标准渲染骨架，可直接复制到 `template.html` 中按需调整。头像用 `safeURL`，条目 range 内带 `{{if not .Hidden}}` 守卫，总结区块带 `SummaryHidden` 判断（均为标准写法）：

```html
<!-- 个人信息 -->
<div class="header">
    {{if .Personal.Avatar}}<div class="header-avatar"><img src="{{safeURL .Personal.Avatar}}" alt="头像" /></div>{{end}}
    <h1>{{.Personal.FullName}}</h1>
    {{if .Personal.EnglishName}}<div class="english-name">{{.Personal.EnglishName}}</div>{{end}}
    {{if .Personal.JobTitle}}<div class="job-title">{{.Personal.JobTitle}}</div>{{end}}
    <div class="contact-line">
        {{if .Personal.Email}}<span>{{.Personal.Email}}</span>{{end}}
        {{if .Personal.Phone}}<span>{{.Personal.Phone}}</span>{{end}}
        {{if .Personal.Location}}<span>{{.Personal.Location}}</span>{{end}}
    </div>
</div>

<!-- 个人总结 -->
{{if and .Summary (not .SummaryHidden)}}
<div class="section-title">{{i18n .Meta.Language "个人总结" "Summary"}}</div>
<div class="summary">{{nl2br .Summary}}</div>
{{end}}

<!-- 实习经历（字段与 Jobs 完全相同，按需选用） -->
{{if .Internships}}
<div class="section-title">{{i18n .Meta.Language "实习经历" "Internships"}}</div>
{{range .Internships}}{{if not .Hidden}}
<div class="experience-item">
    <div class="exp-header">
        <div>
            <span class="company">{{.Company}}</span>
            {{if .Title}}<span class="title"> — {{.Title}}</span>{{end}}
        </div>
        {{if .StartDate}}<span class="date">{{dateRange .StartDate .EndDate .IsCurrent}}</span>{{end}}
    </div>
    {{if .Location}}<div class="exp-location">{{.Location}}</div>{{end}}
    {{if .Summary}}<div class="exp-summary">{{.Summary}}</div>{{end}}
    {{if .Highlights}}
    <ul class="highlights">{{range .Highlights}}<li>{{.}}</li>{{end}}</ul>
    {{end}}
</div>
{{end}}{{end}}
{{end}}

<!-- 工作经历 -->
{{if .Jobs}}
<div class="section-title">{{i18n .Meta.Language "工作经历" "Experience"}}</div>
{{range .Jobs}}{{if not .Hidden}}
<div class="experience-item">
    <div class="exp-header">
        <div>
            <span class="company">{{.Company}}</span>
            {{if .Title}}<span class="title"> — {{.Title}}</span>{{end}}
        </div>
        {{if .StartDate}}<span class="date">{{dateRange .StartDate .EndDate .IsCurrent}}</span>{{end}}
    </div>
    {{if .Location}}<div class="exp-location">{{.Location}}</div>{{end}}
    {{if .Summary}}<div class="exp-summary">{{.Summary}}</div>{{end}}
    {{if .Highlights}}
    <ul class="highlights">{{range .Highlights}}<li>{{.}}</li>{{end}}</ul>
    {{end}}
</div>
{{end}}{{end}}
{{end}}

<!-- 项目经历 -->
{{if .Projects}}
<div class="section-title">{{i18n .Meta.Language "项目经历" "Projects"}}</div>
{{range .Projects}}{{if not .Hidden}}
<div class="experience-item">
    <div class="exp-header">
        <span class="company">{{.Name}}</span>
        {{if .StartDate}}<span class="date">{{dateRange .StartDate .EndDate false}}</span>{{end}}
    </div>
    {{if .Role}}<div class="exp-role">{{.Role}}</div>{{end}}
    {{if .Summary}}<div class="exp-summary">{{.Summary}}</div>{{end}}
    {{if .Highlights}}
    <ul class="highlights">{{range .Highlights}}<li>{{.}}</li>{{end}}</ul>
    {{end}}
    {{if .Extras}}
    {{range .Extras}}
    <div class="extra-row"><span class="extra-label">{{.Label}}:</span> <span class="extra-value">{{nl2br .Value}}</span></div>
    {{end}}
    {{end}}
</div>
{{end}}{{end}}
{{end}}

<!-- 教育经历 -->
{{if .Education}}
<div class="section-title">{{i18n .Meta.Language "教育背景" "Education"}}</div>
{{range .Education}}{{if not .Hidden}}
<div class="education-item">
    <div class="edu-header">
        <div>
            <span class="school">{{.School}}</span>
            {{if .Degree}} · {{.Degree}}{{end}}
            {{if .Major}} · {{.Major}}{{end}}
        </div>
        {{if .StartDate}}<span class="date">{{.StartDate}} - {{.EndDate}}</span>{{end}}
    </div>
    {{if .GPA}}<div class="edu-detail">GPA: {{.GPA}}</div>{{end}}
    {{if .Courses}}<div class="edu-detail">{{i18n .Meta.Language "主修课程" "Courses"}}: {{.Courses}}</div>{{end}}
    {{if .Highlights}}
    <ul class="highlights">{{range .Highlights}}<li>{{.}}</li>{{end}}</ul>
    {{end}}
</div>
{{end}}{{end}}
{{end}}

<!-- 技能 -->
{{if .Skills}}
<div class="section-title">{{i18n .Meta.Language "专业技能" "Skills"}}</div>
{{range .Skills}}{{if not .Hidden}}
<div class="skill-category">
    <h4>{{.Category}}</h4>
    <div class="skill-list">
        {{range .Items}}{{if not .Hidden}}<span class="skill-item">{{.Name}}{{if .Level}} <span class="skill-level">{{skillLevel .Level}}</span>{{end}}</span>{{end}}{{end}}
    </div>
</div>
{{end}}{{end}}
{{end}}

<!-- 语言能力 -->
{{if .Languages}}
<div class="section-title">{{i18n .Meta.Language "语言能力" "Languages"}}</div>
<div class="inline-list">
    {{range .Languages}}{{if not .Hidden}}<span><span class="label">{{.Name}}</span>{{if .Level}} · {{.Level}}{{end}}{{if .Proficiency}} · {{.Proficiency}}{{end}}</span>{{end}}{{end}}
</div>
{{end}}

<!-- 奖项荣誉 -->
{{if .Awards}}
<div class="section-title">{{i18n .Meta.Language "奖项荣誉" "Awards"}}</div>
{{range .Awards}}{{if not .Hidden}}
<div class="award-item">
    <div class="award-header">
        <span class="award-title">{{.Title}}</span>
        {{if .Date}}<span class="date">{{.Date}}</span>{{end}}
    </div>
    {{if .Issuer}}<div class="award-issuer">{{.Issuer}}</div>{{end}}
    {{if .Summary}}<div class="exp-summary">{{.Summary}}</div>{{end}}
</div>
{{end}}{{end}}
{{end}}

<!-- 自定义区块 -->
{{if .Custom}}
{{range .Custom}}{{if not .Hidden}}
<div class="section-title">{{.Title}}</div>
{{range .Items}}{{if not .Hidden}}
<div class="custom-item">
    <h4>{{.Title}}</h4>
    {{if .Subtitle}}<div class="custom-subtitle">{{.Subtitle}}{{if .Date}} · {{.Date}}{{end}}</div>{{end}}
    {{if .Description}}<div class="exp-summary">{{nl2br .Description}}</div>{{end}}
    {{if .Highlights}}
    <ul class="highlights">{{range .Highlights}}<li>{{.}}</li>{{end}}</ul>
    {{end}}
</div>
{{end}}{{end}}
{{end}}{{end}}
{{end}}
```
