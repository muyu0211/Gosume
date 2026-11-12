# 统一 HTML 内置函数（模板作者须知）

简历 HTML 由应用内置的统一 HTML（`templates/template.html`）承载。以下函数由统一 HTML **内部使用**；模板作者**不写 HTML、不直接调用**，但需要了解它们对渲染输出的影响，尤其是对 CSS 类名与 DOM 结构的依赖。

> 权威源：`templates/template.html`、`frontend/src/lib/templateEngine.ts`、`frontend/src/lib/markdown.ts`。
> 注意：统一 HTML 头部的语法注释只列了 7 个函数，**未包含后加的 `md` / `mdInline`**；以本文与源码为准。

## 与模板 CSS 相关的关键副作用

### skillLevel → 依赖 `.skill-dot` / `.skill-dot.filled`

统一 HTML 用 `{{skillLevel .Level}}` 渲染技能等级，输出 5 个 `<span>`（前 `level` 个为 filled）：

```html
<div class="skill-dots">
  <span class="skill-dot filled"></span><span class="skill-dot filled"></span>
  <span class="skill-dot"></span><span class="skill-dot"></span><span class="skill-dot"></span>
</div>
```

- **模板 CSS 必须定义 `.skill-dot` 和 `.skill-dot.filled`**，否则等级点不显示
- `level` 为 0 时统一 HTML 不渲染 `.skill-dots`

### md / mdInline → 长文本输出富文本 HTML（重要）

长文本字段在编辑器中是所见即所得富文本，底层存 Markdown 源码。统一 HTML 用 `md`（block）/ `mdInline`（inline）渲染，输出已消毒的受限子集 Markdown：

| 函数 | 支持 | 落到容器内 |
|------|------|-----------|
| `md` | 段落、行内加粗/斜体/链接、无序/有序列表、单换行转 `<br>` | `.exp-summary`、`.summary`、`.award-item .exp-summary`、`.custom-item .exp-summary` |
| `mdInline` | 行内加粗/斜体/链接 | `.highlights li`、`.extra-value`、`.custom-item h4`、部分 `.r-contact-value` |

对模板 CSS 的影响：

- 上述容器里会出现 `<p>` / `<ul>` / `<ol>` / `<li>` / `<strong>` / `<em>` / `<a>` / `<br>`，容器必须是块级、能容纳块级子元素
- 列表 marker 由 `templates/resume-global.css` 全局收敛（含 `data-marker='square'|'arrow'|'dash'|'check'|'lower_roman'|…` 变体）；**模板不要重复定义** `.exp-summary ul` / `.summary ol` 的 `list-style` 或 `li::before`，否则出现双圆点
- 模板建议用全局 reset（`* { margin: 0; padding: 0; }`）收掉 `<p>` / `<ul>` 自带 margin；需要间距只用 `margin-bottom`
- 列表样式与 `.highlights` 的样式是两套：`.highlights li` 是显式亮点列表，Markdown 生成的列表在 `.exp-summary` 等容器内，别混用选择器

### i18n → 章节标题双语

章节标题（"教育背景 / Education"）与联系方式标签用 `{{i18n .Meta.Language "中文" "English"}}` 渲染，按简历语言自动切换。模板 CSS 只需给 `.section-title` / `.r-contact-label` 写样式，无需处理双语。

### safeURL → 头像 `<img src>`

头像用 `{{safeURL .Personal.Avatar}}` 渲染（避免 Base64 data URI 被转义）。模板 CSS 用 `.r-avatar img` 控制尺寸/圆角；必须显式写 `width` + `height` + `object-fit: cover`。

### dateRange → 日期字符串

`{{dateRange .StartDate .EndDate .IsCurrent}}` 输出日期范围，`is_current` 为真或结束日期为空时显示"至今"。落在 `.date` / `.exp-header .date` / `.edu-header .date` 内；模板要保证 `.date` 有 `white-space: nowrap` 以免日期被拆行，并注意分页拆分时 `.exp-header` / `.edu-header` 属于 `KEEP_WHOLE`（整体保留、不拆）。

### nl2br → 兼容用换行转换

`nl2br` 仍注册在两侧引擎，但**长文本字段已改用 `md`/`mdInline`**，新模板不需要针对它做任何特殊处理。

## 函数清单（了解即可，不必调用）

| 函数 | 签名 | 作用 |
|------|------|------|
| `dateRange` | `dateRange(start, end string, isCurrent bool) string` | 日期范围 / "至今" |
| `skillLevel` | `skillLevel(level int) template.HTML` | 输出 5 个技能等级点 |
| `i18n` | `i18n(lang, zh, en string) string` | 按简历语言中英切换 |
| `nl2br` | `nl2br(s string) template.HTML` | 换行转 `<br>`，自动 HTML 转义（兼容保留） |
| `md` | `md(s string) template.HTML` | 受限 Markdown（block），输出已消毒 |
| `mdInline` | `mdInline(s string) template.HTML` | 受限 Markdown（inline），输出已消毒 |
| `safeHTML` | `safeHTML(s string) template.HTML` | 输出原始 HTML（仅限已确保安全内容） |
| `safeURL` | `safeURL(s string) template.URL` | 标记可信 URL（头像 src） |
| `defaultVal` | `defaultVal(fallback, val string) string` | 值为空时返回默认值 |

另有 5 个布尔运算符 `not` / `and` / `or` / `eq` / `ne` 用于 `{{if}}` 条件组合（如 `{{if .Jobs}}`）。统一 HTML 已写好所有条件，模板作者无需关心。

> 模板作者**不要**在 CSS 里模拟这些函数的输出结构；只需对照 `data-model.md` 的 DOM 契约，为统一 HTML 已固定的类名写样式。
