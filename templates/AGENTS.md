# AGENTS.md

## 模板系统概述

每个模板是一个独立的子目录，包含三个文件，构成简历渲染的最小单元。模板分内置模板（`templates/` 目录下，编译时嵌入）和用户模板（存储在 SQLite 中，通过导入或创建产生）。

## 模板目录结构

```
templates/
├── <dir-name>/              # 人类可读的目录名（如 modern、classic），与 id 无关
│   ├── template.json        # 模板元数据（manifest）
│   ├── template.html        # Go html/template 语法编写的简历 HTML
│   └── styles.css           # 打印 CSS 样式表
```

## template.json — 元数据规范

所有字段均为必需字段（带 `?` 标记的 `omitempty` 字段除外）。

```json
{
    "id":             "UUID v4（36 字符，格式 8-4-4-4-12），全局唯一标识",
    "name":           "中文名称",
    "name_en":        "英文名称",
    "version":        "语义化版本号（如 1.0.0）",
    "author": {
        "name":       "作者名称",
        "email":      "作者邮箱",
        "url":        "作者网站（选填）"
    },
    "description":     "中文描述，一句话说明适用场景和目标用户",
    "description_en":  "英文描述",
    "category":        "分类：tech / business / creative / academic / general",
    "tags":            ["标签数组，中英文均可，用于前端筛选和搜索"],
    "target_language": ["zh-CN", "en-US"],
    "page_count": {
        "min":         1,   // default 1
        "max":         5,  // default 5
        "default":     1   // default 1
    },
    "paper_size":      "纸张尺寸：A4 / Letter",
    "orientations":    ["portrait"],
    "colors": {
        "primary":     "#主色",
        "secondary":   "#辅色",
        "text":        "#正文颜色",
        "background":  "#背景颜色",
        "accent":      "#强调色（浅色底色块）"
    },
    "features": {
        "avatar":          true,    // 是否支持头像
        "skill_bars":      false,   // 是否显示技能进度条
        "qr_code":         false,   // 是否支持二维码
        "links_clickable": true     // 导出 PDF 时链接是否可点击
    },
    "sections": {
        "required":  ["personal", "jobs", "education"],
        "optional":  ["projects", "skills", "languages", "awards", "custom"],
        "layout":    ["personal", "jobs", "education", "skills", "projects", "languages", "awards", "custom"]
    },
    "data_schema": {},       // 各区块的字段级校验规则（选填）
    "css_variables": {}      // 模板特有的 CSS 变量覆盖（选填，key-value 对）
}
```

### 字段规范

| 字段 | 规范 |
|------|------|
| `id` | UUID v4 格式（`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`），数据库主键，全局唯一。目录名与之无关。示例：`a406004d-d3b8-4900-969f-8094f8e85cf0` |
| `version` | 严格遵循 SemVer，格式 `MAJOR.MINOR.PATCH` |
| `category` | 必须是以下枚举之一：`tech` `business` `creative` `academic` `general` |
| `tags` | 至少包含 3 个标签，中英文混合，纯英文标签使用小写 |
| `page_count.min` | 最小为 1，不得大于 max |
| `colors` | 所有颜色值必须为 6 位 HEX（`#RRGGBB`），需保证与白色背景的对比度达标 |
| `sections.required` | 必须至少包含 `personal`；`jobs` 和 `education` 强烈建议放在 required 中 |
| `sections.layout` | 指定区块在前端编辑器中的展示顺序 |

## template.html — 编写规范

### 模板引擎

使用 Go `html/template` 语法，数据根对象为 `model.Resume` 结构体。模板通过 `{{.Field}}` 访问字段，通过 `{{if .Field}}...{{end}}` 控制显隐。

### 文件结构约定

```html
<!DOCTYPE html>
<html lang="{{.Meta.Language}}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{.Personal.FullName}} - 简历</title>
    <style>{{template "styles.css" .}}</style>
</head>
<body class="resume-page">
    <div class="resume-container">
        <!-- 各区块按 layout 顺序排列 -->
    </div>
</body>
</html>
```

