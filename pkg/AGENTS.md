# AGENTS.md

## 后端 — Go

## 技术栈

- **Go 1.25**，模块路径 `gosume`
- **Wails v3** (alpha)，桌面应用框架与服务绑定
- **SQLite**，通过 `modernc.org/sqlite`（纯 Go，无需 CGO）
- **zap** (`go.uber.org/zap`)，结构化日志
- **rod** (`github.com/go-rod/rod`)，无头浏览器，用于 PDF/PNG 导出（在 `pkg/resume/template_export`）
- **google/uuid**，ID 生成
- **远程客户端**：`pkg/remote/http` 提供统一 HTTP 客户端工厂（模板社区、更新检查等远程服务）

## 目录结构（按职责分包）

```
pkg/
├── app/                 # 组装与生命周期（app.go 装配全部组件）
├── ai/                  # AI 能力：client.go 大模型客户端、config.go 配置容器、presets.go 预设、prompts.go 提示词、types.go 类型
│   └── service/         #   AIService（Wails 服务）
├── autofill/            # 「一键填入」本地桥：127.0.0.1 暴露当前简历给浏览器扩展
│   └── service/         #   AutofillService
├── config/              # 全局配置（config.yaml 解析，GlobalConfig）
├── event/               # Wails 事件常量与注册
├── log/                 # zap 日志封装
├── remote/              # 远程服务客户端
│   └── http/            #   统一 HTTP 客户端（clients/options/response/stdclient）
├── resume/              # 简历核心
│   ├── dto/             #   数据传输对象（Template、market 等）
│   ├── helper/          #   平台相关（helper_unix.go / helper_windows.go）
│   ├── model/           #   简历数据模型（resume 含 CustomCSS 字段、personal/experience/education/skill）
│   ├── repo/            #   SQLite 存储（ResumeRepo / TemplateRepo / ProjectRepo）
│   ├── service/         #   Wails 服务层（Resume/Template/Export/File/System/Update/Community）
│   ├── template/        #   模板加载/校验/导入导出（Loader、*_exporter/importer/validator/resolve）
│   ├── template_export/ #   无头浏览器导出（browser.go，rod）
│   └── template_market/ #   模板市场客户端（community API）
├── tool/service/        # ToolService（证件照保存等独立工具）
├── user_config/         # 用户配置管理器（数据目录定位、布局/主题/AI 配置等管理）
└── util/                # 通用工具：util.go、response.go（统一响应）、parse_path.go
```

## 开发规范

### 命名规范

- **变量命名**：小驼峰，首字母小写；常用常量全大写，单词间下划线分隔，例如 `const EXPORT_PROGRESS = "export:progress"`。
- **函数命名**：驼峰，首字母小写。
- **文件/文件夹命名**：一律下划线命名法，全小写，单词间用 `_` 分隔（如 `ai_service.go`）。
- **平台差异文件**：同一文件需拆平台实现（syscall 不兼容）时，用 `xxx_unix.go` / `xxx_windows.go` 拆分，公共声明放 `xxx.go`（参考 `pkg/resume/helper/*`、`template_export/reap_*.go`）。

### 代码复用

> **核心原则：避免重复造轮子。** 新增任何功能/通用逻辑前，先判断项目里是否已经存在可复用的实现（Go 端优先搜 `pkg/` 现有工具与服务），判断完成后若能直接调用就复用；不存在时再评估是否已有成熟的第三方库可直接引入（如 `google/uuid`、`zap`、`rod`），引入第三方库前先确认其能力能覆盖需求且维护良好。

- 遵循单一原则，避免过度复用；开放封闭原则，避免过度修改；迪米特法则，避免过度依赖。
- 与当前文件弱相关、可被多文件使用的工具方法，抽取到 `pkg/util` 下（如 `Round2`、`PxToMm`、`MmToPx`、`SanitizeFilename`、`IsProd`、`GetRootPath`、`Go`、`HashFile`）。
- 新增工具方法前先查 `pkg/util` 是否已有同能力方法，避免同名/近似方法重复实现；跨包共享逻辑优先放 `pkg/util`，业务独立逻辑留在对应 `pkg/xxx` 内。
- 仅一两行的简单逻辑（拼接/判空）若只在当前文件用，不单独抽方法，避免增加复杂度；但若同逻辑已存在则直接复用。

### 代码注释

