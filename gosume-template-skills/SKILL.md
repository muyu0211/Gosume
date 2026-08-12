---
name: gosume-template-creator
description: 创建可导入 Gosume 简历制作应用的模板包（.zip文件）。Gosume 是基于 Wails v3 的桌面简历工具，模板由 template.json、template.html、styles.css 三文件组成，打包为 ZIP文件后导入应用。支持两种输入方式：(1) 根据用户描述的风格需求从零创建模板；(2) 根据用户传入的简历图片/PDF/HTML 参考素材，提取风格特征并映射到 Gosume 数据模型，生成风格一致的可导入模板。当用户提到"简历模板""gosume 模板""制作可导入的简历模板""照着这个简历做一个模板""参考这张图/PDF 生成模板""template.json/template.html/styles.css 三件套""gosume-template 包"或希望为 Gosume 应用创建/设计/编写新模板时，使用此 skill。即使用户没明确提到"gosume"，只要上下文涉及这个项目的模板生成或希望参考某份简历样式生成模板，也应触发。
---

# Gosume 简历模板创建器

本 skill 指导你为 Gosume 简历制作应用创建**可导入使用**的模板包。所有生成的模板都满足应用的导入校验规则（`pkg/template/package_importer.go`），打包为 `.zip` 文件后可通过应用的"导入模板"功能直接使用。

## 关键约束（务必先读）

以下约束来自应用源码的**实际校验逻辑**，与项目内 `templates/AGENTS.md` 文档存在若干差异。**以本 skill 为准**，因为导入时跑的是源码校验。

### 1. 三文件结构与文件名

模板包是 ZIP 文件，根目录下必须包含三个文件，文件名**精确**为：

- `template.json`（元数据）— 注意：不是文档里说的 `manifest.json`，源码识别的是 `template.json`
- `template.html`（Go `html/template` 语法）
- `styles.css`（打印 CSS）

约束：不允许子目录；单文件 ≤ 2MB；整包 ≤ 10MB；不允许路径穿越（`../`、绝对路径会被拒）。

### 2. template.json 的 id 字段

`id` 为UUID生成，导入时如果出现id重复，则由Gosume后台进行修改替换，这里只需使用UUID生成一个占位符性质的id即可。

### 3. paper_size 只支持 A4

`paper_size` 字段必须是字符串 `"A4"`。源码中 `validateMeta` 明确写：`if meta.PaperSize != "A4"` 直接报错 "only A4 templates are currently supported"。Letter 等其他尺寸会被拒。

### 4. template.html 的语法限制（最重要！）

应用有**实时预览兼容性校验**（`validatePreviewCompatibleSyntax`），导入时会用正则扫描所有 `{{...}}` 表达式。以下写法**会被拒绝**：

| 禁止的写法 | 原因 |
|------------|------|
| `{{.Field \| func}}` 管道 | 不支持管道符 `\|` |
| `{{ $var := .Field }}` 变量声明 | 不支持 `:=` |
| `{{ $var }}` 变量引用 | 不支持 `$` |
| `{{with .Field}}` | 不支持 with 块 |
| `{{block "x" .}}` | 不支持 block |
| `{{define "x"}}` | 不支持 define |
| `{{template "foo" .}}`（除 styles.css 外） | 只允许 `{{template "styles.css" .}}` |
| `{{if eq .A .B}}` | if 后只能跟简单字段路径 |
| `{{range .Field \| filter}}` | range 后只能跟简单字段路径 |

**允许的写法**：

- 字段输出：`{{.Personal.FullName}}`、`{{.Jobs}}` 等简单点路径
- 条件：`{{if .Field}}...{{end}}`、`{{if .Field.Sub}}...{{end}}`（if 后只能跟 `.Field.Sub` 形式）
- 循环：`{{range .Field}}...{{end}}`（range 后同样只能跟简单路径）
- CSS 内联：`{{template "styles.css" .}}`（必须，用于内联样式）
- 以下 7 个内置函数调用：`dateRange`、`skillLevel`、`i18n`、`nl2br`、`safeHTML`、`safeURL`、`defaultVal`

### 5. safeURL 函数说明

