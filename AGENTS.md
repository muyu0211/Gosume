# AGENTS.md

## 1. Project Overview（项目基础信息）

桌面级简历制作工具，基于 **Wails v3**（Go + Webview2）构建。前端使用 React/TypeScript，后端使用 Go，前后端通过 Wails service 绑定通信（前端通过 `@wailsio/runtime` 调用 Go 方法）。

## 仓库结构

```
main.go              # 入口：嵌入 frontend/dist + templates，创建 app.App
config.yaml          # 运行配置：服务端列表（client.service）、app 名/版本、window、log
pkg/                 # Go 后端（详见 @pkg/AGENTS.md）
frontend/            # React 前端（详见 @frontend/AGENTS.md）
templates/           # 内置简历模板：统一 HTML + resume-global.css + 各模板 styles.css（详见 @templates/AGENTS.md）
docs/                # 各期需求/改造/方案文档（一期~三期改造、AI、在线更新、主题、分页等）
build/               # Wails 构建配置及分平台 Taskfile
bin/                 # 构建产物
gosume-template-skills/  # 模板创建技能
Taskfile.yml         # 任务运行器入口（dev、build、package、docker 等）
```

## 分层架构（自底向上装配）

1. `main.go` 将 `frontend/dist`（生产构建）和 `templates/`（统一 HTML、全局 CSS、内置模板）嵌入 Go 二进制。
2. `pkg/config` 加载 `config.yaml`（`GlobalConfig`）；`pkg/user_config` 定位数据目录与用户配置。
3. `pkg/app/app.go` 负责组装全部组件：配置 → 日志 → 存储层（ResumeRepo/TemplateRepo/ProjectRepo）→ 模板加载器 → 渲染相关 → 无头浏览器导出 → 各服务 → Wails 窗口 → 依赖注入 → 事件与数据目录热切换回调。
4. Go 服务（分散在 `pkg/resume/service`、`pkg/ai/service`、`pkg/autofill/service`、`pkg/tool/service`）实现 Wails `application.Service`，注册为 Wails 服务；前端通过 `frontend/src/services/backend.ts` 的 `callService("ServiceName", "Method", ...args)` 按 `包.结构体.方法` 全名绑定调用。
5. 前端通过 Vite 打包；开发模式用 `task dev`（Wails 开发服务器，支持热重载）。

## 核心约定

- **Go 服务**实现 `application.Service` 接口，方法名 PascalCase，前端映射为 `ServiceName.MethodName`。**绑定全名第三段取结构体名**（而非 `ServiceName()` 返回值），因此结构体名必须与 `ServiceName()` 一致；服务跨包分布时前端用 `SERVICE_PACKAGE_OVERRIDES` 确定性解析包路径。

- **前后端统一响应**：服务方法一律返回 `*util.Response`（`code`：0 成功 / 300 警告 / 500 失败，`message` 面向用户中文文案，`data` 业务负载）；前端 `callService` 解析 `code`，非 0 抛 `ApiError`。少数据式方法（`Export`/`ExportBatch`/`GetDownloadProgress`）仍返回裸值，前端原样透传。对外错误一律只写日志、Message 用友好文案，不暴露底层细节。

- **前端状态**由 `frontend/src/stores/` 中的 zustand store 管理（resumeStore / templateStore / editorStore / themeStore / appStore）。需持久化的变更通过后端服务完成；仅 UI 相关状态保留本地。应用 UI 语言（appStore）与简历渲染语言（`resume.meta.language`）**解耦**，界面文案走 `i18n.ts`。

- **数据持久化**使用 SQLite（modernc.org/sqlite，纯 Go），存于用户数据目录，默认 WAL 模式。简历数据 JSON 存 `resumes.data`（软删除）；用户模板、项目文件存 SQLite；AI 配置（多套 + 启用）`ai_config.json` 存数据目录；主题经 `SystemService.Get/SetTheme` 存 `config.json`。

- **模板系统**：简历 HTML 由应用内置统一 HTML（`templates/template.html`）承载，模板只提供 `template.json`（元数据）+ `styles.css`（样式），模板包不再携带 HTML；`templates/resume-global.css` 为所有模板生效的静态全局样式。内置模板在 `templates/`，用户模板存 SQLite；支持导入/导出 `.zip` 模板包及社区模板市场。详见 `templates/AGENTS.md`。

- **简历样式定制（页边距/间距/头像/布局/字体/字号）**为**每份简历独立**的 per-resume `custom_css`（`resume.custom_css`），以带哨兵段的 CSS 承载（`.r-header` 信息区布局三态、页边距 0–80px、内容间距 0–40/0–15、头像圆角 0–100、全局字体、四级字号）。生成/解析/剥除全在前端 `frontend/src/lib/customCss.ts` + `layoutPresets.ts`，后端只存储透传。**不再是全局 config 布局**（无 `GetLayout/SaveLayout`、无 `layoutStore`）。详见 `frontend/AGENTS.md` 页面布局小节与 `templates/AGENTS.md` 全局布局小节。

- **主题**：`system | classic | wheat | obsidian` 四态（跟随系统 / 经典 / 麦色 / 深色），令牌变量在 `frontend/src/assets/styles/globals.css` 的 `html[data-theme=...]`，持久化经 `SystemService.SetTheme`；所有界面样式必须用主题令牌，禁止硬编码主题色。

- **导出**使用无头浏览器（rod，`pkg/resume/template_export`）将 HTML 渲染为 PDF/PNG。PNG 须保持 A4 宽度并按内容高度拉伸；PDF 保持物理 A4 分页。前端分页核心 `paginationCore.ts` 与后端导出共享 DOM 契约，保证所见即所得。

- **配置**：完整配置 `config.json` 存于数据目录内部，随数据目录迁移；锚点目录（便携=可执行文件目录，否则=系统配置目录）仅保留只含 `data_dir` 的指针 `config.json` 用于定位当前数据目录。数据目录支持热切换，切换时自动重开存储、重新注入依赖并通知前端。

## 技术栈

| 层级   | 技术                               |
| ------ | -------------------------------- |
| 桌面框架 | Wails v3 (alpha)                 |
| 后端语言 | Go 1.25                          |
| 前端框架 | React 18 + TypeScript            |
| 打包工具 | Vite 5                           |
| CSS 框架 | Tailwind CSS 3（主题令牌 `globals.css`） |
| 状态管理 | Zustand 5                        |
| 表单处理 | react-hook-form + zod            |
| 路由   | react-router-dom v7 (HashRouter) |
| 图标库  | lucide-react                     |
| 数据库  | SQLite (modernc.org/sqlite)      |
| 日志   | zap                              |
| 无头浏览器 | rod（用于 PDF/PNG 导出）            |
| 远程 HTTP | `pkg/remote/http` 统一客户端（模板市场/更新）|

## 文档索引

| 文档 | 用途 |
| ----- | ---- |
| `pkg/AGENTS.md` | 后端开发规范：服务层、统一响应、依赖注入、持久化、事件、模板、无头导出 |
| `frontend/AGENTS.md` | 前端开发规范：通信、store、i18n、主题、渲染/分页/导出、页面布局、Modal/通用规则 |
| `templates/AGENTS.md` | 模板系统：元数据、统一 HTML DOM 契约、styles.css 规范、模板包格式 |
| `docs/` | 各期需求/改造/方案文档（新增功能前建议先查对应主题） |