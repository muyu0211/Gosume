---
name: gosume-template-creator
description: 创建可导入 Gosume 简历制作应用的模板包（.zip文件）。Gosume 是基于 Wails v3 的桌面简历工具。一期改造后，模板只由 template.json（元数据）+ styles.css（样式）两个文件组成——简历的 HTML 结构由应用内置的统一 HTML（unified.html）承载，模板制作者只需写 CSS 决定"简历长什么样"。支持两种输入方式：(1) 根据用户描述的风格需求从零创建模板；(2) 根据用户传入的简历图片/PDF/HTML 参考素材，提取风格特征并映射到 Gosume 的统一 HTML DOM 契约，生成风格一致的可导入模板。当用户提到"简历模板"、"gosume 模板"、"制作可导入的简历模板"、"照着这个简历做一个模板"、"参考这张图/PDF 生成模板"，或希望为 Gosume 应用创建/设计/编写新模板时，使用此 skill。即使用户没明确提到"gosume"，只要上下文涉及这个项目的模板生成或希望参考某份简历样式生成模板，也应触发。
---

# Gosume 简历模板创建器

本 skill 指导你为 Gosume 简历制作应用创建**可导入使用**的模板包。所有生成的模板都满足应用的导入校验规则，打包为 `.zip` 文件后可通过 Gosume 应用的"导入模板"功能直接使用。

## 核心概念（一期改造后）

Gosume 一期改造后，模板从"三板斧"（html + css + json）简化为**两个文件**：

- `template.json`：模板元数据（名称、作者、分类、颜色、特性等）
- `styles.css`：样式表（针对统一 HTML 的固定 DOM 结构写样式）

简历的 HTML 结构**不再由模板提供**，而是由应用内置的**统一 HTML**（`templates/unified.html`）承载。它定义了固定的 DOM 契约（见下文），模板制作者的唯一职责是**写 CSS 决定"简历长什么样"**——布局（单栏/双栏）、配色、字体、间距、头像位置等，全部由 CSS 控制。

> 为什么这样设计：HTML 控制"简历里有什么数据"（对所有简历都一样，且涉及应用数据逻辑，用户不该干预）；CSS 控制"数据怎么呈现"（这才是模板制作者该提供的）。统一 HTML 后，用户模板无法通过 HTML 干预数据形态，导入更安全、渲染更稳定。

## 关键约束（务必先读）

以下约束来自应用源码的**实际校验逻辑**和统一 HTML 的**实际 DOM 契约**，请严格遵守。

### 1. 两文件结构与文件名

模板包是 ZIP 文件，根目录下必须包含两个文件，文件名**精确**为：

- `template.json`（元数据）
- `styles.css`（样式）

约束：不允许子目录；单文件 ≤ 2MB；整包 ≤ 10MB；不允许路径穿越（`../`、绝对路径会被拒）。

> 历史模板包若仍带 `template.html`，导入时会**宽松忽略**（不读取、不影响导入），但新模板**不应再生成** `template.html`。

### 2. 统一 HTML 的 DOM 契约（最重要！）

模板制作者**不写 HTML**，但必须知道统一 HTML 会渲染出什么结构，才能写对 CSS 选择器。契约如下（与 `templates/unified.html` 对齐，修改必须同步更新）：