渲染头像时推荐使用 `{{safeURL .Personal.Avatar}}`，与所有内置模板的写法一致。`safeURL` 会跳过 `html/template` 对 `src` 属性的默认 URL 过滤，避免 Base64 data URI 头像被不必要地转义。


### 6. 必填元数据字段

`validateMeta` 强制要求以下字段非空：

- `id`（满足上述正则）
- `name`（模板中文名）
- `version`（如 `1.0.0`）
- `author.name`（作者名）
- `paper_size`（必须 `"A4"`）

其他字段（`category`、`tags`、`page_count`、`orientations`、`target_language` 等）若为空会被 `normalizeMeta` 填默认值，但建议都填全以保证模板质量。

## 工作流程

收到"创建模板"类请求后，按以下步骤进行。**首先判断用户是否提供了参考素材**（图片/PDF/HTML 简历），这决定了后续流程。

### 步骤 1：判断输入类型并明确需求

#### 情况 A：用户提供了参考素材（图片/PDF/HTML）

如果用户消息中附带图片、PDF 或 HTML 文件，并希望"照着这个风格做模板"，走参考素材流程：

1. **读取素材**：
   - 图片（jpg/png/gif/webp）：用 `read_file` 工具读取，AI 直接视觉分析
   - PDF：用 `pdf` skill 提取文本和布局；若能截图则一并视觉分析
   - HTML：用 `read_file` 读取，分析结构和样式

2. **读取参考文档**：读 `references/reference-extraction.md`——里面详细说明了如何提取风格特征、做字段映射、处理特殊元素

3. **提取风格特征**（按 reference-extraction.md 的清单）：
   - 整体布局（单栏/双栏/头部+主体）
   - 配色方案（5 个 HEX 色）
   - 字体感觉（无衬线/衬线/等宽）
   - 章节标题样式
   - 经历条目布局
   - 头像处理
   - 技能展示方式

4. **向用户复述理解并确认**：
   - "我看出这是双栏布局，左侧栏放联系方式和技能，右侧放经历"
   - "主色是 #1E3A8A 深蓝，辅色 #374151，对吗？"
   - "参考素材中的图标/二维码无法完全还原，会简化为纯文字"
   - 确认后再动手写代码

**关键原则**：参考素材只是风格参考，最终模板必须符合 Gosume 的数据模型和校验规则。用户传入的简历字段名、区块结构可能与 Gosume 不同，必须按 `reference-extraction.md` 的映射表转换。

#### 情况 B：用户只描述需求（无参考素材）

主动向用户询问以下信息（用 `ask_followup_question` 或直接在回复中询问）。如果用户已经在消息里说了，就跳过对应项：

1. **风格定位**：简约/商务/创意/学术/极客？参考分类枚举：`tech` / `business` / `creative` / `academic` / `general`
2. **配色倾向**：深色稳重？浅色清新？单色极简？有无主色调偏好
3. **布局结构**：单栏？双栏（侧边栏）？头部+主体？
4. **目标人群**：技术人员？应届生？管理者？创意行业？
5. **必备特性**：是否需要头像？技能进度点？双语支持？
6. **id 与命名**：模板的中英文名、id（kebab-case）

#### 两种情况共通的确认项

无论哪种情况，写代码前都要确认：
- 模板 id
- 中英文名称
- 作者信息

### 步骤 2：读取参考资源

根据需求读取对应的参考文件，避免凭记忆出错：

- **从参考素材生成**：读 `references/reference-extraction.md`——如何提取风格、映射字段、处理特殊元素（**有参考素材时必读**）
- **数据模型**：读 `references/data-model.md`——简历所有字段、类型、JSON key、模板访问路径的完整清单。**编写 HTML 前必读**，否则容易写错字段名
- **校验规则**：本 SKILL.md 已覆盖核心规则，但完整细节在 `references/validation-rules.md`
- **样式规范**：读 `references/style-guide.md`——CSS 命名约定、必选样式元素、打印要求
- **完整示例**：`assets/starter/` 下有一个可运行的起手模板（minimal 风格），可作为起点复制修改

### 步骤 3：创建模板文件