- 代码应有详细规范的中文注释；
- 注释遵循社区主流风格：方法名、方法作用、方法参数等。

## 架构模式

### Wails 服务层

`pkg/xxx/service/` 中的服务结构体实现 `ServiceName()` 方法，在 `pkg/app/app.go` 注册；前端通过 `frontend/src/services/backend.ts` 的 `callService` 调用。

> **关键约定（易踩坑）**：Wails 绑定全名为 `包路径.结构体名.方法名`（第三段取**结构体名**而非 `ServiceName()` 返回值，Wails 用 reflect NamedType 名）。因此**结构体名必须与 `ServiceName()` 一致**，否则前端报 "unknown bound method name"。

```
前端: callService("ResumeService", "NewResume", templateID, "zh-CN")
  ↓
Go:   gosume/pkg/resume/service.ResumeService.NewResume(templateID string, language string)
```

只有服务结构体上的**导出方法（大写开头）**才能被前端调用；未导出方法（如 `load`、`saveResume`）仅限内部使用。

**服务分布与前端包映射**：服务分散在多个包，前端用**确定性映射** `SERVICE_PACKAGE_OVERRIDES`（见 `frontend/src/services/backend.ts`）拿到每个服务的包路径：

| 服务 | Go 包 |
|------|-------|
| `ResumeService` `TemplateService` `ExportService` `FileService` `SystemService` `UpdateService` `CommunityService` | `gosume/pkg/resume/service`（默认包） |
| `AIService` | `gosume/pkg/ai/service` |
| `AutofillService` | `gosume/pkg/autofill/service` |
| `ToolService` | `gosume/pkg/tool/service` |

新增服务目录时，记得在前端 `registerServicePackage` 登记映射。

**前端可调用的服务方法**（除注明外均返回 `*util.Response`，见下）：

| 服务 | 方法 |
|------|------|
| `ResumeService` | NewResume, GetResume, SetResume, GetTemplateID, InitResume, AutoSave, UpdateResumeMeta, ListResumes, LoadResume, ExplicitSave, GetResumeByID, DeleteResume |
| `TemplateService` | ListTemplates, GetTemplate, GetTemplateContent, ImportTemplatePackage, ImportSharePackage, ValidateForTemplate, CreateTemplate, UpdateTemplate, DeleteTemplate, CloneTemplate, ListCategories, ListTemplatesByCategory, SetTemplateFavorite, ListImportLogs, DeleteImportLog, ExportTemplatePackage |
| `ExportService` | `Export`(→`string`,返回裸串), `ExportBatch`(→`[]string`,返回裸切片), GetResumeContentHeight |
| `FileService` | ExportFile, ParseFile, ImportFile |
| `SystemService` | ConfirmWindowClose, MinimizeWindow, MaximizeWindow, IsWindowMaximised, CloseWindow, QuitApp, GetAppVersion, GetDataDir, GetTheme, SetTheme, GetOS, GetAppDataDir, PickDataDir, SetDataDir, OpenExternalURL, ShowInFolder |
| `UpdateService` | GetDownloadProgress(→`int`,返回裸值), CheckUpdate, DownloadUpdate, ApplyUpdate, CancelUpdate |
| `CommunityService` | GetCommunityInfo, ListCommunityTemplates, GetCommunityTemplate, DownloadCommunityTemplate, PublishCommunityTemplate, RateCommunityTemplate |
| `AIService` | ListAIConfigs, GetAIConfig, SaveAIConfig, SetActiveAIConfig, DeleteAIConfig, TestConnection, Chat, Polish |
| `AutofillService` | GetStatus, Start, Stop, RotateToken |
| `ToolService` | SaveImage |

### 服务层代码规范

- 服务方法**统一返回 `*util.Response`**（`util.DoRsp(util.SuccCode/ErrCode, msg, data)`），不再返回 `error`。已迁移为 Response 的示意：
  ```go
  return util.DoRsp(util.SuccCode, "成功", &UpdateInfoResponse{...})
  return util.DoRsp(util.ErrCode, "未加载简历", nil)
  ```
