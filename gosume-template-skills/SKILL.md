---
name: gosume-template-creator
description: 创建可导入 Gosume 简历制作应用的模板包（.zip 文件）。Gosume 是基于 Wails v3 的桌面简历工具。模板只由 template.json（元数据）+ styles.css（样式）两个文件组成——简历的 HTML 结构由应用内置的统一 HTML（templates/template.html）承载，模板制作者只需写 CSS 决定"简历长什么样"。支持两种输入方式：(1) 根据用户描述的风格需求从零创建模板；(2) 根据用户传入的简历图片/PDF/HTML 参考素材，提取风格特征并映射到 Gosume 的统一 HTML DOM 契约，生成风格一致的可导入模板。当用户提到"简历模板"、"gosume 模板"、"制作可导入的简历模板"、"照着这个简历做一个模板"、"参考这张图/PDF 生成模板"，或希望为 Gosume 应用创建/设计/编写新模板时，使用此 skill。即使用户没明确提到"gosume"，只要上下文涉及这个项目的模板生成或希望参考某份简历样式生成模板，也应触发。
---

# Gosume 简历模板创建器

本 skill 指导你为 Gosume 简历制作应用创建**可导入使用**的模板包。生成的模板满足应用的导入校验规则，打包为 `.zip` 后可通过 Gosume 的「导入模板」功能直接使用。

## 核心概念

Gosume 模板包**只有两个文件**：

- `template.json`：模板元数据（名称、作者、分类、颜色、特性等）
- `styles.css`：样式表（针对统一 HTML 的固定 DOM 结构写样式）

简历的 HTML 结构**不由模板提供**，而是由应用内置的**统一 HTML**承载。它定义固定的 DOM 契约，模板制作者的唯一职责是**写 CSS 决定"简历长什么样"**——布局（单栏/双栏）、配色、字体、间距、头像位置等，全部由 CSS 控制。

> 为什么这样设计：HTML 控制"简历里有什么数据"（所有简历都一样，且涉及应用数据逻辑，用户不该干预）；CSS 控制"数据怎么呈现"。统一 HTML 后，导入更安全、渲染与分页更稳定。

### 权威源（改规范前先核对）

本 skill 的契约来自以下仓库文件，**以源码为准**，不要凭记忆写选择器：

| 主题 | 权威源 |
|------|--------|
| DOM 契约 / 内置函数 | `templates/template.html` |
| 模板元数据字段 | `templates/AGENTS.md` |
| 全局静态样式与选择器契约 | `templates/resume-global.css` |
| 导入校验 | `pkg/resume/template/template_importer.go` |
| per-resume 运行时覆盖 | `frontend/src/lib/customCss.ts`、`frontend/src/lib/layoutPresets.ts` |
| 分页 / 联系方式自适应 | `frontend/src/lib/paginationCore.ts`、`frontend/src/lib/contactFit.ts` |
| 板块顺序 | `frontend/src/lib/sectionOrder.ts` |
| 现成范例 | `templates/<dir>/`（24 套内置模板，`template.json` + `styles.css`） |

> 已同步到：统一 HTML 联系方式分组、富文本 Markdown（md/mdInline）、板块顺序可调、per-resume custom_css（含字体/四级字号/头部布局覆盖）、组件级分页。

## 关键约束（务必先读）

### 1. 两文件结构与文件名

ZIP 包根目录必须恰好包含两个文件，文件名**精确**为 `template.json` 和 `styles.css`。

- 不允许子目录、不允许携带 `template.html`（见下方⚠️）
- 单文件 ≤ 2MB；整包解压后累计 ≤ 10MB
- **包内文件条目数 ≤ 2**（`MaxTemplateEntries = 2`），目录条目被忽略
- 不允许路径穿越（`../`、绝对路径会被拒）
- 同名文件重复 → `duplicate <文件名> in template package`

> ⚠️ **历史包里的 `template.html` 现在会被拒绝**：源码虽保留「宽松忽略 HTML」的注释，但条目计数发生在分支判断之前，含第三个文件就会报 `template package has too many files`。生成新模板时绝不打包 HTML；遇到旧包要先删掉 HTML 再重新打包。

