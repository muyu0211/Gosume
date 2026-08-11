# 校验规则完整清单

本文档列出应用导入校验的所有规则。源码位于 `pkg/template/package_importer.go`。导入失败时对照本文档排查。

## 1. 文件结构校验

### 1.1 必需文件

ZIP 包根目录下必须存在以下三个文件（文件名精确匹配）：

- `template.json`
- `template.html`
- `styles.css`

缺失任何一个 → 错误 `missing required file: <文件名>`

### 1.2 重复文件

每个文件名只能出现一次。重复 → 错误 `duplicate <文件名> in template package`

### 1.3 路径安全

ZIP 内文件路径不得：

- 以 `../` 开头
- 等于 `..`
- 以 `/` 开头（绝对路径）
- 是系统绝对路径

违反 → 错误 `unsafe path in template package: <路径>`

### 1.4 大小限制

- 单文件 ≤ 2MB（`MaxTemplateFileSize = 2 << 20`）
- 整包累计 ≤ 10MB（`MaxTemplatePackageSize = 10 << 20`）

超限 → 错误 `template file <文件名> is too large` 或 `template package is too large`

### 1.5 目录条目

ZIP 内的目录条目会被忽略，只处理文件。但建议不要在包内放目录。

## 2. 元数据校验（template.json）

### 2.1 JSON 解析

必须是合法 JSON。解析失败 → 错误 `parse template.json: <原因>`

### 2.2 字段校验（validateMeta）

| 字段 | 规则 | 错误信息 |
|------|------|----------|
| `id` | 匹配 `^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$` | `template id must be 2-64 characters and contain only letters, numbers, hyphens, or underscores` |
| `name` | trim 后非空 | `template name is required` |
| `version` | trim 后非空 | `template version is required` |
| `author.name` | trim 后非空 | `template author name is required` |
| `paper_size` | 必须等于 `"A4"` | `only A4 templates are currently supported` |

### 2.3 默认值填充（normalizeMeta）

以下字段为空时会被填充默认值（不报错）：

| 字段 | 默认值 |
|------|--------|
| `target_language` | `["zh-CN"]` |
| `tags` | `[]` |
| `category` | `"custom"` |
| `paper_size` | `"A4"`（但若显式填了非 A4 值会报错） |
| `orientations` | `["portrait"]` |
| `page_count.min` | `1` |
| `page_count.max` | `5` |
| `page_count.default` | `1` |

> 注意：`paper_size` 空字符串会被 normalize 为 `"A4"`，但如果显式填了 `"Letter"` 等非 A4 值，normalize 不会改它，随后 validateMeta 会拒绝。所以建议**始终显式填 `"A4"`**。

## 3. HTML 语法校验

### 3.1 非空检查

- `template.html` trim 后不能为空 → 错误 `template.html is empty`
- `styles.css` trim 后不能为空 → 错误 `styles.css is empty`

### 3.2 实时预览兼容性校验（validatePreviewCompatibleSyntax）

校验器用正则 `\{\{([^{}]+)\}\}` 提取所有 `{{...}}` 表达式，逐个检查。**注意：这是为了让模板能在前端实时预览引擎中工作，比 Go 标准 html/template 的能力更受限。**

#### 跳过的表达式（不需校验）

- 空表达式 `{{}}`
- `{{end}}`
- `{{else}}`

#### 允许的表达式

| 类型 | 形式 | 示例 |
|------|------|------|
| 简单字段路径 | `^.Field(\.Field)*$` | `{{.Personal.FullName}}`、`{{.Jobs}}` |
| CSS 内联 | 精确匹配 `template "styles.css" .` | `{{template "styles.css" .}}` |
| if 块 | `if <简单路径>` | `{{if .Jobs}}`、`{{if .Personal.Avatar}}` |
| range 块 | `range <简单路径>` | `{{range .Jobs}}`、`{{range .Highlights}}` |
| 支持的函数调用 | 函数名 + 参数 | `{{dateRange .StartDate .EndDate .IsCurrent}}` |

#### 简单路径的判定

