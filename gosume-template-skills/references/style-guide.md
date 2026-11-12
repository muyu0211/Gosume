# 样式规范

本文档定义 `styles.css` 的编写规范与命名约定。模板 CSS 必须**针对统一 HTML（`templates/template.html`）的固定 DOM 契约**写样式。

> 权威源：`templates/resume-global.css`（全局静态样式 + 选择器契约注释）、`frontend/src/lib/customCss.ts`（per-resume 运行时覆盖）、`frontend/src/lib/paginationCore.ts`（分页）、`templates/*/styles.css`（24 套范例）。

## 1. DOM 契约（选择器必须对齐）

```
.resume-page                      ← 单页单元（A4 + 页边距 + 背景）
  └─ .resume-container            ← 内容包裹层（display 决定单/双栏）
       ├─ .r-header               ← 个人信息区（单栏=顶部块；双栏=侧栏）
       │    ├─ .r-header-text > .r-name(h1) / .r-ename / .r-jobtitle / .r-yoe
       │    ├─ .r-avatar > img
       │    ├─ .r-contact > .r-subtitle + .r-contact-group × 3
       │    │                └─ .r-contact-item > .r-contact-label + .r-contact-value
       │    └─ .r-langs > .r-subtitle + .r-lang
       └─ .r-main                 ← 章节区（.section-title 与条目为扁平兄弟）
            ├─ .section-title
            ├─ .experience-item > .exp-header（.company/.title/.date）
            │                  + .exp-location + .exp-summary + .highlights > li
            │                  + .extra-row（.extra-label + .extra-value，仅项目）
            ├─ .education-item > .edu-header（.edu-school + .date）+ .edu-detail + .edu-courses + .highlights
            ├─ .award-item > .award-header（.award-title + .date）+ .award-issuer + .exp-summary
            ├─ .skills-grid > .skill-category > h4 + .skill-item（.skill-dots > .skill-dot/.skill-dot.filled）
            ├─ .summary
            └─ .custom-item > h4 + .subtitle + .exp-summary + .highlights
```

条目节点还带 `data-id` / `data-section`，板块标题带 `data-section`——供分页与点击跳转使用，**模板 CSS 不要拿它们做选择器**。

> 旧单套 HTML 时代的 `.header` / `.header-avatar` / `.header-left` / `.contact-info` / `.english-name` / `.job-title` / `.school` / `.skill-list` / `.inline-list` / `.custom-subtitle` 等类名**已废弃**，统一 HTML 分别改为 `.r-header` / `.r-avatar` / `.r-contact` / `.r-ename` / `.r-jobtitle` / `.edu-school` / `.skill-dots` / `.r-langs` / `.subtitle`。不得再使用旧类名。

## 2. A4 页面尺寸与页边距变量

```css
/* 单栏 */
.resume-page {
    width: 210mm;
    min-height: 297mm;
    padding: var(--resume-padding, 14mm 18mm);
    background: #FFFFFF;
}

/* 双栏：.resume-page 无 padding，边距落在两栏 */
.resume-page { width: 210mm; min-height: 297mm; }
.r-header { padding: var(--resume-padding-y, 14mm) var(--resume-padding-x, 12mm); }
.r-main   { padding: var(--resume-padding-y, 14mm) var(--resume-padding-x, 16mm); }
```

| CSS 变量 | 注入内容 | 消费者 |
|----------|----------|--------|
| `--resume-padding` | 完整 `上下 左右` 简写 | 单栏 `.resume-page` |
| `--resume-padding-y` / `--resume-padding-x` | 纵 / 横分量 | 双栏 `.r-header` / `.r-main` |

> ⚠️ 单栏页边距**必须落在 `.resume-page`**，不得落在 `.r-header`/`.r-main`，也不得用负 margin 把头部拉出页面做「全出血」——分页与导出管线只把 `.resume-page` 的 padding 当页边距消费/折叠，否则续页无顶边距、PDF 生硬截断、PNG 页间空白。要全出血请退化为页面内色块。

变量来自 **per-resume `custom_css`**（见第 4 节）：用户调整页边距时，前端 `buildCustomCss` 注入 `:root { --resume-padding-y: …; --resume-padding-x: …; --resume-padding: … }`；**未调整时完全不注入**，此时模板的 fallback 值生效。fallback 是模板自己的默认边距，必须写。

## 3. 垂直间距方向：一律 margin-bottom

