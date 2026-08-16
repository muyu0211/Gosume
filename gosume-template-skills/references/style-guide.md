# 样式规范

本文档定义 `styles.css` 的编写规范和命名约定。Gosume 一期改造后，简历 HTML 由应用内置的统一 HTML（`templates/template.html`）承载，模板 CSS 必须**针对统一 HTML 的固定 DOM 契约**写样式。

## 统一 HTML 的 DOM 契约

模板 CSS 的所有选择器都必须对齐下面这套固定结构（不可自造类名）：

```
.resume-page                      ← 单页单元（A4 尺寸 + 页边距 + 背景）
  └─ .resume-container            ← 内容包裹层（分页算法据此拆分）
       ├─ .r-header              ← 个人信息区（单栏=顶部块；双栏=侧栏）
       │    ├─ .r-avatar（img）
       │    ├─ .r-header-text > .r-name（h1）/ .r-ename / .r-jobtitle / .r-yoe
       │    ├─ .r-contact > .r-subtitle + .r-contact-item（.r-contact-label + .r-contact-value）
       │    └─ .r-langs > .r-subtitle + .r-lang
       └─ .r-main                ← 章节区（.section-title 与条目为扁平兄弟）
            ├─ .section-title
            ├─ .experience-item（工作/实习/项目）
            │    ├─ .exp-header > .company / .title / .date
            │    ├─ .exp-location（仅工作/实习）
            │    ├─ .exp-summary
            │    ├─ .highlights > li
            │    └─ .extra-row > .extra-label + .extra-value（仅项目）
            ├─ .education-item > .edu-header（.edu-school + .date）+ .edu-detail + .edu-courses + .highlights
            ├─ .award-item > .award-header（.award-title + .date）+ .award-issuer + .exp-summary
            ├─ .skills-grid > .skill-category > h4 + .skill-item（.skill-dots > .skill-dot / .skill-dot.filled）
            ├─ .summary
            └─ .custom-item > h4 + .subtitle + .exp-summary + .highlights
```

## 必选样式元素

### 1. A4 页面尺寸与页边距变量

```css
/* 单栏模板：.resume-page 直接消费页边距变量 */
.resume-page {
    width: 210mm;
    min-height: 297mm;
    padding: var(--resume-padding, 14mm 18mm);
    background: #fff;
}
```

- 宽度 210mm、最小高度 297mm（A4）
- **padding 必须通过 `var(--resume-padding, 默认值)` 消费**：应用运行时按用户的"页边距档位"（紧凑/较窄/标准/较宽/宽松）注入该变量，fallback 值是模板自己的默认边距。硬编码 padding 会导致用户的页边距调整在此模板上失效
- 背景白色

**双栏模板**：页边距落在 `.r-header`（侧栏）和 `.r-main`（主栏）的 padding 上，`.resume-page` 本身不设 padding：

```css
.resume-page { width: 210mm; min-height: 297mm; }
.r-header { padding: var(--resume-padding-y, 14mm) var(--resume-padding-x, 12mm); }
.r-main   { padding: var(--resume-padding-y, 14mm) var(--resume-padding-x, 16mm); }
```

| CSS 变量 | 注入内容 | 消费者 |
|----------|----------|--------|
| `--resume-padding` | 完整 `上下 左右` 简写 | 单栏模板的 `.resume-page` |
| `--resume-padding-y` / `--resume-padding-x` | 纵向 / 横向分量 | 双栏模板的 `.r-header` / `.r-main` |

> ⚠️ 单栏模板的页边距**必须落在 `.resume-page` 的 padding 上，不得落在 `.r-header`/`.r-main` 等内容区自身的 padding 上**（分页与导出管线只把 `.resume-page` 的 padding 当"页边距"消费/折叠）。需要"全出血"头部时也不得用负 margin 把头部拉出页面，应退化为页面内的一块色块。

### 2. 垂直间距方向（margin-bottom 规范）

模块内条目与条目内部细节行的**节奏间距一律使用 `margin-bottom`**，禁止用 `margin-top` 表达垂直节奏：

- 应用按用户的"内容间距档位"注入 `margin-bottom !important` 覆盖规则，方向不一致的模板在档位调整时行为错乱
- 仅两类例外允许 `margin-top`：装饰性元素（时间轴线、强调线、伪元素分隔符）、文档流末尾的收尾组件（如 `.footer`）

正确示例：