- `ExportService.Export/ExportBatch`、`UpdateService.GetDownloadProgress` 等少数**旧式签名**仍返回裸值（`string`/`[]string`/`int`），前端 `callService` 对无 `code` 字段的返回值原样透传；新增方法一律用 Response。
- 给前端回包的业务结构体以 `Response` 结尾（如 `UpdateInfoResponse`、`PolishResponse`、`AIConfigListResponse`），增强可读性。
- 所有结构体/变量/常量的定义放在文件最前面；**可导出的（大写）方法放在不可导出方法前面**。
- 服务方法避免把技术细节暴露给前端：底层错误只写日志，`Message` 用统一中文友好文案（见「AI 错误返回」约定）。

### 错误处理（统一响应）

前后端采用**统一响应约定**（`pkg/util/response.go` 的 `Response`，前端 `ApiResponse`）：

| code | 含义 | 前端行为 |
|------|------|---------|
| `0` | 成功 | 取 `data` 作为返回值 |
| `300` | 警告（非致命） | `ApiError`，`isWarn` 为真，可继续流程 |
| `500` | 失败 | `ApiError`，`message` 直接面向用户展示 |

- 构造：`util.DoRsp(code, msg, data)`；`data == nil` 时响应体不含 `data` 字段。
- 判定：`r.IsSuccess()` 判断成功；`util.ParseData[T](r)` 解包 `data` 并反序列化。
- 用户取消对话框这类**不应提示错误**的操作：返回 `util.DoRsp(util.SuccCode, "", "")`（或空串），并用 `util.IsCancel(err)` 识别底层 "cancelled"/"canceled" 错误，前置兜底。
- **AI 等第三方调用失败**：只把详细错误写进日志（`log.Errorf`），`Message` 统一返回友好文案（如 `"AI 调用失败，请稍后重试"`），不向前端暴露模型名/网络细节，避免数据面信息泄漏与不良体验。

### 依赖注入

所有组装在 `pkg/app/app.go` 的 `New()` 中完成（顺序：配置 → 用户配置管理器 → 日志 → 存储层 → 模板加载器 → 统一 HTML / 全局 CSS → 导出管理器 → 服务 → Wails 应用与窗口 → 注入 → 事件与回调）：

1. `user_config.InitConfigManager(rootPath)` 定位数据目录；`config.GlobalConfig` 来自 config.yaml。
2. 存储层：`ResumeRepo`（简历）、`TemplateRepo`（模板）、`ProjectRepo`（项目文件）。
3. 模板加载器 `template.Loader` + 统一 HTML `template.html` + 全局统一样式 `resume-global.css`。
4. 服务实例后调用 `.Inject(...)` 注入依赖：
   - `resumeSvc.Inject(app, resumeStore)`
   - `templateSvc.Inject(app, loader, store, unifiedHTML, globalCSS)`
   - `exportSvc.Inject(app, browserManager)`
   - `systemSvc.Inject(app, userCfgMgr, window)`
   - `fileSvc.Inject(app, resumeStore, loader, resumeSvc)`
   - `updateSvc.Inject(app, userCfgMgr)`
   - `communitySvc.Inject(app, loader, store)`
   - `aiSvc.Inject(app, userCfgMgr)`
   - `autofillSvc.Inject(app, bridge)`；并 `bridge.Start()`
   - `toolSvc.Inject(app)`
5. 将所有服务加入 `svcs` 切片，注册给 Wails。
6. `event.AddEvent(...)` + `event.RegisterEvents()` 注册后端事件。

数据目录热切换：`userCfgMgr.OnChange` 回调中 `log.Close()` → `resumeStore.Reopen(newDir)`（失败回滚旧目录）→ `templateStore.Reopen` → `log.Init(newDir)` → 重新 Inject 受影响服务 → `app.Event.Emit("config:datadir-changed", newDir)`。

**`config.yaml`（客户端 / 远程服务）**：根目录 `config.yaml` 的 `client.service` 定义命名远程服务列表（proto/http、target 基地址、timeout、proxy）。`UpdateService` 与 `CommunityService` 分别使用 `gosume.UpdateService`、`gosume.CommunityService` 服务端条目。HTTP 客户端经 `pkg/remote/http` 的 `RegisterClient`/`BuildClient` 构建，`proto` 决定客户端类型、相对路径自动拼 `target`、`proxy` 设代理。

### 持久化模型