### 2. 统一 HTML 的 DOM 契约（最重要！）

模板制作者**不写 HTML**，但必须知道统一 HTML 会渲染出什么结构，才能写对 CSS 选择器：

```
<body>                                    ← 中性，不承载页面样式
  <div class="resume-page">               ← 单页单元（A4 + 页边距 + 背景）
    <div class="resume-container">        ← 内容包裹层（分页算法据此拆分）
      <header class="r-header">           ← 个人信息区（单栏=顶部块；双栏=侧栏）
        ├─ .r-header-text                ← 姓名/英文名/职位/年限
        │    └─ .r-name(h1) / .r-ename / .r-jobtitle / .r-yoe
        ├─ .r-avatar > img               ← 仅简历含头像数据时渲染
        ├─ .r-contact                   ← 联系方式
        │    ├─ .r-subtitle             ← 小节标题
        │    └─ .r-contact-group × 3    ← 语义分组（data-group，见第 9 节）
        │         └─ .r-contact-item
        │              └─ .r-contact-label + .r-contact-value
        └─ .r-langs                     ← 仅含语言数据时渲染
             └─ .r-subtitle + .r-lang
      <main class="r-main">              ← 章节区（.section-title 与条目为扁平兄弟）
        ├─ .section-title                ← 各板块标题
        ├─ .experience-item              ← 实习/工作/项目条目
        │    ├─ .exp-header（.company / .title / .date）
        │    ├─ .exp-location            ← 仅实习/工作
        │    ├─ .exp-summary             ← 富文本（md，可含 <p>/<ul>/<ol>）
        │    ├─ .highlights > li         ← 富文本行内（mdInline）
        │    └─ .extra-row（.extra-label + .extra-value）← 仅项目
        ├─ .education-item               ← .edu-header（.edu-school/.date）+ .edu-detail + .edu-courses + .highlights
        ├─ .award-item                  ← .award-header（.award-title/.date）+ .award-issuer + .exp-summary
        ├─ .skills-grid                  ← .skill-category > h4 + .skill-item（.skill-dots > .skill-dot/.skill-dot.filled）
        ├─ .summary                     ← 富文本（md）
        └─ .custom-item                  ← h4 + .subtitle + .exp-summary + .highlights
      </main>
    </div>
  </div>
</body>
```

**完整类名清单**（模板 CSS 必须对齐，不可自造类名）：

| 区域 | 类名 |
|------|------|
| 页面/容器 | `.resume-page`、`.resume-container` |
| 头部 | `.r-header`、`.r-header-text`、`.r-avatar`、`.r-name`、`.r-ename`、`.r-jobtitle`、`.r-yoe` |
| 联系方式/语言 | `.r-contact`、`.r-contact-group`、`.r-contact-item`、`.r-contact-label`、`.r-contact-value`、`.r-langs`、`.r-lang`、`.r-subtitle` |
| 章节标题 | `.section-title` |
| 经历条目 | `.experience-item`、`.exp-header`、`.company`、`.title`、`.date`、`.exp-location`、`.exp-summary`、`.highlights` |
| 教育条目 | `.education-item`、`.edu-header`、`.edu-school`、`.edu-detail`、`.edu-courses` |
| 技能 | `.skills-grid`、`.skill-category`、`.skill-item`、`.skill-dots`、`.skill-dot`、`.skill-dot.filled` |
| 奖项 | `.award-item`、`.award-header`、`.award-title`、`.award-issuer` |
| 自定义 | `.custom-item`、`.subtitle` |
| 项目扩展 | `.extra-row`、`.extra-label`、`.extra-value` |
| 总结 | `.summary` |
| 工具类 | `.page-break` |

**数据属性**（统一 HTML 输出，供分页/点击跳转使用，模板 CSS 不要依赖它们做布局）：条目带 `data-id` + `data-section`，板块标题带 `data-section`。

### 3. 单栏 / 双栏完全由 CSS 决定

分页核心按 `.resume-container` 的 computed `display` 区分单/双栏：

