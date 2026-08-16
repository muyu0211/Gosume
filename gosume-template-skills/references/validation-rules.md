# 校验规则完整清单

本文档列出应用导入校验的所有规则。源码位于 `pkg/template/package_importer.go`。导入失败时对照本文档排查。

> Gosume 一期改造后：模板包**只含 `template.json` + `styles.css` 两文件**，HTML 由应用内置统一 HTML 承载。因此**不再校验 HTML 语法/执行**，只校验元数据与 CSS 基础合法性。

## 1. 文件结构校验

### 1.1 必需文件

ZIP 包根目录下必须存在以下两个文件（文件名精确匹配）：

- `template.json`
- `styles.css`

缺失任何一个 → 错误 `missing required file: <文件名>`

### 1.2 重复文件

`template.json` / `styles.css` 每个文件名只能出现一次。重复 → 错误 `duplicate <文件名> in template package`

### 1.3 路径安全

ZIP 内文件路径不得：以 `../` 开头、等于 `..`、以 `/` 开头、是系统绝对路径。违反 → 错误 `unsafe path in template package: <路径>`

### 1.4 大小限制

- 单文件 ≤ 2MB（`MaxTemplateFileSize = 2 << 20`）
- 整包累计 ≤ 10MB（`MaxTemplatePackageSize = 10 << 20`）

超限 → 错误 `template file <文件名> is too large` 或 `template package is too large`

### 1.5 目录条目

ZIP 内的目录条目会被忽略，只处理文件。建议不要在包内放目录。

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

> `paper_size` 空字符串会被 normalize 为 `"A4"`，但显式填 `"Letter"` 等非 A4 值会被 validateMeta 拒绝。建议始终显式填 `"A4"`。

## 3. CSS 校验

- `styles.css` trim 后不能为空 → 错误 `styles.css is empty`
- 模板能否正常渲染取决于 CSS 是否对齐统一 HTML 的类名契约（见 `style-guide.md`），这属于"渲染正确性"而非"导入校验"范畴——导入只保证元数据与 CSS 非空合法。

## 4. 常见导入失败排查

| 错误关键词 | 排查方向 |
|------------|----------|
| `template id must be` | 检查 id 格式 |
| `template name is required` | name 字段空 |
| `template version is required` | version 字段空 |
| `template author name is required` | author.name 字段空 |
| `only A4 templates` | paper_size 不是 A4 |
| `styles.css is empty` | CSS 为空 |
| `missing required file` | 文件名错或不在 zip 根目录（需 template.json + styles.css） |
| `unsafe path` | zip 内有路径穿越 |
| `is too large` | 文件或整包超限 |
| `duplicate` | 文件重复 |

## 5. 验证工具

目前应用没有提供独立的模板校验命令行工具。验证模板的唯一方式是：

1. 打包为 `.zip`
2. 在应用中尝试导入（导入校验只查元数据 + CSS 非空）
3. 导入后在应用中实时预览，确认 CSS 对齐统一 HTML 类名、各区块样式正确
4. 导出 PDF 验证打印效果与分页