```css
.experience-item { margin-bottom: 12pt; }   /* ✓ 条目间距 */
.exp-header      { margin-bottom: 3pt; }    /* ✓ 细节间距 */
.edu-detail      { margin-bottom: 2pt; }    /* ✓ 细节间距 */
.extra-row       { margin-bottom: 3pt; }    /* ✓ 细节间距 */
```

### 3. 内容间距档位的自动接入

用户可在应用中调整"内容间距"档位，运行时对以下三层选择器注入 `margin-bottom !important` 覆盖。**模板只要沿用标准类名，即自动参与间距调整**：

| 层级 | 覆盖选择器 |
|------|-----------|
| 模块 ↔ 模块 | `* + .section-title`（margin-top） |
| 条目 ↔ 条目 | `.experience-item` `.education-item` `.award-item` `.custom-item` `.skill-category` `.skill-item` `.sidebar-item`，以及 `.section-title` 自身的 margin-bottom |
| 细节 ↔ 细节 | `.exp-header` `.exp-location` `.exp-summary` `.highlights li` `.edu-detail` `.edu-courses` `.extra-row` |

- "标准"档不注入任何规则，保留模板原生节奏
- 使用非标准类名的组件不参与档位调整

### 4. 个人总结的换行处理

`.summary` 必须包含长词换行规则：

```css
.summary {
    overflow-wrap: break-word;
    word-break: break-word;
}
```

### 5. CSS 变量定义

在 `:root` 中定义模板主色调和字体变量，**颜色变量必须与 `template.json` 的 `colors` 字段一致**：

```css
:root {
    --font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
    --font-size-base: 10pt;
    --line-height: 1.6;
    --primary-color: #1F2937;
    --heading-color: #111827;
    --text-color: #1F2937;
    --muted-color: #6B7280;
    --border-color: #E5E7EB;
    --accent-bg: #F9FAFB;
}
```

| CSS 变量 | 对应 JSON 字段 |
|----------|----------------|
| `--primary-color` | `colors.primary` |
| `--accent-bg` | `colors.accent` |
| `--text-color` | `colors.text` |

### 6. 打印样式

```css
@media print {
    .resume-page { width: 100%; margin: 0; padding: var(--resume-padding, 14mm 18mm); }
    @page { size: A4; margin: 0; }
}
```

### 7. 分页控制

```css
.page-break {
    page-break-after: always;
    break-after: page;
}
```

### 8. 技能等级点（若启用技能点）

```css
.skill-dot {
    display: inline-block;
    width: 6pt; height: 6pt;
    border-radius: 50%;
    background: #D1D5DB;
    margin: 0 0.5pt;
    vertical-align: middle;
}
.skill-dot.filled { background: var(--primary-color); }
```

`skillLevel` 函数（统一 HTML 内置）输出的 HTML 依赖这两个类：输出 5 个 `<span>`，前 N 个是 `.skill-dot.filled`，其余是 `.skill-dot`。

### 9. 头像尺寸必须固定（若启用头像）

`.r-avatar img` 必须显式设置宽高，禁止依赖图片原始尺寸：

```css
.r-avatar img {
    width: 72pt;        /* 单栏常为矩形 60–80pt；双栏侧栏常为 64–90pt */
    height: 72pt;       /* 单栏常为矩形 60–80pt；双栏侧栏常为 64–90pt */
    object-fit: cover;  /* 裁剪填充，避免拉伸变形 */
    border-radius: 50%; /* 圆形头像可选 */
}
```

- 必须同时写 `width` + `height` + `object-fit`，否则用户导入任意尺寸头像时会渲染为图片默认大小，体验差。
- 单栏头像通常 60–80pt（矩形或圆形）；双栏侧栏头像 64–90pt（可选为圆形 `border-radius: 50%`）。

## 命名约定

模板 CSS 必须沿用统一 HTML 的固定类名，推荐 BEM-like 风格组织，保持模板间一致性。

| 层级 | 类名 |
|------|------|
| 页面容器 | `.resume-page`、`.resume-container` |
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

> 注意类名变化：旧单套 HTML 时代的 `.header`/`.header-avatar`/`.header-main`/`.contact-line`/`.english-name`/`.job-title`/`.school`/`.skill-list`/`.inline-list`/`.custom-subtitle` 等类名**已废弃**，统一 HTML 分别改为 `.r-header`/`.r-avatar`/`.r-header-text`/`.r-contact`/`.r-ename`/`.r-jobtitle`/`.edu-school`/`.skill-dots`/`.r-langs`/`.subtitle`。不得再使用旧类名。