- **单栏**：`display: block;`，`.r-header` 是顶部块，`.r-main` 是下方章节
- **双栏**：`display: grid;`，`.r-header` 即侧栏（左/右皆可，通高）：

```css
.resume-container {
    display: grid;
    grid-template-columns: 62mm 1fr;
    grid-template-areas: "header main";
    grid-template-rows: 1fr;
    min-height: 297mm;                /* 让侧栏背景通高整页 */
}
.r-header { grid-area: header; }
.r-main   { grid-area: main; }
```

> ⚠️ 双栏侧栏在续页会被分页核心重复渲染为空壳，模板 CSS 要保证「侧栏只剩背景、无内容」时依然成立。

### 4. 头像位置由 CSS 决定

统一 HTML 仅在简历含头像数据时渲染 `.r-avatar`，**位置完全由 CSS 决定**；`features.avatar` 只是元数据，不参与渲染/显隐。

单栏 `.r-header` **必须** `display: grid` + `grid-template-areas` 排布四子块（不得仅靠 `text-align: center` 等隐式流式代替），三选一：

- 右置：`grid-template-columns: 1fr auto; grid-template-areas: "text avatar" "contact avatar" "langs avatar";`
- 居中：`grid-template-columns: 1fr; grid-template-areas: "avatar" "text" "contact" "langs"; justify-items: center;`
- 左置：`grid-template-columns: auto 1fr; grid-template-areas: "avatar text" "avatar contact" "avatar langs";`

双栏则把四子块在侧栏内竖向排布，头像通常在最上。

> 运行时会注入 `!important` 覆盖来切换这三种布局（见第 10 节）。因此 `.r-header-text` / `.r-avatar` / `.r-contact` / `.r-langs` 四个 `grid-area` 必须写全，否则用户切换布局会错位。

### 5. 页边距必须通过 CSS 变量消费

```css
/* 单栏：页边距落在 .resume-page */
.resume-page { padding: var(--resume-padding, 14mm 18mm); }

/* 双栏：页边距落在侧栏与主栏 */
.r-header { padding: var(--resume-padding-y, 14mm) var(--resume-padding-x, 16mm); }
.r-main   { padding: var(--resume-padding-y, 14mm) var(--resume-padding-x, 16mm); }
```

| CSS 变量 | 注入内容 | 消费者 |
|----------|----------|--------|
| `--resume-padding` | `上下 左右` 简写 | 单栏 `.resume-page` |
| `--resume-padding-y` / `--resume-padding-x` | 纵向 / 横向分量 | 双栏 `.r-header` / `.r-main` |

> ⚠️ 单栏页边距**必须落在 `.resume-page` 的 padding 上**，不得落在 `.r-header`/`.r-main`，也不得用负 margin 做「全出血」头部——分页与导出管线只把 `.resume-page` 的 padding 当页边距消费/折叠，否则续页无顶边距、PNG 页间空白。需要全出血请退化为页面内色块。

### 6. 垂直间距方向：一律 margin-bottom

条目与条目内部细节行的节奏间距**一律 `margin-bottom`**，禁止 `margin-top`（运行时按内容间距档位注入 `margin-bottom !important` 覆盖，方向不一致会错乱）。仅两类例外：

- 装饰性元素（时间轴线、强调线、伪元素分隔符等非内容流组件）
- 文档流末尾的收尾组件（如 `.footer`，其后无兄弟元素）

### 7. 隐藏（Hidden）由数据层处理，模板不写守卫

统一 HTML **不写** `{{if not .Hidden}}` 守卫，隐藏由前端 `toGoShape` 在渲染前过滤条目；区块内全隐藏时 `{{if .Section}}` 使整个板块（含标题）不渲染。模板 CSS 不需要也不应该写任何隐藏逻辑。

### 8. 板块顺序可由用户调整，不要假设固定顺序

默认渲染顺序是 **教育 → 实习 → 工作 → 项目 → 奖项 → 技能 → 总结 → 自定义**，但编辑器允许用户在「板块顺序」里重排（数据 `resume.section_order`，渲染由 `reorderSectionsHtml` 落地），自定义模块可与内置板块任意穿插。

