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

### 命名规范

- **变量命名**：变量全部遵循小驼峰命名法，首字母小写；常用命名字母全部大写，字母之间下划线分隔，例如```const EXPORT_PROGRES = "export:progress"```，
- **函数命名**：函数名称全部遵循驼峰命名法，首字母小写。
- **文件/文件夹命名**：文件名称全部遵循下划线命名法，字母全部小写，单词之间以下划线“_”分隔。

### 代码复用
- 代码复用应遵循单一原则，避免过度复用。
- 代码复用应遵循开放封闭原则，避免过度修改。
- 代码复用应遵循迪米特法则，避免过度依赖。
- 工具类的代码，如果不与当前文件中代码强相关，即也可以被其他文件中使用，应当抽取到util包下（例如Round2方法，虽然目前仅被使用在纸张规格的计算中，但是显然也可以用在其他需要保留两位小数的场景，所以应当抽取到util包下）
- 对于一些简单的方法（只有一两行），例如仅仅是字符串拼接或者判空等逻辑，只在当前文件中使用，不建议单独写成一个方法，因为这样会增加代码的复杂度。

### 代码注释

- 代码应有详细规范的中文注释；
- 注释应符合社区主流注释风格：方法名，方法作用，方法参数等

## 架构模式

## Wails 服务层

`pkg/xxx/service/` 中的服务实现 Wails 的 `application.Service` 接口（通过 `ServiceName()` 方法）。它们在 `pkg/app/app.go` 中注册，前端通过以下方式调用：

```
前端: callService("ResumeService", "NewResume", templateId, "zh-CN")
  ↓
Go:   ResumeService.NewResume(templateID string, language string)
```

只有服务结构体上的**导出方法（大写开头）**才能被前端调用。未导出方法（如 `saveResume`）仅限内部使用。

例如简历相关的服务层位于：`pkg\resume\service`

### 服务层代码规范

- 给前端回包的结构体要以Response结尾，增强可读性，例如更新逻辑的回包结构：UpdateInfoResponse；
- 所有结构体/变量/常量的定义放在文件的最前面；
- 可导出的方法放在不可导出（内部方法）的前面；

### 错误处理

所有服务方法使用 `util/error.go` 中的统一错误类型，向前端返回中文用户友好消息：

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


### 事件系统

后端发送的 Wails 事件（事件定义在`event.go`中, 在 `app.go` 中注册），事件名先采用常量在`event.go`中进行定义，再到`app.go`中注册，避免在直接使用硬编码的方式，避免影响后续的可拓展性/架构调整，例如：
| 事件名 | 数据类型 | 说明 |
|--------|----------|------|
| `export:progress` | int | 导出进度百分比 |
| `export:completed` | string | 导出文件路径 |
| `file:opened` | string | 打开的文件路径 |
| `file:saved` | string | 保存的文件路径 |
| `config:datadir-changed` | string | 新的数据目录路径 |

## 日志

使用 zap 结构化日志。日志文件写入 `{dataDir}/log/` 目录。日志级别通过 `log.INFO`、`log.DEBUG` 等设置。辅助函数：`log.Info`、`log.Error`、`log.Warn`、`log.Debug`、`log.Fatal`。

### 日志打印

- 遵循三段式：`[当前模块（包）] 当前方法：当前日志内容`，例如：
```
log.Errorf("[update_service] DownloadUpdate: 设置执行权限失败: %v", err)
log.Infof("[update_service] DownloadUpdate: 更新包已就绪 %s（sha256 %s）", pkgPath, hashHex[:12])
```

### 模板系统

Gosume简历部分中，简历 HTML 由应用内置的统一 HTML（`templates/template.html`）承载，模板只提供 `template.json`（元数据）+ `styles.css`（样式），模板包不再携带 HTML。

- `templates/template.html` 是唯一的简历 HTML（Go html/template 语法），包含全部数据区块（personal / education / internships / jobs / projects / awards / skills / languages / summary / custom），渲染顺序固定。它输出稳定的 DOM 契约（`.resume-page > .resume-container > .r-header + .r-main`），与前端分页子系统 `paginationCore.ts` 对齐。
- 模板加载：`template.Loader` 从 `TemplateStore`（内置 `templates/` 目录 + SQLite 用户模板）加载；`GetTemplateContent` 返回模板的 HTML（`effectiveHTML`：`uses_unified_html` 或空 HTML 时用统一 HTML）+ CSS + 纸张规格（`paper_size`/`orientation`，供前端分页与导出使用）。
- 隐藏（Hidden）由数据层处理：后端渲染前用 `model.WithoutHidden()` 过滤隐藏条目，统一 HTML 不写 Hidden 守卫（前端 `toGoShape` 语义一致）。
- 模板元数据定义在 `pkg/template/loader.go`（`Meta` 结构），字段规范见 `templates/AGENTS.md`。

### 模板导入

`TemplateService.ImportTemplatePackage()` 支持从本地文件导入 `.zip` 模板包：