## 单位规范

| 用途 | 单位 | 说明 |
|------|------|------|
| 字号 | `pt` | 打印友好，10-12pt 为正文常规 |
| 间距 | `mm` 或 `pt` | 打印友好 |
| 细微调整 | `pt` | 如 `0.5pt`、`1pt` |
| 尺寸（头像、图标） | `pt` | 如 `64pt x 80pt` |

**避免用 `px`** 作为主要单位。`px` 是屏幕单位，打印时换算不稳定，仅在极细微调整（如 1px 边框）时可用。

## 字体栈

**必须使用系统字体**，不得引用外部字体（CDN、web font）。推荐：

```css
/* 中文优先 */
--font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
/* 衬线（正式风格） */
--font-family: 'Noto Serif SC', 'SimSun', 'PingFang SC', serif;
/* 等宽（极客风格） */
--font-family: 'JetBrains Mono', 'Consolas', 'Microsoft YaHei', monospace;
```

## 颜色规范

- 所有颜色用 6 位 HEX（`#RRGGBB`），不用 3 位缩写、rgb()、hsl()
- 正文颜色保持深灰（`#1F2937`、`#334155`）保证可读性
- 主色用于标题、强调，避免大面积使用
- 背景保持白色或极浅灰
- 确保文字与背景对比度达标（WCAG AA：正文 ≥ 4.5:1）

## 布局模式

### 单栏布局（默认）

`.resume-container { display: block; }`，`.r-header` 是顶部块，`.r-main` 是下方章节。`.r-header` **必须**用 `grid-template-areas` 显式排布头像/姓名/联系方式/语言——这是模板的固定约束，无论有无头像都不得省略（不得仅靠 `text-align: center` 等隐式流式方式代替）。⚠️ `grid-template-areas` 只有配合 `display: grid` 才生效，二者必须同时出现。头像位置三选一：

```css
/* 头像右置 */
.r-header { display: grid; grid-template-columns: 1fr auto; grid-template-areas: "text avatar" "contact avatar" "langs avatar"; }
.r-header-text { grid-area: text; }
.r-avatar { grid-area: avatar; }
.r-contact { grid-area: contact; }
.r-langs { grid-area: langs; }
```

- 头像居中：单列 `display: grid; grid-template-columns: 1fr; grid-template-areas: "avatar" "text" "contact" "langs"; justify-items: center; text-align: center;`
- 头像左置：与右置对称 `display: grid; grid-template-columns: auto 1fr; grid-template-areas: "avatar text" "avatar contact" "avatar langs";`

### 双栏布局（侧边栏）

`.resume-container` 用 grid，`.r-header` 是侧栏（通高），`.r-main` 是主栏：

```css
.resume-container {
    display: grid;
    grid-template-columns: 62mm 1fr;
    grid-template-areas: "header main";
    grid-template-rows: 1fr;
    min-height: 297mm;    /* 让侧栏背景通高整页 */
}
.r-header { grid-area: header; }
.r-main   { grid-area: main; }
```

侧栏（`.r-header`）放头像、姓名、联系方式、语言；主体（`.r-main`）放工作经历、项目、教育、奖项、技能。注意双栏打印时内容不溢出 A4 宽度。

## 常见样式问题

| 问题 | 原因 | 修复 |
|------|------|------|
| 打印时内容被截断 | 缺 `@page { size: A4; margin: 0; }` | 添加打印样式 |
| 字体显示不一致 | 用了外部字体 | 改用系统字体栈 |
| 技能点不显示 | 缺 `.skill-dot` / `.skill-dot.filled` | 添加技能点 CSS |
| 颜色与元数据不符 | CSS 变量与 template.json colors 不一致 | 对齐两者 |
| 双栏溢出 | 总宽度超过 A4 可用宽度 | 减小 gap 或侧栏宽度 |
| 用户调页边距无效果 | padding 硬编码，未消费 `--resume-padding` 变量 | 改为 `var(--resume-padding, 默认值)` |
| 调内容间距时间距叠加/错乱 | 条目/细节间距用了 `margin-top` | 改为 `margin-bottom` |
| 长英文串/URL 撑破版面 | `.summary` 缺换行规则 | 加 `overflow-wrap: break-word; word-break: break-word;` |
| 元素样式不生效 | 用了旧类名（如 `.school`/`.skill-list`） | 改用统一 HTML 类名（`.edu-school`/`.skill-dots`） |