- **简历数据**：JSON（`*model.Resume`）序列化存入 SQLite `resumes.data` 列，`is_deleted` 标志软删除。
- **简历样式定制（per-resume custom_css）**：`resume.CustomCSS` 字符串字段以「带哨兵段的 CSS」承载页边距/内容间距/头像/信息区布局/字体/字号。后端只做存储透传**不解析**哨兵段；段的生成与反向解析契约在**前端** `frontend/src/lib/customCss.ts`（详见 `frontend/AGENTS.md` 页面布局小节）。
- **模板**：内置模板从 `templates/`（embedded）加载；用户模板存 SQLite `TemplateRepo`。支持导入/导出 `.zip` 模板包（`template_importer`/`template_exporter`）。
- **AI 配置**：`ai_config.json` 存于数据目录（`user_config` 管理），含多套配置与当前启用 ID，API Key 持久化、回包脱敏。
- **主题/语言**：主题经 `SystemService.GetTheme/SetTheme` 持久化到 `config.json`；应用 UI 语言由前端本地存储（不经后端）。
- **最近文件 / import 日志**：以 JSON 存数据目录；模板导入历史存 SQLite（`ListImportLogs`）。
- SQLite pragma：WAL 模式、外键约束、5 秒忙等待超时。

### 事件系统

事件名先用常量在 `pkg/event/event.go` 定义，再在 `app.go` 中 `AddEvent` + `RegisterEvents` 注册，禁止硬编码到业务代码：

| 事件名 | 数据类型 | 说明 |
|--------|----------|------|
| `export:progress` | int | 导出进度百分比 |
| `export:completed` | string | 导出文件路径 |
| `file:opened` | string | 打开的文件路径 |
| `file:saved` | string | 保存的文件路径 |
| `file:imported` | string | 导入的文件路径 |
| `config:datadir-changed` | string | 新的数据目录路径 |
| `window:close-requested` | string | 系统请求关闭窗口（标题栏 X/Alt+F4/红绿灯），前端做未保存二确 |
| `update:progress` | int | 更新包下载进度（0-100；总大小未知时为已下载字节数） |
| `update:result` | string | 更新包后台下载结果（"ok" 或 "error:<原因>"） |

## 日志

使用 zap 结构化日志，写入 `{dataDir}/log/`，级别经 `log.INFO`/`log.DEBUG` 等设置，辅助函数 `log.Info`/`Error`/`Warn`/`Debug`/`Fatal`。

- 遵循三段式：`[当前模块（包）] 当前方法：当前日志内容`，例如：
```
log.Errorf("[update_service] DownloadUpdate 设置执行权限失败: %v", err)
log.Infof("[update_service] DownloadUpdate 更新包已就绪 %s（sha256 %s）", pkgPath, hashHex[:12])
```
- 面向用户错误一律只写日志、不给前端暴露细节（见上文「错误处理」）。

## 模板系统

简历 HTML 由应用内置的**统一 HTML**（`templates/template.html`）承载，模板只提供 `template.json`（元数据）+ `styles.css`（样式），模板包不携带 HTML；`templates/resume-global.css` 为对所有模板生效的静态全局样式。完整规范见 `templates/AGENTS.md`。

- `template.Loader` 从 `TemplateStore`（内置 `templates/` 目录 + SQLite 用户模板）加载；`GetTemplateContent` 返回模板的 HTML（`effectiveHTML`：`uses_unified_html` 或空 HTML 时用统一 HTML）+ CSS + 纸张规格（`paper_size`/`orientation`）。
- 隐藏（Hidden）由前端数据层处理：渲染前用 `toGoShape` 过滤隐藏条目，统一 HTML 不写 Hidden 守卫。
- `TemplateService.ImportTemplatePackage()` / `ImportSharePackage()` 支持从本地导入 `.zip` 模板包；`ExportTemplatePackage()` 导出；历史包中的 `template.html` 被宽松忽略。
- 模板市场走 `pkg/resume/template_market`（CommunityService），联网拉取/发布/评分社区模板。

## 无头浏览器导出（pkg/resume/template_export）

`browser.go` 基于 rod 把渲染好的 HTML 转 PDF/PNG：

- 启动 browser 前 **必须禁用 leakless**（`Leakless(false)`），并把 profile 目录放到系统缓存目录下的固定路径，避免 Windows 安全软件误判导致导出失败。
- 启动失败需按错误关键词（virus、unwanted software、Access is denied）归类并给出可操作提示（如加入杀毒白名单）。
- `BrowserManager` 生命周期由 `app.go` 持有，`App.Run` 退出时 `Close()`。