### CSS 引用

**必须**使用 `{{template "styles.css" .}}` 内联 CSS，不得使用 `<link>` 外部引用。这是为保证导出 PDF 时样式不丢失。

### 条件渲染

所有区块**必须**用 `{{if .SectionName}}` 包裹，确保数据为空时不渲染空区块：

```html
{{if .Jobs}}
<div class="section-title">工作经历</div>
{{range .Jobs}}...{{end}}
{{end}}
```

### 可访问的数据模型

| 模板路径 | 说明 |
|----------|------|
| `{{.Meta.Language}}` | 简历语言（`zh-CN` / `en-US`） |
| `{{.Personal.FullName}}` | 姓名 |
| `{{.Personal.EnglishName}}` | 英文名 |
| `{{.Personal.JobTitle}}` | 求职意向/职位 |
| `{{.Personal.YearsOfExp}}` | 工作年限 |
| `{{.Personal.Email}}` | 邮箱 |
| `{{.Personal.Phone}}` | 手机号 |
| `{{.Personal.Wechat}}` | 微信 |
| `{{.Personal.QQ}}` | QQ |
| `{{.Personal.Location}}` | 所在城市 |
| `{{.Personal.Website}}` | 个人网站 |
| `{{.Personal.GitHub}}` | GitHub |
| `{{.Personal.LinkedIn}}` | LinkedIn |
| `{{.Personal.Avatar}}` | 头像（Base64 data URI 或文件路径） |
| `{{.Summary}}` | 个人总结（纯文本，使用 `nl2br` 渲染） |
| `{{.Jobs}}` | 工作经历数组，每项含 Company、Title、StartDate、EndDate、IsCurrent、Location、Summary、Highlights |
| `{{.Education}}` | 教育经历数组，每项含 School、Degree、Major、Minor、GPA、StartDate、EndDate、Highlights |
| `{{.Skills}}` | 技能数组，每项含 Category 和 Items（每个 Item 含 Name、Level 0-5） |
| `{{.Projects}}` | 项目经历数组，每项含 Name、Role、StartDate、EndDate、Summary、Highlights |
| `{{.Languages}}` | 语言能力数组，每项含 Name、Level、Proficiency |
| `{{.Awards}}` | 奖项数组，每项含 Title、Date、Issuer、Summary |
| `{{.Custom}}` | 自定义区块数组，每项含 Title 和 Items |

### 内置模板辅助函数

| 函数 | 用法 | 说明 |
|------|------|------|
| `dateRange start end isCurrent` | `{{dateRange .StartDate .EndDate .IsCurrent}}` | 格式化日期范围，isCurrent 为 true 时显示"至今" |
| `skillLevel level` | `{{skillLevel .Level}}` | 返回进度点 HTML（skill-dot filled/empty） |
| `i18n lang zhKey enKey` | `{{i18n .Meta.Language "姓名" "Name"}}` | 根据简历语言输出中文或英文 |
| `nl2br text` | `{{nl2br .Summary}}` | 换行符转 `<br>`（使用前自动 HTML 转义） |
| `safeHTML html` | `{{safeHTML .SomeSafeHTML}}` | 输出原始 HTML，不做转义（仅用于已确保安全的内容） |
| `defaultVal fallback val` | `{{defaultVal "未填写" .Personal.Phone}}` | 值为空时返回默认值 |

### HTML 内容安全

- 所有用户输入数据**默认经过 `html/template` 自动转义**，防 XSS
- 如需输出原始 HTML，必须通过 `safeHTML` 函数显式标记
- 不得在模板中硬编码外部资源 URL（图片、字体等），所有资源应内嵌或使用 CSS 系统字体栈

## styles.css — CSS 样式规范

### 必须遵守