因此模板 CSS **不得依赖固定顺序**：禁用 `.r-main > :nth-child(n)`、`.section-title:first-child`、"第一个 section-title 特殊样式"之类的写法。每个板块标题样式应完全一致，靠类名而非位置命中。

### 9. 联系方式分组与富文本

**联系方式分组**：`.r-contact` 内的条目按语义包在 3 个 `.r-contact-group[data-group]` 里：`contact`=邮箱/手机/微信/QQ，`basic`=城市/籍贯/民族/生日/年龄/政治面貌/婚姻/入党时间/户口/现居/职称/自定义 Extras，`links`=网站/GitHub/LinkedIn。

- 全局 `templates/resume-global.css` 已提供 `.r-contact-group { display: contents; }` 兜底：双栏侧栏竖排模板**无需**改写，条目仍作为 `.r-contact` 的直接子项参与原有 flex/grid 排布
- **单栏横排模板应覆盖为连续 4 列栅格**（20 套内置单栏模板都这么做），写法见第 11 节
- 长值（网站/GitHub/LinkedIn）由 `contactFit.ts`（预览/导出/缩略图）+ 统一 HTML 尾部脚本（独立打开 HTML 时）自动设置 `grid-column: span 2/3/4`；模板只需让 `.r-contact-item` 支持跨列（`min-width: 0` + `overflow-wrap: anywhere`），**不要**给条目写死宽度或 `white-space: nowrap`

**富文本**：长文本字段在编辑器里是所见即所得富文本，底层存 Markdown 源码，统一 HTML 用 `{{md .Field}}`（块级：`.exp-summary`、`.summary`、`.award-item .exp-summary`、`.custom-item .exp-summary`）或 `{{mdInline .Field}}`（行内：`.highlights li`、`.extra-value`、`.custom-item h4`）渲染，输出已消毒。

- 这些容器里会出现 `<p>` / `<ul>` / `<ol>` / `<li>` / `<strong>` / `<em>` / `<a>` / `<br>`，模板 CSS 要保证容器是块级、能容纳块级子元素
- Markdown 列表的 marker 由 `resume-global.css` 全局收敛，模板**不要**再给 `.exp-summary ul` / `.summary ol` 写 `list-style` 或 `li::before`，避免双重圆点
- 模板建议使用全局 reset（`* { margin: 0; padding: 0; box-sizing: border-box; }`）收掉 `<p>` 自带 margin；若需间距，只用 `margin-bottom`

### 10. per-resume custom_css 运行时覆盖（模板必须配合）

用户的所有样式调整以**每份简历独立**的 `resume.custom_css` 承载，由前端 `buildCustomCss` 生成带哨兵段的 CSS，渲染时叠加在模板私有 CSS 之上（`<style id="resume-custom">`）。**空 custom_css = 模板原生外观，不注入任何覆盖**。这不再是全局配置。

模板要接入这些能力，必须满足：

| 能力 | 运行时覆盖 | 模板必须 |
|------|-----------|----------|
| 页边距 | `:root { --resume-padding-y/-x/--resume-padding }` | 经变量消费 padding（第 5 节） |
| 内容间距 | `.section-title`、`ITEM_SELECTORS`（条目类）、`DETAIL_SELECTORS`（细节类）的 `margin-bottom !important`；模块间距 `*:has(+ .section-title)` / `* + .section-title` | 沿用标准类名、节奏用 `margin-bottom`（第 6 节） |
| 头像尺寸/圆角 | `.r-avatar img { width/height/border-radius !important }` | `.r-avatar img` 显式设宽高 + `object-fit: cover`，且不带 `!important` |
| 信息区布局 | `center` / `avatar-left` / `avatar-right` 三预设，对 `.r-header`、四子块注入 `!important` | 四子块 `grid-area` 写全；`center` 时 `.r-contact` 需 `width: 100%; text-align: left`（满宽 4 列才严格等分）；`avatar-left/right` 时 `.r-avatar` 需 `align-self: start` |
| 全局字体 | `:root { --font-family / --font-family-heading / --mono-font !important }` | **所有字体都经这三个变量消费**，不要硬编码字体栈；有专用标题/等宽字体时定义对应变量 |
| 四级字号 | `.r-name` / 标题组 / 正文组 / 细节组 `font-size !important` | 姓名、标题、正文、细节分别落到标准类名层级（见 `style-guide.md`），不要把字号写在自定义类上 |