```
<body>
  <div class="resume-page">           ← 单页单元（A4 尺寸 + 页边距 + 背景）
    <div class="resume-container">    ← 内容包裹层（分页算法据此拆分）
      <header class="r-header">       ← 个人信息区（姓名/头像/联系方式/语言）
        ├─ .r-avatar                 ← 头像（仅简历含头像数据时渲染）
        ├─ .r-header-text            ← 姓名/英文名/职位/年限
        │    ├─ .r-name（h1）
        │    ├─ .r-ename
        │    ├─ .r-jobtitle
        │    └─ .r-yoe
        ├─ .r-contact                ← 联系方式（含 .r-subtitle 小节标题）
        │    └─ .r-contact-item（.r-contact-label + .r-contact-value）
        └─ .r-langs                  ← 语言（仅含语言数据时渲染，含 .r-subtitle）
             └─ .r-lang
      <main class="r-main">          ← 章节区（.section-title 与条目为兄弟节点，扁平）
        ├─ .section-title            ← 各区块标题
        ├─ .experience-item          ← 工作/实习/项目条目
        │    ├─ .exp-header（.company/.title/.date）
        │    ├─ .exp-location        ← 仅工作/实习
        │    ├─ .exp-summary
        │    ├─ .highlights（li）
        │    └─ .extra-row（.extra-label + .extra-value）← 仅项目
        ├─ .education-item           ← 教育条目
        │    ├─ .edu-header（.edu-school/.date）
        │    ├─ .edu-detail
        │    ├─ .edu-courses
        │    └─ .highlights（li）
        ├─ .award-item               ← 奖项条目
        │    ├─ .award-header（.award-title/.date）
        │    ├─ .award-issuer
        │    └─ .exp-summary
        ├─ .skills-grid              ← 技能外层容器
        │    └─ .skill-category（h4 + .skill-item（.skill-dots > .skill-dot/.skill-dot.filled））
        ├─ .summary                  ← 个人总结
        └─ .custom-item              ← 自定义条目（h4/.subtitle/.exp-summary/.highlights）
      </main>
    </div>
  </div>
</body>
```

**完整类名清单**（模板 CSS 必须对齐，不可自造类名）：

| 区域 | 类名 |
|------|------|
| 页面/容器 | `.resume-page`、`.resume-container` |
| 头部 | `.r-header`、`.r-avatar`、`.r-header-text`、`.r-name`、`.r-ename`、`.r-jobtitle`、`.r-yoe` |
| 联系方式/语言 | `.r-contact`、`.r-contact-item`、`.r-contact-label`、`.r-contact-value`、`.r-langs`、`.r-lang`、`.r-subtitle` |
| 章节标题 | `.section-title` |
| 经历条目 | `.experience-item`、`.exp-header`、`.company`、`.title`、`.date`、`.exp-location`、`.exp-summary`、`.highlights` |
| 教育条目 | `.education-item`、`.edu-header`、`.edu-school`、`.edu-detail`、`.edu-courses` |
| 技能 | `.skills-grid`、`.skill-category`、`.skill-item`、`.skill-dots`、`.skill-dot`、`.skill-dot.filled` |
| 奖项 | `.award-item`、`.award-header`、`.award-title`、`.award-issuer` |
| 自定义 | `.custom-item`、`.subtitle` |
| 项目扩展 | `.extra-row`、`.extra-label`、`.extra-value` |
| 总结 | `.summary` |

渲染顺序固定：教育 → 实习 → 工作 → 项目 → 奖项 → 技能 → 总结 → 自定义。如需调序只能用 CSS `order`（不建议依赖）。

### 3. 单栏 / 双栏完全由 CSS 决定

分页核心按 `.resume-container` 的 computed `display` 区分单/双栏：

- **单栏**：`.resume-container { display: block; }`，`.r-header` 是顶部块，`.r-main` 是下方章节。
- **双栏**：`.resume-container` 为 grid，`.r-header` 即侧栏（左/右皆可，通高）：

```css
.resume-container {
    display: grid;
    grid-template-columns: 62mm 1fr;          /* 侧栏宽 + 主栏 */
    grid-template-areas: "header main";
    grid-template-rows: 1fr;
    min-height: 297mm;                        /* 让侧栏背景通高整页 */
}
.r-header { grid-area: header; }
.r-main   { grid-area: main; }
```

侧栏（`.r-header`）内部用 `grid-template-areas` 竖向排布：头像在上 → 姓名 → 联系方式 → 语言。

### 4. 头像位置由 CSS 决定

统一 HTML 仅在简历含头像数据时渲染 `.r-avatar`，**位置完全由 CSS 决定**：

- **双栏**：`.r-avatar` 放侧栏（`.r-header` 内部 grid-template-areas 排布，头像通常在最上）。
- **单栏**：`.r-header` 内部用 grid-template-areas 排布，三选一：
  - 头像右置：`grid-template-columns: 1fr auto; grid-template-areas: "text avatar" "contact contact" "langs langs";`
  - 头像居中：`grid-template-columns: 1fr; grid-template-areas: "avatar" "text" "contact" "langs"; justify-items: center; text-align: center;`
  - 头像左置：与右置对称 `"avatar text"`。