模块内条目与条目内部细节行的**节奏间距一律 `margin-bottom`**，禁止用 `margin-top` 表达垂直节奏。运行时按内容间距档位注入 `margin-bottom !important` 覆盖规则，方向不一致会导致档位调整时行为错乱。

```css
.experience-item { margin-bottom: 12pt; }   /* ✓ 条目间距 */
.exp-header      { margin-bottom: 3pt; }    /* ✓ 细节间距 */
.edu-detail      { margin-bottom: 2pt; }    /* ✓ 细节间距 */
.extra-row       { margin-bottom: 3pt; }    /* ✓ 细节间距 */
```

仅两类例外允许 `margin-top`：装饰性元素（时间轴线、强调线、伪元素分隔符等非内容流组件）、文档流末尾的收尾组件（如 `.footer`，其后无兄弟元素）。

## 4. per-resume custom_css 运行时契约（模板必须配合）

用户的所有样式调整以**每份简历独立**的 `resume.custom_css` 承载（不再是全局配置），由 `frontend/src/lib/customCss.ts` 的 `buildCustomCss` 生成带哨兵段的 CSS，渲染时以 `<style id="resume-custom">` 叠加在模板 CSS 之上。**空 custom_css = 模板原生外观，不注入任何覆盖**。选择器契约由 `templates/resume-global.css` 注释维护。

| 能力 | 运行时注入的覆盖 | 模板必须满足 |
|------|------------------|--------------|
| 页边距 | `:root { --resume-padding-y/-x/--resume-padding }` | 经变量消费 padding（第 2 节） |
| 内容间距 | `ITEM_SELECTORS` / `DETAIL_SELECTORS` / `.section-title` 的 `margin-bottom !important`；模块间距 `*:has(+ .section-title) { margin-bottom: 0 }`、`* + .section-title { margin-top: … }` | 沿用标准类名、节奏只用 `margin-bottom`（第 3 节） |
| 头像尺寸/圆角 | `.r-avatar img { width/height/border-radius !important }` | `.r-avatar img` 显式宽高 + `object-fit`，且模板自身别写 `!important` |
| 信息区布局 | `center` / `avatar-left` / `avatar-right` 三预设，对 `.r-header` 与四子块注入 `!important` | 见第 6 节 |
| 全局字体 | `:root { --font-family / --font-family-heading / --mono-font !important }` | 见第 5 节 |
| 四级字号 | 姓名/标题/正文/细节四组 `font-size !important` | 见第 5 节 |

> 数值型 `!important` 规则**只在这些数值存在时**注入：若写成 `var(--sp-item)` 且变量未注入，按 CSS 规范会计算为属性初始值（`margin-bottom: 0`），导致缩略图与默认档位间距塌陷。所以模板**不要**自己定义这些变量名或提前声明覆盖。

**内容间距三层选择器契约**（数值由运行时注入，模板只要沿用类名即自动接入）：

| 层级 | 覆盖选择器 |
|------|-----------|
| 条目 ↔ 条目 | `.section-title`、`.experience-item`、`.education-item`、`.award-item`、`.custom-item`、`.skill-category`、`.skill-item`、`.sidebar-item` |
| 细节 ↔ 细节 | `.exp-header`、`.exp-location`、`.exp-summary`、`.highlights li`、`.edu-detail`、`.edu-courses`、`.extra-row` |
| 模块 ↔ 模块 | `*:has(+ .section-title)` 归零末尾条目间距 + `* + .section-title { margin-top }` |

模块末尾条目的 `margin-bottom` 会被归零，模块间距由 `* + .section-title` 单独控制，不会叠加。使用非标准类名的组件不参与档位调整。

## 5. 字体与字号：必须经变量 / 标准类名消费

### 字体变量

```css
:root {
    --font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
    --font-family-heading: var(--font-family);   /* 标题专用，可另设衬线 */
    --mono-font: 'JetBrains Mono', 'Consolas', monospace;  /* 等宽专用 */
    --primary-color: #1F2937;
    --heading-color: #111827;
    --text-color: #1F2937;
    --muted-color: #6B7280;
    --border-color: #E5E7EB;
    --accent-bg: #F9FAFB;
}
body { font-family: var(--font-family); }
```

**所有 `font-family` 声明都要用 `var(...)`**，不要硬编码字体栈：用户在设置里切换全局字体时，运行时只覆盖 `:root` 的 `--font-family` / `--font-family-heading` / `--mono-font` 三个变量，硬编码的地方不会跟着变。若模板有专用标题字体或等宽字体，务必定义并使用对应变量。