1. **页面尺寸**：`.resume-page` 必须设置 `width: 210mm; min-height: 297mm;`（A4）或对应 Letter 尺寸
2. **CSS 变量**：使用 `:root {}` 定义颜色和字体变量，命名为 `--primary-color`、`--text-color` 等
3. **字体栈**：使用系统安全字体栈，不得引用外部字体
   ```css
   --font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
   ```
4. **打印样式**：必须包含 `@media print` 和 `@page { size: A4; margin: 0; }`
5. **分页支持**：提供 `.page-break { page-break-after: always; break-after: page; }` 工具类
6. **字号单位**：统一使用 `pt`（打印友好），不使用 `px` 作为主要字号单位
7. **颜色值**：CSS 变量中的颜色应与 `template.json` 的 `colors` 字段一致

### 命名约定

| 层级 | 命名方式 |
|------|----------|
| 页面容器 | `.resume-page`、`.resume-container` |
| 头部 | `.header`、`.header-left`、`.header-avatar` |
| 章节标题 | `.section-title` |
| 经历条目 | `.experience-item`、`.exp-header`、`.exp-summary` |
| 教育条目 | `.education-item`、`.edu-header`、`.edu-detail` |
| 技能 | `.skills-grid`、`.skill-category`、`.skill-item`、`.skill-dots`、`.skill-dot`、`.skill-dot.filled` |
| 亮点列表 | `.highlights`、`.highlights li` |
| 联系信息 | `.contact-info`、`.contact-item`、`.contact-label` |
| 自定义区块 | `.custom-item` |

> 自定义类名无强制要求，但推荐沿用上述 BEM-like 约定以保证模板间的一致性。

### 必选样式元素

- `.skill-dot` 和 `.skill-dot.filled`：技能等级指示点（`skillLevel` 函数依赖这两个类）
- `.page-break`：分页控制
- 链接样式：导出的 PDF 中链接应有明显的颜色区分

## 模板包格式（.gosume-template）

用于用户间分享模板的 ZIP 打包格式。

### 文件结构

```
<template-name>.gosume-template  (本质是 ZIP 文件)
├── manifest.json                 # 即 template.json 的内容
├── template.html
└── styles.css
```

### 打包规范

- 文件名必须以 `.gosume-template` 或 `.zip` 结尾
- 压缩包总大小 ≤ 10MB
- 单个文件 ≤ 2MB
- 仅包含根目录下的三个文件，不含子目录
- 文件名必须精确匹配 `manifest.json` / `template.html` / `styles.css`
- `manifest.json` 中的 `id` 必须与已有模板不冲突

### 创建模板包

```bash
# 将模板的三个文件打包为 gosume-template 包
zip my-template.gosume-template manifest.json template.html styles.css
```

## 新建模板清单

创建新模板时，按以下步骤执行：

1. 在 `templates/` 下创建 `templates/<dir-name>/` 目录（目录名使用 kebab-case 即可，如 `modern-pro`）
2. 编写 `template.json`：填写完整元数据，`id` 字段使用 UUID v4（与目录名无关）
3. 编写 `template.html`：使用 Go 模板语法，所有区块加 `{{if}}` 判断，添加 `{{template "styles.css" .}}` 内联样式
4. 编写 `styles.css`：定义 A4 页面尺寸、CSS 变量、打印样式、技能点样式
5. 验证：在应用中通过编辑器实时预览检查各区块显示效果
6. 验证导出：导出 PDF 检查打印效果、分页、链接可点击性
7. 打包分发（可选）：`zip <template-id>.gosume-template manifest.json template.html styles.css`

## 禁止事项

- 不得在 HTML/CSS 中引用外部资源（CDN 字体、外部图片等）
- 不得使用 `@import` 引入外部样式表
- 不得在模板模板中执行 JavaScript（导出 PDF 时不执行 JS）
- 不得省略 `data_schema` 中的验证规则（如果模板对某些字段有特殊要求）
- 不得使用非 `pt`/`mm` 单位作为核心字号和间距单位（`px` 仅限细微调整）
- 不得修改其他模板的文件