在用户指定的工作目录下创建一个以模板 id 命名的目录，内含三文件：

```
<template-id>/
├── template.json
├── template.html
└── styles.css
```

**从参考素材生成时**：把提取的风格特征（配色、布局、字体、章节样式）落到 CSS 变量和 HTML 结构中。参考素材的字段名和区块结构必须按 `references/reference-extraction.md` 的映射表转换为 Gosume 字段——模板是为空简历设计的，不要把参考素材里的具体简历内容写进模板，只复刻结构和样式。

#### template.json 编写要点

参考 `assets/starter/template.json`。关键字段：

- `id`：kebab-case，2-64 字符（字母数字下划线连字符）
- `name` / `name_en`：中英文名
- `version`：`1.0.0`
- `category`：枚举之一（用于进行分类查找）
- `colors`：5 个 HEX 颜色，与 CSS 变量保持一致
- `features`：`avatar` / `skill_bars` / `qr_code` / `links_clickable` 四个布尔值
- `sections.layout`：区块展示顺序数组，可选值 `personal` `jobs` `education` `internships` `projects` `skills` `languages` `awards` `custom` `summary`

#### template.html 编写要点

- 文件骨架固定：`<!DOCTYPE html>` + `<html lang="{{.Meta.Language}}">` + `<style>{{template "styles.css" .}}</style>`
- 外层结构：`<body class="resume-page"><div class="resume-container">...区块...</div></body>`
- **每个区块必须用 `{{if .Section}}...{{end}}` 包裹**，避免空数据时渲染空标题
- 日期范围用 `{{dateRange .StartDate .EndDate .IsCurrent}}`
- 多行文本（summary、description）用 `{{nl2br .Field}}`
- 技能等级点用 `{{skillLevel .Level}}`（依赖 CSS 的 `.skill-dot` 和 `.skill-dot.filled`）
- 中英双语标签用 `{{i18n .Meta.Language "中文" "English"}}`
- 空值默认用 `{{defaultVal "未填写" .Field}}`
- 头像用 `{{safeURL .Personal.Avatar}}`（与内置模板一致，避免 data URI 被转义）

#### styles.css 编写要点

- `.resume-page` 必须设 `width: 210mm; min-height: 297mm;`（A4）
- `:root` 定义 CSS 变量，颜色值与 `template.json` 的 `colors` 一致
- 字体栈用系统字体：`'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif`
- 字号用 `pt`，间距用 `mm` 或 `pt`，避免 `px`
- 必须包含 `@media print` 和 `@page { size: A4; margin: 0; }`
- 必须定义 `.skill-dot` 和 `.skill-dot.filled`（如果模板启用技能点）
- 必须定义 `.page-break { page-break-after: always; break-after: page; }`

### 步骤 4：自检

写完三文件后，对照以下清单逐项检查。**这是导入成功的关键**：

- [ ] `template.json` 的 `id` 匹配 `^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$`
- [ ] `paper_size` 是 `"A4"`
- [ ] `name`、`version`、`author.name` 非空
- [ ] `template.html` 中**没有** `|`、`:=`、`$`、`with`、`block`、`define`
- [ ] `{{template "styles.css" .}}` 是唯一的 template include
- [ ] 所有 `{{if}}` / `{{range}}` 后跟的是简单字段路径（`.Field` 或 `.Field.Sub`），不是函数调用或表达式
- [ ] 函数调用仅限：`dateRange`、`skillLevel`、`i18n`、`nl2br`、`safeHTML`、`defaultVal`
- [ ] 每个区块都有 `{{if .Section}}` 包裹
- [ ] CSS 定义了 `.resume-page` 的 A4 尺寸、`@media print`、`.skill-dot`（若用技能点）

### 步骤 5：打包为 .zip
用 `assets/scripts/package-template.ps1`（Windows）或 `package-template.sh`（Unix）打包。脚本会：

1. 进入模板目录
2. 读取 `template.json` 的 `name` 字段作为输出文件名（方便用户识别，如 `渐变现代风.zip`）
3. 用 zip 压缩三个文件为 `<name>.zip`（自动清理文件名非法字符）

