# 内置模板函数

导入校验白名单中的 7 个函数。所有函数在模板中通过 `{{funcName args}}` 调用。这些函数与渲染器（`pkg/render/html.go`）注册的函数表完全一致。

## dateRange

格式化日期范围。

**签名**：`dateRange(start, end string, isCurrent bool) string`

**行为**：
- `start` 为空 → 返回空字符串
- `isCurrent` 为 true 或 `end` 为空 → 返回 `start + " - 至今"`
- 否则 → 返回 `start + " - " + end`

**用法**：
```html
{{dateRange .StartDate .EndDate .IsCurrent}}
```

**示例输出**：
- `2020.01 - 2023.06`
- `2020.01 - 至今`

> 适用于 Jobs、Internships。Projects 一般用 `false` 作为第三参数（项目通常没有"进行中"语义）。

## skillLevel

输出技能等级的 HTML 点点。

**签名**：`skillLevel(level int) template.HTML`

**行为**：
- 输出 5 个 `<span>`
- 前 `level` 个是 `<span class="skill-dot filled"></span>`
- 其余是 `<span class="skill-dot"></span>`
- `level` 范围 0-5；0 时全部为空点

**用法**：
```html
{{skillLevel .Level}}
```

**输出示例**（level=3）：
```html
<span class="skill-dot filled"></span><span class="skill-dot filled"></span><span class="skill-dot filled"></span><span class="skill-dot"></span><span class="skill-dot"></span>
```

**CSS 依赖**：模板必须定义 `.skill-dot` 和 `.skill-dot.filled`。

## i18n

根据简历语言输出中文或英文。

**签名**：`i18n(lang, zhKey, enKey string) string`

**行为**：
- `lang == "zh-CN"` → 返回 `zhKey`
- 否则 → 返回 `enKey`

**用法**：
```html
{{i18n .Meta.Language "工作经历" "Experience"}}
```

> 用于章节标题等需要双语的文本。简历内容本身（公司名、职位等）由用户填写，不需要 i18n。

## nl2br

将换行符转为 `<br>`，自动 HTML 转义。

**签名**：`nl2br(s string) template.HTML`

**行为**：
- 先对输入做 HTML 转义（防 XSS）
- 再将 `\n` 替换为 `<br>`
- 返回 `template.HTML` 类型（不在模板中被二次转义）

**用法**：
```html
{{nl2br .Summary}}
{{nl2br .Description}}
{{nl2br .Value}}
```

> 适用于所有多行纯文本字段：Summary、Project.Summary、CustomItem.Description、ExtraField.Value。

## safeHTML

输出原始 HTML，不做转义。

**签名**：`safeHTML(s string) template.HTML`

**行为**：直接将字符串作为 HTML 输出，不转义。

**用法**：
```html
{{safeHTML .SomeSafeHTML}}
```

> ⚠️ 仅用于已确保安全的内容。用户输入的数据**不要**用 safeHTML，会导致 XSS。一般模板用不到这个函数。

## safeURL

将字符串标记为可信 URL，跳过 `html/template` 对 URL 属性的默认过滤。

**签名**：`safeURL(s string) template.URL`

**行为**：返回 `template.URL` 类型，用于 `<a href>`、`<img src>` 等属性时不会被二次转义。

**用法**：
```html
{{if .Personal.Avatar}}<img src="{{safeURL .Personal.Avatar}}" alt="avatar" />{{end}}
```

> 主要用于头像字段 `Personal.Avatar`。该字段通常是 Base64 data URI 或本地文件路径，`html/template` 默认的 URL 过滤可能会转义其中的字符（如 `data:image/png;base64,...` 中的特殊字符），导致头像无法显示。`safeURL` 跳过这个过滤。
>
> 所有内置模板都使用此写法渲染头像，导入模板与内置模板写法完全一致。

## defaultVal

值为空时返回默认值。

**签名**：`defaultVal(defaultVal, val string) string`

**行为**：
- `val` 为空字符串 → 返回 `defaultVal`
- 否则 → 返回 `val`

**用法**：
```html
{{defaultVal "未填写" .Personal.Phone}}
```

> 用于可选字段，避免渲染空白。但更推荐用 `{{if .Field}}...{{end}}` 控制显隐，而不是填默认值。

## 函数调用语法注意

**导入校验只接受"函数名 + 空格分隔的参数"形式**，参数必须是简单字段路径。

合法：
```html
{{dateRange .StartDate .EndDate .IsCurrent}}
{{skillLevel .Level}}
{{i18n .Meta.Language "工作经历" "Experience"}}
{{nl2br .Summary}}
```

非法：
```html
{{dateRange .StartDate .EndDate .IsCurrent | upper}}  {{! 管道 }}
{{skillLevel (index .Items 0).Level}}                  {{! 嵌套调用 }}
{{nl2br .Summary | safeHTML}}                          {{! 管道 }}
```

> 字符串字面量（如 `"工作经历"`）作为函数参数是允许的——校验器的函数调用判定基于函数名白名单，参数形式相对宽松。