| CSS 变量 | 对应 JSON 字段 |
|----------|----------------|
| `--primary-color` | `colors.primary` |
| `--accent-bg` | `colors.accent` |
| `--text-color` | `colors.text` |

颜色用 6 位 HEX，正文与背景对比度 ≥ 4.5:1。

### 四级字号选择器组

运行时按用户设置覆盖四组 `font-size`，模板字号必须落在这四组标准类名层级上（不要把字号写在自定义类上，否则用户调字号无反应）：

| 级别 | 覆盖选择器 |
|------|-----------|
| 姓名 | `.r-name` |
| 标题 | `.section-title`、`.r-subtitle`、`.exp-header .company`、`.edu-school`、`.award-title`、`.custom-item h4`、`.skill-category h4` |
| 正文 | `body`、`.r-ename`、`.r-jobtitle`、`.r-yoe`、`.r-contact-label`、`.r-contact-value`、`.r-langs`、`.exp-header .title`、`.exp-summary`、`.highlights li`、`.skill-item` |
| 细节 | `.date`、`.exp-location`、`.edu-detail`、`.edu-courses`、`.subtitle`、`.extra-row`、`.award-issuer` |

字号单位用 `pt`（10–12pt 为正文常规），间距用 `mm`/`pt`，`px` 仅限 1px 边框这类极细微调整。

## 6. 信息区布局与头部三预设

单栏 `.r-header` **必须** `display: grid` + `grid-template-areas` 显式排布四子块（`grid-template-areas` 只有配合 `display: grid` 才生效），并且四个 `grid-area` 都要写全——运行时会用 `!important` 覆盖成 `center` / `avatar-left` / `avatar-right` 三种布局，缺任何一个子块都会错位：

```css
.r-header {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas: "text avatar" "contact avatar" "langs avatar";
    align-items: start;
}
.r-header-text { grid-area: text; }
.r-avatar      { grid-area: avatar; align-self: start; }
.r-contact     { grid-area: contact; }
.r-langs       { grid-area: langs; }
```

- `center`：`grid-template-columns: 1fr`、`"avatar" "text" "contact" "langs"`、`justify-items: center; text-align: center`。**模板必须给 `.r-contact` 写 `width: 100%; text-align: left`**，否则栅格被收缩、4 列不等宽、条目起点参差，且自适应跨列的测量基准失效
- `avatar-left` / `avatar-right`：头像跨 text/contact/langs 三行，`.r-header` 的 `align-items: center` 会让头像垂直居中下坠；**模板必须给 `.r-avatar` 写 `align-self: start`**，使头像上边框与姓名组件上边框同线
- 头部布局覆盖仅对**单栏**生效；双栏侧栏由模板自己决定，不要依赖该覆盖

## 7. 联系方式栅格（单栏模板）

统一 HTML 把联系方式条目按语义包进 3 个 `.r-contact-group[data-group]`（contact / basic / links）。全局 `resume-global.css` 有 `.r-contact-group { display: contents; }` 兜底，双栏侧栏竖排模板无需改写；**单栏横排模板应覆盖为连续无缝 4 列栅格**：

```css
.r-contact {
    grid-area: contact;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 3pt 6pt;
    width: 100%;
    text-align: left;
    font-size: 9.5pt;
}
.r-contact-group { display: contents; }   /* 三组条目连续填充，无组间断行 */
.r-contact-item {
    display: flex;
    align-items: baseline;
    gap: 3pt;                  /* 标签不定宽，统一标签-值间距 */
    min-width: 0;
    overflow-wrap: anywhere;   /* 跨满列仍放不下时兜底 */
}
.r-contact-label { font-weight: 600; }
```

- 组内标签**不定宽**：定宽成列与间距统一数学互斥，项目已选定间距统一
- 长值（网站/GitHub/LinkedIn）由 `contactFit.ts` + 统一 HTML 尾部脚本设 `grid-column: span 2/3/4`；模板**不要**给条目写死宽度或 `white-space: nowrap`
- 头像居中模板务必写 `width: 100%; text-align: left`（见第 6 节）

## 8. 富文本容器（Markdown）

`md` / `mdInline` 会在 `.exp-summary` / `.summary` / `.extra-value` / `.highlights li` 等容器内生成 `<p>` / `<ul>` / `<ol>` / `<li>` / `<strong>` / `<em>` / `<a>` / `<br>`。