> 头部布局覆盖仅对**单栏**模板生效；双栏模板的侧栏布局由模板自己决定，不应依赖该覆盖。

### 11. 联系方式 4 列栅格（单栏模板推荐写法）

```css
.r-contact {
    grid-area: contact;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 3pt 6pt;
    width: 100%;
    text-align: left;          /* 覆盖 .r-header 的居中继承 */
    font-size: 9.5pt;
}
.r-contact-group { display: contents; }   /* 三组条目连续填充、无组间断行 */
.r-contact-item {
    display: flex;
    align-items: baseline;
    gap: 3pt;                  /* 标签不定宽，间距统一 */
    min-width: 0;
    overflow-wrap: anywhere;   /* 跨满列仍放不下时的兜底 */
}
.r-contact-label { font-weight: 600; }
```

组内标签**不定宽**（定宽成列与间距统一数学互斥，项目已选定间距统一）。头像居中模板务必写 `width: 100%; text-align: left`，否则 `.r-header` 的 `justify-items: center` 会把栅格收缩、条目起点参差，且自适应跨列的测量基准失效。

### 12. 分页契约：CSS 必须耐受克隆

分页核心（`paginationCore.ts`）做组件级 + 行级分页：放不下的条目会拆成「头部部分克隆（保留 `data-id`，留当前页）」+「续接部分克隆（改打 `data-cont-of`，位于续页）」。两类克隆**均复用原条目类名与 `data-section`**，模板 CSS 自动生效，无需感知拆分。

- 仅 5 类「语义整体」在引擎内登记为不可拆：`.section-title`、`.exp-header`、`.edu-header`、`.skill-item`、`.skill-dots`（`KEEP_WHOLE`）
- 模板 CSS **禁用** `:first-child` / `:last-child` / `:nth-child()` / `+` 相邻兄弟等随拆分变化的结构选择器（`*:has(+ .section-title)` 由运行时使用，模板别抢）
- 不要给条目设固定 `height` / `overflow: hidden`；续页克隆只有部分内容，固定高度会留白或截断
- 新增组件沿用统一 HTML 类名即自动接入分页，无需改引擎

### 13. 必填元数据字段与 A4

`validateMeta` 强制非空：`id`（匹配 `^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$`，内置模板统一用 UUID v4）、`name`、`version`、`author.name`、`paper_size`（必须字符串 `"A4"`，其他值直接报 `only A4 templates are currently supported`）。

`uses_unified_html` 建议 `true`；其余字段（`category`、`tags`、`page_count`、`orientations`、`target_language` 等）为空会由 `normalizeMeta` 补默认值，但建议填全。`sections.layout` 只影响**前端编辑器**的展示顺序，不影响渲染顺序（见第 8 节）。

> 注意：`templates/AGENTS.md` 里 `paper_size` 写着 "A4 / Letter"，但**导入校验以源码为准，目前只接受 A4**。

## 工作流程

### 步骤 1：判断输入类型并明确需求

**情况 A：用户提供了参考素材（图片/PDF/HTML）**

1. 读取素材：图片用视觉分析；PDF 用 `pdf` skill 提取布局；HTML 用 `read_file` 分析结构样式
2. 读 `references/reference-extraction.md`，提取布局、配色（5 个 HEX）、字体感觉、章节标题样式、经历条目布局、头像处理、技能展示
3. **向用户复述理解并确认**后再动手

关键原则：参考素材只是风格参考，最终模板必须对齐统一 HTML 的 DOM 契约；只复刻**结构与样式**，不搬运具体简历内容。

**情况 B：用户只描述需求**

询问：风格定位（tech/business/creative/academic/general）、配色倾向、单栏/双栏、目标人群、必备特性（头像/技能点/双语）、模板命名。

共通确认项：模板 id、中英文名、作者信息。

### 步骤 2：读取参考资源