正则：`^\.[A-Za-z0-9_]*(\.[A-Za-z0-9_]+)*$`

合法：`.Field`、`.Field.Sub`、`.Field.Sub.Deep`
非法：`.Field[0]`、`.Field["key"]`、`.Field.Sub | filter`

> 注意：range 内部访问当前元素的字段用 `{{.Field}}`（如 `{{.Company}}`），这算简单路径，合法。

#### 支持的函数（白名单）

只有以下 7 个函数名出现在表达式开头时才允许：

- `dateRange`
- `skillLevel`
- `i18n`
- `nl2br`
- `safeHTML`
- `safeURL`
- `defaultVal`

> 这 7 个函数与渲染器（`pkg/render/html.go`）注册的函数表完全一致，导入模板与内置模板使用相同的函数集。

#### 拒绝的表达式示例

| 表达式 | 拒绝原因 |
|--------|----------|
| `{{.Field \| nl2br}}` | 含管道符 `\|` |
| `{{ $x := .Field }}` | 含 `:=` |
| `{{ $x }}` | 含 `$` |
| `{{with .Field}}` | with 块 |
| `{{block "x" .}}` | block 块 |
| `{{define "x"}}` | define 块 |
| `{{template "foo" .}}` | 非 styles.css 的 template include |
| `{{if eq .A .B}}` | if 后不是简单路径 |
| `{{if not .Field}}` | if 后不是简单路径 |
| `{{range .Field \| limit 5}}` | range 后含管道 |
| `{{index .Field 0}}` | 不在函数白名单 |
| `{{printf "%s" .Field}}` | printf 不在白名单 |

### 3.3 模板执行校验（validateTemplateExecution）

通过校验后，校验器会：

1. 用 7 个预览函数创建 `html/template`
2. 如果 HTML 含 `{{template "styles.css"`，先解析 CSS 为子模板
3. 解析 HTML
4. 用**样本数据**执行模板

样本数据（`sampleResume`）包含：

- Personal：FullName、Email、Phone、Location、JobTitle、YearsOfExp、GitHub
- Summary：一段文字
- Jobs：1 条（Company、Title、Location、StartDate、IsCurrent=true、Summary、Highlights）
- Projects：1 条（Name、Role、StartDate、EndDate、Summary、Highlights）
- Education：1 条（School、Degree、Major、StartDate、EndDate、GPA）
- Skills：1 组（Category + 2 个 Item，Level 4 和 5）
- Languages：1 条（Name、Level）
- Awards：1 条（Title、Date、Issuer、Summary）
- Custom：1 个区块（Title + 1 个 Item）

> 如果模板引用了样本数据中不存在的字段，执行时会报错。但模型字段很稳定，按 data-model.md 来一般不会出错。

解析失败 → 错误 `parse template.html: <原因>` 或 `parse styles.css as template: <原因>`
执行失败 → 错误 `execute template with sample data: <原因>`

## 4. 常见导入失败排查

| 错误关键词 | 排查方向 |
|------------|----------|
| `template id must be` | 检查 id 格式 |
| `template name is required` | name 字段空 |
| `only A4 templates` | paper_size 不是 A4 |
| `unsupported template expression` | HTML 中有禁止的语法 |
| `unsupported template control expression` | if/range 后跟了非简单路径 |
| `only {{template "styles.css" .}}` | 用了其他 template include |
| `missing required file` | 文件名错或不在 zip 根目录 |
| `unsafe path` | zip 内有路径穿越 |
| `is too large` | 文件或整包超限 |
| `duplicate` | 文件重复 |
| `parse template.html` | HTML 模板语法错误（括号不匹配等） |
| `execute template with sample data` | 引用了不存在的字段或类型不匹配 |

## 5. 验证工具

目前应用没有提供独立的模板校验命令行工具。验证模板的唯一方式是：

1. 打包为 `.gosume-template`
2. 在应用中尝试导入

如果反复试错成本高，可以临时修改 `pkg/template/package_importer_test.go` 添加测试用例，跑 `go test` 验证。但这需要 Go 开发环境。