Windows PowerShell：
```powershell
& "<skill-dir>/assets/scripts/package-template.ps1" -TemplateDir "<模板目录>" -OutputDir "<输出目录>"
```

Unix：
```bash
bash <skill-dir>/assets/scripts/package-template.sh <模板目录> <输出目录>
```

如果用户机器上没有脚本运行环境，直接告诉用户在模板目录下执行：
```powershell
Compress-Archive -Path template.json,template.html,styles.css -DestinationPath "<name>.zip" -Force
```
（用 `template.json` 的 `name` 字段值作为文件名，如 `渐变现代风.zip`。注意：需确保三文件在 zip 根目录，不要带父目录层级。）

### 步骤 6：交付

告诉用户：

1. 生成的 `.zip` 文件路径
2. 在 Gosume 应用中通过"导入模板"功能选择该文件
3. 导入后可在模板列表中看到新模板，新建简历时选择它
4. 建议在应用中实时预览各区块效果，并导出 PDF 验证打印效果

## 参考资源索引

| 文件 | 何时读 |
|------|--------|
| `references/reference-extraction.md` | 用户提供图片/PDF/HTML 参考素材时——风格提取和字段映射 |
| `references/data-model.md` | 编写 template.html 前——字段清单 |
| `references/validation-rules.md` | 遇到导入失败或不确定某写法是否合法时 |
| `references/style-guide.md` | 编写 styles.css 前——命名约定、必选元素 |
| `references/builtin-functions.md` | 需要了解 7 个内置函数的签名和用法时 |
| `assets/starter/` | 需要一个可运行的起手模板时 |

## 常见错误与修复

| 错误信息 | 原因 | 修复 |
|----------|------|------|
| `template id must be 2-64 characters...` | id 格式不对 | 改为 kebab-case，如 `my-template` |
| `only A4 templates are currently supported` | paper_size 不是 A4 | 改为 `"A4"` |
| `unsupported template expression for live preview: {{...}}` | 用了禁止的语法 | 见上面"语法限制"表 |
| `unsupported template control expression` | if/range 后跟了非简单路径 | 简化为 `{{if .Field}}` 或 `{{range .Field}}` |
| `only {{template "styles.css" .}} includes are supported` | 用了其他 template include | 删除，只保留 styles.css |
| `missing required file: template.json` | 文件名错或文件不在 zip 根目录 | 确保三文件在 zip 根目录，文件名精确 |
| `template package is too large` | 超过 10MB | 精简 CSS/HTML，移除不必要的样式 |

## 设计建议

### 视觉质量

- **对比与层次**：标题与正文有明显的字号/字重对比；章节标题用 `text-transform: uppercase; letter-spacing` 增强辨识度
- **留白**：区块间距 12-16pt，行高 1.5-1.7，避免拥挤
- **色彩克制**：主色用于标题和强调，正文保持深灰（`#1F2937`）以保证可读性；避免大面积鲜艳色块
- **分隔元素**：细线（`0.5-1.5pt`）、色块、图标均可，但保持一致性

### 排版细节

- 日期右对齐：用 `display: flex; justify-content: space-between` 让标题与日期分居两侧
- 技能展示：进度点（`.skill-dot`）适合精确分级；标签云适合技能名称罗列
- 头像：若启用，放头部一角，尺寸 60-80pt，圆角或方形根据风格定

### 双栏布局（侧边栏）

若做双栏（如 creative 风格）：

```css
.resume-container { display: flex; gap: 16pt; }
.sidebar { width: 32%; }
.main { flex: 1; }
```

侧边栏放：头像、联系方式、技能、语言
主体放：工作经历、项目、教育、奖项

注意：双栏在打印时仍需保证内容不溢出 A4 宽度。

## 禁止事项

- 不得在 HTML/CSS 中引用外部资源（CDN 字体、外部图片、web font）
- 不得用 `@import` 引入外部样式表
- 不得在模板中执行 JavaScript（导出 PDF 时不执行 JS）
- 不得用 `safeURL`（见上文解释）
- 不得用非 `pt`/`mm` 单位作为核心字号和间距单位（`px` 仅限细微调整）