是否显示头像由模板 CSS 决定（`features.avatar` 仅为元数据，不参与渲染）。

### 5. 页边距必须通过 CSS 变量消费

应用运行时按用户"页边距档位"注入 CSS 变量，模板的 padding 必须消费它并带 fallback：

```css
/* 单栏模板：页边距落在 .resume-page 的 padding 上 */
.resume-page { padding: var(--resume-padding, 14mm 18mm); }

/* 双栏模板：页边距落在 .r-header / .r-main 的 padding 上 */
.r-header { padding: var(--resume-padding-y, 14mm) var(--resume-padding-x, 16mm); }
.r-main   { padding: var(--resume-padding-y, 14mm) var(--resume-padding-x, 16mm); }
```

| CSS 变量 | 注入内容 | 消费者 |
|----------|----------|--------|
| `--resume-padding` | `上下 左右` 简写 | 单栏模板的 `.resume-page` |
| `--resume-padding-y` / `--resume-padding-x` | 纵向 / 横向分量 | 双栏模板的 `.r-header` / `.r-main` |

> ⚠️ 单栏模板的页边距**必须落在 `.resume-page` 的 padding 上，不得落在 `.r-header`/`.r-main` 等内容区自身的 padding 上**（分页与导出管线只把 `.resume-page` 的 padding 当"页边距"消费/折叠）。需要"全出血"头部时也不得用负 margin 把头部拉出页面，应退化为页面内的一块色块。

### 6. 垂直间距方向：一律 margin-bottom

模块内条目与条目内部细节行的节奏间距**一律用 `margin-bottom`**，禁止用 `margin-top`（应用按"内容间距档位"注入 `margin-bottom !important` 覆盖规则，方向不一致会导致档位调整时行为错乱）。仅两类例外允许 `margin-top`：

- 装饰性元素（时间轴线、强调线、伪元素分隔符等非内容流组件）
- 文档流末尾的收尾组件（如 `.footer`，其后无兄弟元素）

### 7. 隐藏（Hidden）由数据层处理，模板不写守卫

简历每个条目都有 `Hidden` 开关，但**统一 HTML 已移除 `{{if not .Hidden}}` 守卫**，隐藏改由数据层统一过滤（前端 `toGoShape` + 后端 `WithoutHidden`）。因此：

- 模板 CSS **不需要、也不应该**写任何 Hidden 守卫——它们已经不存在于 HTML 中。
- 区块级隐藏（所有条目隐藏时标题不显示）由统一 HTML 的 `{{if .Section}}` 天然实现——过滤后数组为空即不渲染整个区块。
- 模板 CSS 只需保证"区块有数据时正常渲染"即可。

### 8. 必填元数据字段

`validateMeta` 强制要求以下字段非空：

- `id`（匹配 `^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$`，推荐 UUID v4 或 kebab-case）
- `name`（模板中文名）
- `version`（如 `1.0.0`）
- `author.name`（作者名）
- `paper_size`（必须 `"A4"`）

`uses_unified_html` 建议设为 `true`（标记已迁移到统一 HTML；用户模板即使不填，也始终按"无自带 HTML"处理，使用统一 HTML）。

其他字段（`category`、`tags`、`page_count`、`orientations`、`target_language` 等）若为空会被 `normalizeMeta` 填默认值，但建议都填全以保证模板质量。

### 9. paper_size 只支持 A4

`paper_size` 字段必须是字符串 `"A4"`。源码 `validateMeta` 明确写 `if meta.PaperSize != "A4"` 直接报错 "only A4 templates are currently supported"。Letter 等其他尺寸会被拒。

## 工作流程

收到"创建模板"类请求后，按以下步骤进行。**首先判断用户是否提供了参考素材**（图片/PDF/HTML 简历），这决定了后续流程。

### 步骤 1：判断输入类型并明确需求

#### 情况 A：用户提供了参考素材（图片/PDF/HTML）

1. **读取素材**：图片用 `read_file` 视觉分析；PDF 用 `pdf` skill 提取布局；HTML 用 `read_file` 分析结构样式。
2. **读取参考文档**：读 `references/reference-extraction.md`——如何提取风格、映射到统一 HTML 契约。
3. **提取风格特征**：布局（单栏/双栏）、配色（5 个 HEX）、字体感觉、章节标题样式、经历条目布局、头像处理、技能展示方式。
4. **向用户复述理解并确认**后再动手。

