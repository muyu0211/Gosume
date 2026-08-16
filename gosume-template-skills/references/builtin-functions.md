# 统一 HTML 内置函数（模板作者须知）

简历 HTML 由应用内置的统一 HTML（`templates/template.html`）承载，以下函数由统一 HTML**内部使用**。模板作者**不写 HTML、不直接调用这些函数**，但需要了解它们对渲染输出的影响，尤其是对 CSS 类名的依赖。

## 与模板 CSS 相关的关键副作用

### skillLevel → 依赖 `.skill-dot` / `.skill-dot.filled`

统一 HTML 用 `{{skillLevel .Level}}` 渲染技能等级，输出 5 个 `<span>`：

```html
<span class="skill-dot filled"></span><span class="skill-dot filled"></span><span class="skill-dot filled"></span><span class="skill-dot"></span><span class="skill-dot"></span>
```

- 前 `level` 个是 `.skill-dot.filled`，其余是 `.skill-dot`
- **模板 CSS 必须定义 `.skill-dot` 和 `.skill-dot.filled`**，否则技能等级点不显示

### i18n → 章节标题双语

统一 HTML 的章节标题（"教育背景/Education"等）用 `{{i18n .Meta.Language "中文" "English"}}` 渲染，根据简历语言自动切换。模板 CSS 只需给 `.section-title` 写样式，无需处理双语。

### nl2br → 多行文本产生 `<br>`

统一 HTML 对多行纯文本字段（`summary`、项目描述、自定义描述、扩展字段值）用 `nl2br` 渲染，输出中含 `<br>` 换行。模板 CSS 无需特殊处理。

### safeURL → 头像 `<img src>`

统一 HTML 对头像用 `{{safeURL .Personal.Avatar}}` 渲染（避免 Base64 data URI 被转义）。模板 CSS 用 `.r-avatar img` 控制头像尺寸/圆角即可。

## 函数清单（了解即可，不必调用）

| 函数 | 签名 | 作用 |
|------|------|------|
| `dateRange` | `dateRange(start, end string, isCurrent bool) string` | 日期范围，`isCurrent` 为 true 或 `end` 为空时显示"至今" |
| `skillLevel` | `skillLevel(level int) template.HTML` | 输出 5 个技能等级点 |
| `i18n` | `i18n(lang, zhKey, enKey string) string` | 根据简历语言输出中文/英文 |
| `nl2br` | `nl2br(s string) template.HTML` | 换行转 `<br>`，自动 HTML 转义 |
| `safeHTML` | `safeHTML(s string) template.HTML` | 输出原始 HTML（仅限已确保安全内容） |
| `safeURL` | `safeURL(s string) template.URL` | 标记可信 URL（用于头像 src） |
| `defaultVal` | `defaultVal(fallback, val string) string` | 值为空时返回默认值 |

另有 5 个布尔运算符 `not` / `and` / `or` / `eq` / `ne` 用于统一 HTML 的条件组合（如 `{{if .Jobs}}`、`{{if and .Summary ...}}`）。模板作者同样无需关心——统一 HTML 已写好所有条件。

> 模板作者**不要**尝试在自己的 CSS 中模拟这些函数的输出结构；只需对照 `data-model.md` 的 DOM 契约，为统一 HTML 已固定的类名写样式。