| 文件 | 何时读 |
|------|--------|
| `references/data-model.md` | 写 CSS 前——DOM 契约、字段、板块顺序、分页属性 |
| `references/style-guide.md` | 写 CSS 前——命名、必选元素、单/双栏、变量与运行时契约 |
| `references/validation-rules.md` | 导入失败或不确定写法是否合法时 |
| `references/builtin-functions.md` | 了解统一 HTML 内置函数对类名/输出结构的影响 |
| `references/reference-extraction.md` | 有参考素材时 |
| `assets/starter/` | 需要可运行的单栏起手模板时（只有两个文件） |

也可直接参照 `templates/<dir>/` 里的 24 套内置模板：4 套双栏侧栏 + 20 套单栏，覆盖各种风格。

### 步骤 3：创建模板文件

在用户指定目录下创建 `<template-id>/`，内含 `template.json` + `styles.css` 两个文件。

**template.json**：参照 `assets/starter/template.json` 或任一内置模板。要点：`id` 用 UUID v4、`name`/`name_en`、`version`、`category`、`colors`（5 个 6 位 HEX，与 CSS 变量一致）、`features`、`uses_unified_html: true`、`paper_size: "A4"`、`sections`（required/optional/layout）、`tags` 至少 3 个。

**styles.css** 要点：

- `.resume-page` 设 `width: 210mm; min-height: 297mm;`
- 单/双栏由 `.resume-container` 的 `display` 决定（第 3 节）；单栏 `.r-header` 四子块 `grid-area` 写全
- 页边距经 `var(--resume-padding[-y/-x], fallback)` 消费（第 5 节）
- 节奏间距一律 `margin-bottom`（第 6 节）
- 字体**经变量消费**：`:root` 定义 `--font-family` / `--font-family-heading` / `--mono-font`，所有 `font-family` 用 `var(...)`
- 联系方式按第 11 节写栅格（双栏侧栏可省略，靠全局兜底）
- `.summary` 加 `overflow-wrap: break-word; word-break: break-word;`
- `.r-avatar img` 显式宽高 + `object-fit: cover`
- 必须包含 `@media print` + `@page { size: A4; margin: 0; }`、`.page-break`
- 若启用技能等级点，定义 `.skill-dot` / `.skill-dot.filled`
- 字号用 `pt`、间距用 `mm`/`pt`，避免 `px`；颜色用 6 位 HEX
- 不要写 Markdown 列表样式、不要写旧类名、不要引用外部资源

### 步骤 4：自检

- [ ] `template.json`：`id` 合法（UUID v4）、`paper_size: "A4"`、`uses_unified_html: true`、`name`/`version`/`author.name` 非空、5 色齐全
- [ ] 包内**只有** `template.json` + `styles.css`，没有 `template.html`、没有子目录
- [ ] CSS 选择器全部对齐统一 HTML 类名，含 `.r-contact-group`（或明确走双栏兜底），无自造类名
- [ ] 单栏 `.resume-container` 是 `block`、双栏是 `grid`；`.r-header` 四子块 `grid-area` 写全
- [ ] 页边距经变量消费；节奏间距只用 `margin-bottom`；字体经变量消费
- [ ] `.summary` 换行规则、`.r-avatar img` 宽高、`.skill-dot`、`.page-break`、`@page`、A4 尺寸齐全
- [ ] 无 `:first-child`/`:nth-child()` 依赖顺序的选择器、无固定条目高度
- [ ] **跑一遍校验器**：`node <skill-dir>/assets/scripts/validate-template.cjs <模板目录>`

### 步骤 5：打包为 .zip

用 `assets/scripts/package-template.ps1`（Windows）或 `package-template.sh`（Unix）。两个脚本都先调用共享校验器 `validate-template.cjs`（唯一校验实现），再按 `template.json` 的 `name` 生成 `<name>.zip`，最后回读 zip 确认根目录恰好两个文件。

```powershell
& "<skill-dir>/assets/scripts/package-template.ps1" -TemplateDir "<模板目录>" -OutputDir "<输出目录>" [-Strict]
```

```bash
bash <skill-dir>/assets/scripts/package-template.sh <模板目录> <输出目录> [--strict]
```

