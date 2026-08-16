# AGENTS.md

## 后端 — Go


## 技术栈

- **Go 1.25**，模块路径 `gosume`
- **Wails v3** (alpha)，桌面应用框架与服务绑定
- **SQLite**，通过 `modernc.org/sqlite`（纯 Go，无需 CGO）
- **zap** (`go.uber.org/zap`)，结构化日志
- **rod** (`github.com/go-rod/rod`)，无头浏览器，用于 PDF/PNG 导出
- **google/uuid**，ID 生成

## 开发规范

### 代码注释
- 代码应有详细规范的注释；
- 注释应符合社区主流注释风格：方法名，方法作用，方法参数等

## 架构模式

### Wails 服务层

`pkg/service/` 中的服务实现 Wails 的 `application.Service` 接口（通过 `ServiceName()` 方法）。它们在 `pkg/app/app.go` 中注册，前端通过以下方式调用：

```
前端: callService("ResumeService", "NewResume", templateId, "zh-CN")
  ↓
Go:   ResumeService.NewResume(templateID string, language string)
```

只有服务结构体上的**导出方法（大写开头）**才能被前端调用。未导出方法（如 `saveResume`）仅限内部使用。

### 错误处理

所有服务方法使用 `service/errors.go` 中的统一错误类型，向前端返回中文用户友好消息：

```go
// 创建用户友好的错误
return UserMsg("未加载简历")

// 包装底层错误，附加用户友好消息
return UserWrap(err, "保存项目失败")
```

| 函数 | 用途 |
|------|------|
| `UserMsg(msg)` | 从字符串创建 `UserError` |
| `UserWrap(err, msg)` | 包装底层错误，返回时显示 `msg`（err 为 nil 或已是 UserError 时直通） |
| `IsCancel(err)` | 检测是否为用户取消对话框操作（匹配 "cancelled" / "canceled"），取消时不显示错误 |

`UserError` 实现 `error` 接口，其 `Error()` 输出直接成为前端 JS `Error.message`。前端通过 `extractErrorMessage()` 统一提取（见 `frontend/AGENTS.md`）。用户取消操作（如关闭对话框）应返回 `nil`，避免前端弹错误提示。

### 依赖注入

所有组装在 `pkg/app/app.go` 的 `New()` 中完成：
1. 配置 → 日志 → 存储层（ResumeStore、TemplateStore、ProjectStore）
2. 模板加载器 + HTML 渲染器 + 导出管理器
3. 创建各服务实例，调用 `.Inject(...)` 注入依赖
4. 将服务注册到 Wails 应用

数据目录热切换时，通过 `config.OnChange` 回调重新注入依赖。

### 持久化模型

- **简历数据**：JSON 序列化存入 SQLite 的 `resumes.data` 列。通过 `is_deleted` 标志实现软删除。
- **模板**：内置模板从 `templates/` 目录嵌入。用户模板存储在 SQLite 中。支持导入模板包（`.zip` 文件）。
- **最近文件**：以 JSON 文件（`recent.json`）形式存储在数据目录中。

SQLite pragma 设置：WAL 模式、外键约束、5 秒忙等待超时。

### 保存语义

`ResumeService` 采用两层保存模型：

| 方法 | 可见性 | 行为 |
|------|--------|------|
| `NewResume` | 导出 | 仅在内存中创建，不写入数据库 |
| `AutoSave` | 导出 | 仅在已持久化过的情况下更新数据库 |
| `ExplicitSave` | 导出 | 首次创建或更新数据库记录 |
| `saveResume` | 未导出 | 实际执行数据库写入——前端无法直接调用 |

防止意外持久化：简历必须先手动保存一次，之后自动保存才会生效。


### 事件系统

后端发送的 Wails 事件（在 `app.go` 中注册）：

| 事件名 | 数据类型 | 说明 |
|--------|----------|------|
| `export:progress` | int | 导出进度百分比 |
| `export:completed` | string | 导出文件路径 |
| `file:opened` | string | 打开的文件路径 |
| `file:saved` | string | 保存的文件路径 |
| `config:datadir-changed` | string | 新的数据目录路径 |

### 字段更新

前端通过 `ResumeService.UpdateField(path, value)` 发送字段更新。路径使用点号表示法，支持数组索引（如 `personal.full_name`、`jobs[0].company`）。Go 端通过反射（`model.SetFieldByPath`）将 JSON 字段名（snake_case）映射为结构体字段名（PascalCase）。

### 日志

使用 zap 结构化日志。日志文件写入 `{dataDir}/log/` 目录。日志级别通过 `log.INFO`、`log.DEBUG` 等设置。辅助函数：`log.Info`、`log.Error`、`log.Warn`、`log.Debug`、`log.Fatal`。

### 模板系统（一期改造后）

Gosume 一期改造后，简历 HTML 由应用内置的统一 HTML（`templates/unified.html`）承载，模板只提供 `template.json`（元数据）+ `styles.css`（样式），模板包不再携带 HTML。

- `templates/unified.html` 是唯一的简历 HTML（Go html/template 语法），包含全部数据区块（personal / education / internships / jobs / projects / awards / skills / languages / summary / custom），渲染顺序固定。它输出稳定的 DOM 契约（`.resume-page > .resume-container > .r-header + .r-main`），与前端分页子系统 `paginationCore.ts` 对齐。
- 模板加载：`template.Loader` 从 `TemplateStore`（内置 `templates/` 目录 + SQLite 用户模板）加载；`GetTemplateContent` 返回模板的 HTML（`effectiveHTML`：`uses_unified_html` 或空 HTML 时用统一 HTML）+ CSS + 纸张规格（`paper_size`/`orientation`，供前端分页与导出使用）。
- 隐藏（Hidden）由数据层处理：后端渲染前用 `model.WithoutHidden()` 过滤隐藏条目，统一 HTML 不写 Hidden 守卫（前端 `toGoShape` 语义一致）。
- 模板元数据定义在 `pkg/template/loader.go`（`Meta` 结构），字段规范见 `templates/AGENTS.md`。

### 模板导入

`TemplateService.ImportTemplatePackage()` 支持从本地文件导入 `.zip` 模板包：

1. 前端调用 → Go 弹出原生文件选择对话框（filter: `*.zip`）
2. `template.LoadPackageFromZip()` 解析 ZIP：提取 `template.json`（元数据）+ `styles.css`（样式）；若仍含 `template.html`（历史包）则宽松忽略
3. 校验：元数据（id/name/version/author.name/paper_size=A4）+ CSS 非空（`ValidatePackage`）
4. 通过 `TemplateStore.Create()` 将模板存入 SQLite
5. 返回 `ImportTemplateResult{ID, Name, Version, Meta}` 给前端

`TemplateService` 新增 `wailsApp` 依赖（用于弹出文件对话框），`Inject()` 签名相应更新。内部辅助函数 `toGetTemplateMeta()` 消除模板元数据转换的重复代码。