**关键原则**：参考素材只是风格参考，最终模板必须对齐统一 HTML 的 DOM 契约。用户传入的字段名/区块结构可能与 Gosume 不同，只复刻**结构和样式**，不搬运具体简历内容。

#### 情况 B：用户只描述需求（无参考素材）

询问：风格定位（tech/business/creative/academic/general）、配色倾向、布局结构（单栏/双栏）、目标人群、必备特性（头像/技能点/双语）、模板命名。

两种情况的共通确认项：模板 id、中英文名、作者信息。

### 步骤 2：读取参考资源

- **数据契约**：读 `references/data-model.md`——统一 HTML 的 DOM 契约 + 各区块字段（写 CSS 前必读，确认类名和结构）
- **样式规范**：读 `references/style-guide.md`——CSS 命名、必选元素、单/双栏写法、页边距变量
- **校验规则**：`references/validation-rules.md`（遇到导入失败时）
- **内置函数副作用**：`references/builtin-functions.md`（了解 skillLevel 依赖 .skill-dot 等）
- **起手模板**：`assets/starter/`（一个可运行的单栏起手模板）

### 步骤 3：创建模板文件

在用户指定目录下创建 `<template-id>/` 目录，内含**两个文件**：

```
<template-id>/
├── template.json
└── styles.css
```

#### template.json 编写要点

参考 `assets/starter/template.json`。关键字段：`id`（UUID）、`name`/`name_en`、`version`、`category`、`colors`（5 个 HEX，与 CSS 变量一致）、`features`（avatar/skill_bars/qr_code/links_clickable）、`uses_unified_html: true`、`paper_size: "A4"`、`sections.layout`（区块展示顺序）。

#### styles.css 编写要点

- `.resume-page` 必须设 `width: 210mm; min-height: 297mm;`（A4）
- **单/双栏由 `.resume-container` 的 `display` 决定**（block = 单栏，grid = 双栏），见第 3 节
- **页边距经 CSS 变量消费**（`--resume-padding` / `--resume-padding-y` / `--resume-padding-x`），见第 5 节
- **节奏间距一律 `margin-bottom`**，见第 6 节
- **沿用标准类名**（见第 2 节类名清单），模板自动接入"内容间距"档位调整
- `.summary` 必须加 `overflow-wrap: break-word; word-break: break-word;`
- `:root` 定义 CSS 变量，颜色值与 `template.json` 的 `colors` 一致
- 字体栈用系统字体：`'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif`
- 字号用 `pt`，间距用 `mm` 或 `pt`，避免 `px`
- 必须包含 `@media print` 和 `@page { size: A4; margin: 0; }`
- 若启用技能点，必须定义 `.skill-dot` 和 `.skill-dot.filled`（`skillLevel` 函数依赖）
- 必须定义 `.page-break { page-break-after: always; break-after: page; }`

### 步骤 4：自检

写完两个文件后，对照以下清单逐项检查：

- [ ] `template.json` 的 `id` 匹配 `^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$`
- [ ] `paper_size` 是 `"A4"`；`uses_unified_html` 是 `true`
- [ ] `name`、`version`、`author.name` 非空
- [ ] 包内只有 `template.json` + `styles.css` 两文件，**没有** `template.html`
- [ ] CSS 选择器全部对齐统一 HTML 类名（`.r-header`/`.r-contact`/`.edu-school`/`.skill-dots` 等），无自造类名
- [ ] 单栏 `.resume-container` 是 `block`；双栏是 `grid`（`grid-template-areas: "header main"`）
- [ ] `.resume-page`（单栏）或 `.r-header`/`.r-main`（双栏）的 padding 用 `var(--resume-padding[-y/-x], 默认值)` 消费
- [ ] 节奏间距全部用 `margin-bottom`（无 `margin-top` 表达条目/细节间距）
- [ ] `.summary` 有 `overflow-wrap: break-word; word-break: break-word;`
- [ ] CSS 定义了 A4 尺寸、`@media print`、`.skill-dot`（若用技能点）、`.page-break`

### 步骤 5：打包为 .zip