只校验、不打包（`-Strict` / `--strict` 会把渲染契约警告也视为失败）：

```bash
node <skill-dir>/assets/scripts/validate-template.cjs <模板目录> [--strict]
```

> Windows 脚本带 UTF-8 BOM（兼容 PowerShell 5.1），中文模板名通过校验器的 `--print-name-b64` 以 base64 传递，避免控制台 ANSI 代码页把文件名写乱。

没有脚本环境时手工打包（确保两文件在 zip 根目录）：

```powershell
Compress-Archive -Path template.json,styles.css -DestinationPath "<name>.zip" -Force
```

### 步骤 6：交付

告诉用户：① `.zip` 路径；② 在 Gosume「导入模板」选择该文件；③ 新建简历时选用；④ 建议在编辑器里逐项验证——切换页边距/内容间距/字体/四级字号/信息区布局三预设、填入长联系方式与多行富文本、导出 PDF 看分页。

## 常见错误与修复

| 错误信息 | 原因 | 修复 |
|----------|------|------|
| `template id must be 2-64 characters...` | id 格式不对 | UUID v4 或 kebab-case |
| `only A4 templates are currently supported` | paper_size 不是 A4 | 改 `"A4"` |
| `template name/version/author name is required` | 必填元数据空 | 补齐 |
| `styles.css is empty` | CSS 空 | 补样式 |
| `missing required file: ...` | 文件名错或不在 zip 根目录 | 两文件放根目录、文件名精确 |
| `template package has too many files` | 包内文件条目 > 2（常见于旧包里的 `template.html`） | 删掉多余文件重新打包 |
| `template package is too large` / `is too large` | 超 10MB / 单文件超 2MB | 精简 CSS |
| `unsafe path in template package` | 路径穿越 | 文件放根目录 |
| `duplicate ... in template package` | 同名文件重复 | 只保留一份 |
| 导入成功但排版错乱 | CSS 类名与统一 HTML 契约不符 | 对照第 2 节类名清单 |
| 调页边距/字号/字体没反应 | 硬编码 padding 或字体栈 | 改用 `var(--resume-padding*)` / `var(--font-family*)` |
| 联系方式串行/值内换行 | 未适配 `.r-contact-group` 栅格 | 按第 11 节重写 |
| 富文本里出现双圆点/段落错位 | 模板重复定义了 Markdown 列表样式 | 删掉，交给 `resume-global.css` |
| 续页条目样式丢失 | 用了 `:first-child` 等结构选择器 | 改为纯类名选择器 |

## 设计建议

- 对比与层次：标题/正文有明显字号字重对比；章节标题用 `text-transform: uppercase; letter-spacing`
- 留白：板块间距 12–16pt，行高 1.5–1.7
- 色彩克制：主色用于标题和强调，正文保持深灰；背景白或极浅灰，正文对比度 ≥ 4.5:1
- 日期右对齐：`.exp-header` 用 `display: flex; justify-content: space-between`
- 头像：单栏 60–80pt、双栏侧栏 64–90pt，圆形/方形自选
- 双栏注意总宽度不超 A4 可用宽度，侧栏宽度建议 55–65mm

## 禁止事项

- 不得在模板包中携带 `template.html` 或任何第三个文件（会被条目上限拒绝）
- 不得引用外部资源（CDN 字体、外部图片、web font）、不得用 `@import`
- 不得依赖统一 HTML 之外的类名/结构（旧版 `.sidebar`、`.header-left`、`.contact-info`、`.school`、`.skill-list` 等）
- 不得硬编码页边距 padding 或字体栈（必须经变量消费）
- 不得用 `margin-top` 表达条目/细节行的节奏间距
- 不得用非 `pt`/`mm` 单位作为核心字号和间距（`px` 仅限细微调整）
- 不得重复定义 `.exp-summary/.summary/.extra-value` 内 Markdown 列表的 `list-style` / `li::before`
- 不得用 `:first-child` / `:nth-child()` / 相邻兄弟选择器或固定条目高度（分页克隆会破坏结构）
- 不得假设板块固定顺序、不得为「第一个板块标题」写特殊样式
- 不得修改其他模板的文件