- 容器必须是块级、能容纳块级子元素；用全局 reset 收掉 `<p>` / `<ul>` 自带 margin，需要间距只用 `margin-bottom`
- **Markdown 列表 marker 由 `templates/resume-global.css` 全局收敛**（含 `data-marker` 变体）；模板**不要**重复定义 `.exp-summary ul`、`.summary ol` 的 `list-style` 或 `li::before`，否则出现双圆点
- `.summary` 必须包含长词换行规则：`overflow-wrap: break-word; word-break: break-word;`
- 链接样式：导出的 PDF 中链接应有明显颜色区分（`a { color: var(--primary-color); text-decoration: none; }`）

## 9. 打印、分页与必选元素

```css
@media print {
    .resume-page { width: 100%; margin: 0; padding: var(--resume-padding, 14mm 18mm); }
    @page { size: A4; margin: 0; }
}
.page-break { page-break-after: always; break-after: page; }
```

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

```css
.r-avatar img {
    width: 72pt; height: 90pt;   /* 单栏 60–80pt；双栏侧栏 64–90pt */
    object-fit: cover;           /* 必须，避免拉伸变形 */
    border-radius: 4pt;          /* 或 50% 圆形 */
}
```

- `.skill-dot` / `.skill-dot.filled`：`skillLevel` 输出依赖，缺了等级点不显示
- `.page-break`：分页控制工具类
- `.r-avatar img`：必须同时写 `width` + `height` + `object-fit`，否则用户导入任意尺寸头像会渲染成图片默认大小

### 分页耐受（重要）

分页核心把放不下的条目拆成「头部部分克隆（保留 `data-id`）+ 续接部分克隆（`data-cont-of`）」，两类克隆复用原类名与 `data-section`。因此：

- **禁用** `:first-child` / `:last-child` / `:nth-child()` / `+` 相邻兄弟等随拆分变化的结构选择器
- 不要给条目设固定 `height` / `overflow: hidden`（续页克隆只有部分内容，会留白或截断）
- 5 类语义整体由引擎 `KEEP_WHOLE` 保证不拆：`.section-title`、`.exp-header`、`.edu-header`、`.skill-item`、`.skill-dots`
- 双栏侧栏在续页会被重复渲染为空壳，模板 CSS 要保证「侧栏只剩背景」时依然成立

## 10. 命名约定

| 层级 | 类名 |
|------|------|
| 页面容器 | `.resume-page`、`.resume-container` |
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

## 11. 布局模式

### 单栏（默认）

`.resume-container { display: block; }`，`.r-header` 顶部块 + 四子块 `grid-template-areas`（第 6 节）。

### 双栏（侧边栏）

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

侧栏放头像/姓名/联系方式/语言，主栏放各章节；侧栏宽建议 55–65mm，注意打印不溢出 A4 宽度。右侧栏把 columns 与 areas 反过来即可。分页核心按 `.resume-container` computed `display === grid` 判定双栏。

## 12. 常见样式问题

| 问题 | 原因 | 修复 |
|------|------|------|
| 打印内容被截断 | 缺 `@page { size: A4; margin: 0; }` | 补打印样式 |
| 字体显示不一致 / 用户换字体无效 | 硬编码字体栈或引用外部字体 | 改 `var(--font-family*)` + 系统字体 |
| 用户调字号无效 | 字号写在自定义类上 | 落到四级字号标准类名层级 |
| 技能点不显示 | 缺 `.skill-dot` / `.skill-dot.filled` | 补样式 |
| 颜色与元数据不符 | CSS 变量与 `colors` 不一致 | 对齐两者 |
| 双栏溢出 | 总宽超 A4 可用宽度 | 减小 gap 或侧栏宽度 |
| 调页边距无效 / 续页无顶边距 | padding 硬编码或落在内容区 | 改成 `.resume-page` 上的 `var(--resume-padding, …)` |
| 调内容间距时间距叠加 | 用了 `margin-top` | 改 `margin-bottom` |
| 联系方式分组间莫名断行 / 长链接换行 | 未适配 `.r-contact-group` 与 4 列栅格 | 按第 7 节重写 |
| 富文本出现双圆点 / 段落错位 | 重复定义 Markdown 列表样式 | 删掉，交给全局 CSS |
| 续页条目样式丢失或留白 | `:first-child` 等结构选择器 / 固定高度 | 改纯类名选择器、去掉固定高度 |
| 板块调序后标题样式错乱 | 依赖固定渲染顺序 | 所有标题用同一套类名样式 |
| 头像被垂直居中下坠 | 缺 `align-self: start` | 补上 |
| 元素样式不生效 | 用了旧类名（`.school` / `.skill-list`） | 改用统一 HTML 类名 |