用 `assets/scripts/package-template.ps1`（Windows）或 `package-template.sh`（Unix）打包。脚本会：进入模板目录 → 读 `template.json` 的 `name` 作为输出文件名 → 压缩两个文件为 `<name>.zip`（自动清理文件名非法字符）。

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
Compress-Archive -Path template.json,styles.css -DestinationPath "<name>.zip" -Force
```
（用 `template.json` 的 `name` 字段值作为文件名。注意：需确保两文件在 zip 根目录，不要带父目录层级。）

### 步骤 6：交付

告诉用户：① 生成的 `.zip` 文件路径；② 在 Gosume 应用"导入模板"选择该文件；③ 导入后新建简历时选择它；④ 建议在应用中实时预览各区块效果并导出 PDF 验证打印效果。

## 参考资源索引

| 文件 | 何时读 |
|------|--------|
| `references/reference-extraction.md` | 用户提供图片/PDF/HTML 参考素材时——风格提取和字段映射 |
| `references/data-model.md` | 编写 styles.css 前——统一 HTML 的 DOM 契约与区块字段 |
| `references/validation-rules.md` | 遇到导入失败或不确定某写法是否合法时 |
| `references/style-guide.md` | 编写 styles.css 前——命名约定、必选元素、单/双栏写法 |
| `references/builtin-functions.md` | 需要了解统一 HTML 内置函数的副作用（如 skillLevel 依赖 .skill-dot）时 |
| `assets/starter/` | 需要一个可运行的起手模板时 |

## 常见错误与修复

| 错误信息 | 原因 | 修复 |
|----------|------|------|
| `template id must be 2-64 characters...` | id 格式不对 | 用 UUID v4 或 kebab-case |
| `only A4 templates are currently supported` | paper_size 不是 A4 | 改为 `"A4"` |
| `template name is required` | name 空 | 填模板中文名 |
| `template version is required` | version 空 | 填 `1.0.0` |
| `template author name is required` | author.name 空 | 填作者名 |
| `styles.css is empty` | css 空 | 补充样式 |
| `missing required file: template.json/styles.css` | 文件名错或不在 zip 根目录 | 确保两文件在 zip 根目录，文件名精确 |
| `template package is too large` | 超过 10MB | 精简 CSS |
| `unsafe path in template package` | zip 内有路径穿越 | 确保文件在 zip 根目录 |

## 设计建议

### 视觉质量
- 对比与层次：标题与正文有明显字号/字重对比；章节标题用 `text-transform: uppercase; letter-spacing` 增强辨识度
- 留白：区块间距 12-16pt，行高 1.5-1.7
- 色彩克制：主色用于标题和强调，正文保持深灰（`#1F2937`）
- 分隔元素：细线（0.5-1.5pt）、色块均可，保持一致性

### 排版细节
- 日期右对齐：`.exp-header` 用 `display: flex; justify-content: space-between` 让标题与日期分居两侧
- 技能展示：进度点（`.skill-dot`）适合精确分级；标签云适合技能名罗列
- 头像：若启用，放头部一角（单栏）或侧栏顶部（双栏），尺寸 60-80pt

### 双栏布局（侧边栏）

双栏用 grid 实现（见第 3 节），侧栏（`.r-header`）放头像、姓名、联系方式、语言；主体（`.r-main`）放工作经历、项目、教育、奖项、技能。注意双栏打印时内容不溢出 A4 宽度。

## 禁止事项

- 不得在模板包中携带 `template.html`（统一 HTML 由应用内置，用户模板的 HTML 一律被忽略）
- 不得在 CSS 中引用外部资源（CDN 字体、外部图片、web font）
- 不得用 `@import` 引入外部样式表
- 不得依赖统一 HTML 之外的类名/结构（如旧版 `.sidebar`、`.header`、`.header-left`、`.contact-info`、`.school`、`.skill-list` 等仅存在于旧单套 HTML 中的类）
- 不得硬编码页边距 padding（必须经 `var(--resume-padding[-y/-x], fallback)` 消费）
- 不得用 `margin-top` 表达模块内条目/细节行的节奏间距（一律 `margin-bottom`）
- 不得用非 `pt`/`mm` 单位作为核心字号和间距单位（`px` 仅限细微调整）
