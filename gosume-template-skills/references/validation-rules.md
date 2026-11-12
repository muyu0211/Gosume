# 校验规则完整清单

本文档列出应用导入校验的全部规则，与 `assets/scripts/validate-template.cjs` 的检查项一一对应。源码位于 `pkg/resume/template/template_importer.go`（**注意**：不是旧文档写的 `pkg/template/package_importer.go`，该路径已不存在）。导入失败时对照本文档排查。

> 模板包**只含 `template.json` + `styles.css` 两文件**，HTML 由应用内置统一 HTML 承载，因此**不再校验 HTML 语法/执行**，只校验元数据与 CSS 非空。

## 1. 文件结构校验

### 1.1 必需文件与条目上限

ZIP 包根目录必须存在 `template.json` 和 `styles.css`（文件名精确匹配），缺失 → `missing required file: <文件名>`；同名文件重复 → `duplicate <文件名> in template package`。

**包内文件条目数 ≤ 2**（`MaxTemplateEntries = 2`），超出 → `template package has too many files`。目录条目会被 `FileInfo().IsDir()` 跳过、不计数，但仍建议包内不放目录。

> ⚠️ **带 `template.html` 的历史模板包现在会被拒绝**：源码 `switch` 里确实保留 `case "template.html": continue`（注释写"宽松忽略"），但 `entryCount++` 发生在 `switch` 之前，第三个文件会把计数推到 3，直接触发上面的条目上限错误。`templates/AGENTS.md` 与一期改造文档里"宽松忽略 HTML"的说法**与当前源码行为不符**。修复办法：删掉 HTML，只保留 json + css 重新打包。

### 1.2 路径安全

条目路径不得：以 `../` 开头、等于 `..`、以 `/` 开头、是系统绝对路径。违反 → `unsafe path in template package: <路径>`。

### 1.3 大小限制

- 单文件解压后 ≤ 2MB（`MaxTemplateFileSize = 2 << 20`）
- 所有文件解压后累计 ≤ 10MB（`MaxTemplatePackageSize = 10 << 20`）

超限 → `template file <文件名> is too large` 或 `template package is too large`。读取时用 `CopyN(MaxTemplateFileSize+1)` 兜底，防止声明体积造假。

## 2. 元数据校验（template.json）

### 2.1 JSON 解析

必须是合法 JSON，解析失败 → `parse template.json: <原因>`。

### 2.2 字段校验（validateMeta）

| 字段 | 规则 | 错误信息 |
|------|------|----------|
| `id` | `^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$`（2–64 位，首字符字母/数字）；导入时按 id 判断是否已导入 | `template id must be 2-64 characters and contain only letters, numbers, hyphens, or underscores` |
| `name` | trim 后非空 | `template name is required` |
| `version` | trim 后非空 | `template version is required` |
| `author.name` | trim 后非空 | `template author name is required` |
| `paper_size` | 必须等于 `"A4"` | `only A4 templates are currently supported` |

> 内置模板的 `id` 统一用 UUID v4；`templates/AGENTS.md` 提到 `paper_size` 可为 "A4 / Letter"，但**源码校验只接受 A4**，写 Letter 一定导入失败。

### 2.3 默认值填充（normalizeMeta）

以下字段为空时会被填充默认值（不报错）：

| 字段 | 默认值 |
|------|--------|
| `target_language` | `["zh-CN"]` |
| `tags` | `[]` |
| `category` | `"custom"` |
| `paper_size` | `"A4"`（但显式填非 A4 值会被 validateMeta 拒绝） |
| `orientations` | `["portrait"]` |
| `page_count.min` / `.max` / `.default` | `1` / `5` / `1` |

`id`、`name`、`version`、`author.name`、`paper_size` 会先 `TrimSpace`。建议始终显式填全元数据，别依赖默认值。

## 3. CSS 校验

- `styles.css` trim 后不能为空 → `styles.css is empty`
- 导入**不解析 CSS 语法**、不检查选择器是否对齐统一 HTML 类名。模板能否正常渲染属于"渲染正确性"范畴，由本 skill 的校验器做静态自检 + 应用内预览验证

## 4. 常见导入失败排查

| 错误关键词 | 排查方向 |
|------------|----------|
| `template id must be` | id 格式不对（用 UUID v4） |
| `template name/version/author name is required` | 必填元数据为空 |
| `only A4 templates` | paper_size 不是 A4 |
| `styles.css is empty` | CSS 为空 |
| `missing required file` | 文件名错或不在 zip 根目录 |
| `template package has too many files` | 包内有第三个文件（常见：旧版 `template.html`） |
| `duplicate` | 同名文件重复 |
| `unsafe path` | zip 内有路径穿越或子目录前缀 |
| `is too large` | 单文件或整包超限 |

## 5. 渲染正确性自检（非导入校验，但必做）

导入成功 ≠ 能用。以下由 `assets/scripts/validate-template.cjs` 静态检查（错误阻断打包、警告提示）：

**硬错误**（与后端一致）：两文件、大小、id/name/version/author/paper_size、CSS 非空、CSS 不含外部资源（`@import` / `url(http...)`）、目录不含 `template.html`。

**警告**（渲染契约，见 `style-guide.md`）：

- `.resume-page` 是否经 `var(--resume-padding*, …)` 消费页边距（双栏则检查 `.r-header` / `.r-main`）
- `.r-contact-group` 是否适配（双栏侧栏可省略，全局 `display: contents` 兜底）
- 字体是否经 `--font-family*` 变量消费（否则用户切换全局字体不生效）
- 是否存在 `@page`、`.page-break`、`.skill-dot`、`.summary` 换行规则、`.r-avatar img` 宽高
- 是否有 `margin-top` 表达内容节奏、是否用了 `:first-child` / `:nth-child()` 等分页易碎选择器
- `:root` 颜色变量与 `template.json` 的 `colors` 是否一致

## 6. 验证工具

```bash
node <skill-dir>/assets/scripts/validate-template.cjs <模板目录>
node <skill-dir>/assets/scripts/validate-template.cjs <模板目录> --strict   # 警告也视为失败
```

`package-template.ps1` / `package-template.sh` 在打包前自动调用它。完整验证链路：

1. 跑校验器（静态）
2. 打包成 `.zip`，在应用中导入（导入校验只查元数据 + 包结构 + CSS 非空）
3. 新建简历选用该模板，逐项验证渲染：填入全部个人信息（含长网站链接）、多行富文本、技能等级
4. 在编辑器里切换页边距 / 内容间距 / 头像尺寸 / 全局字体 / 四级字号 / 信息区三布局，确认每项都有反应且不错位
5. 导出 PDF 验证打印与分页（重点看续页条目样式、侧栏空壳、联系方式跨列）
6. 导出 PNG / 看缩略图，确认与预览一致
