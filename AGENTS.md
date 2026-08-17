# AGENTS.md

## 1. Project Overview（项目基础信息）
- 
桌面级简历制作工具，基于 **Wails v3**（Go + Webview2）构建。前端使用 React/TypeScript，后端使用 Go，前后端通过 Wails service 绑定通信（前端通过 `@wailsio/runtime` 调用 Go 方法）。

## 仓库结构

```
main.go              # 入口：嵌入 frontend/dist + templates，创建 app.App
pkg/                 # Go 后端（详见 @pkg/AGENTS.md）
frontend/            # React 前端（详见 @frontend/AGENTS.md）
templates/           # 内置简历模板（HTML+CSS），编译时嵌入（详见 @templates/AGENTS.md）
build/               # Wails 构建配置及分平台 Taskfile
Taskfile.yml         # 任务运行器入口（dev、build、package、docker 等）
```

## 分层架构

1. `main.go` 将 `frontend/dist`（生产构建）和 `templates/` 嵌入 Go 二进制文件。
2. `pkg/app/app.go` 负责组装所有组件——配置、日志、存储、服务、渲染器、导出、Wails 窗口。
3. Go 服务（`pkg/service/` 目录）注册为 Wails 服务，前端通过 `frontend/src/services/backend.ts` 中的 `callService("ServiceName", "Method", ...args)` 调用。
4. 前端通过 Vite 打包；开发模式使用 `task dev`（Wails 开发服务器，支持热重载）。

## 核心约定

- **Go 服务**通过实现 Wails v3 的 `application.Service` 接口向前端暴露方法。方法名采用 PascalCase，前端调用时映射为 `ServiceName.MethodName`。
- **前端状态**由 `frontend/src/stores/` 中的 zustand store 管理。需要持久化的变更通过后端服务调用完成；仅 UI 相关的状态保留在本地。
- **数据持久化**使用 SQLite（modernc.org/sqlite，纯 Go 实现），存储在用户数据目录中，默认开启 WAL 模式。
- **模板系统**：模板为 HTML+CSS 组合，附带元数据。内置模板存放在 `templates/` 目录；用户模板存储在 SQLite 中。支持导入模板包（`.zip`文件）。
- **布局档位**：简历布局设置（页边距 `page_margin`、内容间距 `section_spacing`、字号 `font_size`）以**档位 key**存储在 `resume.meta` 中。档位列表（数量、名称、数值）由用户在设置页自定义，持久化到 `config.json` 的 `layout_presets` 字段（模型与校验见 `pkg/config/layout_presets.go`，经 `SystemService.Get/Set/ResetLayoutPresets` 读写；前端镜像定义在 `frontend/src/lib/layoutPresets.ts`，运行时经 `stores/layoutSettingsStore.ts` 加载）。两侧均须保留 `normal` 档作为回退：内容间距的 `normal` 档 gap 为 null（模板内置节奏，不可改值）；`resume.meta` 引用已删除的 key 时前端回退到 `normal` 档。key → 具体 CSS 值的映射与注入由前端完成；后端与模板只消费 key 或 CSS 变量，不得持久化像素值（详见 `templates/AGENTS.md` 布局档位小节）。
- **导出**使用无头浏览器（rod）将 HTML 渲染为 PDF/PNG。
- **配置**：完整配置 `config.json` 存放在数据目录内部（`{data_dir}/config.json`），随数据目录一起迁移；锚点目录（便携模式=可执行文件所在目录，否则=系统配置目录）仅保留一个只含 `data_dir` 字段的指针 `config.json`，用于下次启动时定位当前数据目录。数据目录支持热切换，切换时自动重新打开存储。


## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Wails v3 (alpha) |
| 后端语言 | Go 1.25 |
| 前端框架 | React 18 + TypeScript |
| 打包工具 | Vite 5 |
| CSS 框架 | Tailwind CSS 3 |
| 状态管理 | Zustand 5 |
| 表单处理 | react-hook-form + zod |
| 路由 | react-router-dom v7 (HashRouter) |
| 图标库 | lucide-react |
| 数据库 | SQLite (modernc.org/sqlite) |
| 日志 | zap |
| 无头浏览器 | rod（用于 PDF/PNG 导出） |
