# Gosume 简历编辑器 — 简历项目总结

> 应聘方向：服务器/后端开发
> 技术关键词：Go · SQLite · 无头浏览器 · 桌面应用 · AI Coding / Vibe Coding

---

## 项目一句话描述

一款基于 **Wails v3（Go + WebView2）** 的桌面级简历制作工具，采用 **Local-First** 架构，单二进制分发，跨 Windows/macOS/Linux 三平台，内置 16 套简历模板，支持所见即所得编辑与 PDF/PNG 高保真导出。

---

## 一、AI Coding / Vibe Coding 实践（前端全量 AI 生成）

本项目前端（React 18 + TypeScript，约 40+ 组件、5 个 Zustand store、客户端模板引擎、分页系统）**完全基于 AI 辅助编码完成**，在此过程中积累了系统化的 AI 协作工程方法论：

- **文档先行策略（Documentation-First）**：编码前先输出开发文档与方案设计，经评审后再进入实现阶段，确保 AI 生成的代码有明确的设计约束。
- **多级 AGENTS.md 上下文工程**：在仓库根目录、`pkg/`、`frontend/`、`templates/` 分别维护 AGENTS.md，为 AI Agent 提供分层、精确的项目上下文（架构约定、命名规范、数据契约），显著提升生成代码的准确性与一致性。
- **复杂业务逻辑的 AI 交付**：通过结构化 Prompt 驱动 AI 完成了非平凡的前端工程，包括：
  - 客户端模板引擎（Go `html/template` 语法的 TypeScript 子集实现，含布尔运算符）
  - iframe + `document.write()` 的实时预览渲染管线
  - A4 尺寸 CSS 分页系统（与后端导出对齐的 DOM 契约）
  - 拖拽排序、防抖自动保存、键盘快捷键等交互层
- **AI 协作效能**：通过合理的架构约束与上下文管理，让 AI 从"写片段"升级为"在既有架构内自主完成完整模块"，体现了对 AI 编码工具的工程化驾驭能力。

---

## 二、后端技术亮点

### 2.1 分层架构与依赖注入

- 以 `main.go` 为入口，通过 `go:embed` 将前端产物与模板编译期嵌入，产出**单二进制**可执行文件。
- `pkg/app/app.go` 作为 Composition Root，统一装配：配置 → 日志 → 存储层 → 模板加载 → 渲染器 → 导出管理器 → Wails 服务 → 事件注册。
- 所有服务通过 `Inject()` 方法接收依赖，支持运行时**依赖热重注入**（数据目录切换时自动重新注入全部存储与渲染依赖）。

### 2.2 SQLite 持久化层

- 使用 `modernc.org/sqlite`（**纯 Go 实现，无 CGO 依赖**），简化交叉编译。
- PRAGMA 调优：`WAL` 模式（读写并发）、`foreign_keys=ON`、`busy_timeout=5000ms`。
- **软删除设计**：`is_deleted` 标志位 + 索引覆盖，列表查询与删除互不阻塞。
- **数据版本迁移**：`model.Migrate()` 先解析 version 字段再选择反序列化路径，兼容历史数据（App 版本号误写入等边界情况）。
- **两层保存模型**：内存态（`current`）与持久态（DB 记录）分离，`AutoSave` 仅在用户显式保存后才生效，防止草稿意外落库；真正的写库方法 `saveResume` 为未导出方法，前端无法通过 IPC 直接触达。

### 2.3 无头浏览器导出引擎

- 基于 `rod`（Chrome DevTools Protocol）实现 PDF/PNG 导出，渲染前端的已分页 HTML。
- **浏览器实例管理**：惰性启动 + 跨导出复用 + 健康检查（`browser.Version()` 探活）+ 连接断开自动重启 + 重试机制，兼顾性能与鲁棒性。
- **精确纸张控制**：从 HTML 解析纸张规格（A4/Letter 等），通过 CDP `PagePrintToPDF` 设置 `PaperWidth/PaperHeight`、零边距、`PreferCSSPageSize`，确保导出与预览像素级一致。
- **PNG 全页截图**：先按纸张宽度初始化视口，通过 `scrollHeight` 测量文档真实高度后调整视口，避免截图底部空白。
- **批量导出**：首份文件确定输出目录，其余自动写入同目录，文件名去重（`dedupName`）+ 非法字符清洗（`sanitizeFilename`）。

### 2.4 配置系统

- **双文件配置架构**：数据目录内放完整配置（`config.json`，随数据迁移），锚点目录（便携模式=可执行文件目录，否则=系统配置目录）仅保留指向 `data_dir` 的轻量指针，下次启动据此定位。
- **原子写入**：先写 `.tmp` 再 `os.Rename`，避免写入中断产生半截文件。
- **热切换数据目录**：`SetDataDir` → 落盘配置 → 关闭旧 DB → 重开存储 → 重新注入依赖 → 通知前端，全程带锁保护；重开失败时回滚旧目录，防止应用进入不可用状态。
- **旧版迁移**：自动检测旧配置目录中的 `gosume.db` 等文件，一次性迁移至新数据目录。

### 2.5 事件系统与结构化日志

- 事件名以常量统一定义于 `event.go`，在 `app.go` 中注册，避免硬编码，支持扩展。
- `zap` 结构化日志 + 文件轮转（按大小/天数/备份数），写入数据目录下的 `log/` 子目录。
- 统一错误类型 `UserError`：`UserMsg` / `UserWrap` 向前端返回中文友好消息，`IsCancel` 检测用户取消对话框操作，避免误报错误。

### 2.6 模板系统与数据模型

- **统一 HTML 架构**：全应用共享一份 Go `html/template`（`templates/template.html`），模板包只提供 `template.json`（元数据）+ `styles.css`（样式），降低模板制作门槛。
- **隐藏字段过滤**：`WithoutHidden()` 使用 Go 泛型（`filterSlice[T]` / `filterGroup[T]`）统一过滤各条目数组与嵌套子项，返回不可变副本，与前端 `toGoShape` 语义对齐。
- 模板包导入（`.zip`）：校验 + 解压 + 存入 SQLite，支持用户自制模板。

### 2.7 Wails v3 服务绑定

- 后端服务实现 `application.Service` 接口，通过 `ServiceName()` 暴露给前端，方法名 PascalCase → 前端 `callService("ResumeService", "ExplicitSave")`。
- 5 个核心服务：`ResumeService`（简历 CRUD + 渲染）、`TemplateService`（模板管理）、`ExportService`（PDF/PNG 导出）、`FileService`（项目文件）、`SystemService`（配置与窗口）。

---

## 三、技术栈速览

| 层级 | 技术 |
|------|------|
| 桌面框架 | Wails v3 (alpha) — Go + WebView2 |
| 后端语言 | Go 1.25 |
| 前端 | React 18 + TypeScript strict（全量 AI Coding） |
| 数据库 | SQLite (modernc.org/sqlite, WAL 模式, 纯 Go) |
| 日志 | zap（结构化日志 + 轮转） |
| 导出引擎 | rod（无头 Chromium, CDP 协议） |
| 前端构建 | Vite 5 + Tailwind CSS 3 |
| 状态管理 | Zustand 5 |
| 表单 | react-hook-form + zod |

---

## 四、简历可用的一句话/两句话版本

### 精简版（1 句话）

> 基于 Wails v3（Go + WebView2）独立开发桌面级简历编辑器，后端使用 Go + SQLite（WAL 模式、软删除、数据版本迁移）+ 无头 Chromium 导出引擎，前端通过 AI Coding 全量生成，实践了文档先行 + 多级 AGENTS.md 上下文工程的 AI 协作开发方法论。

### 标准版（2-3 句话）

> 独立开发桌面级简历编辑器 Gosume（Go + Wails v3 + React），后端基于 Go 1.25 实现 SQLite 持久化层（纯 Go 驱动、WAL 模式、软删除、版本迁移）、无头 Chromium PDF/PNG 导出引擎（实例复用 + 健康检查 + 自动恢复）、热切换数据目录的配置系统及依赖注入架构。前端 40+ 组件与客户端模板引擎完全通过 AI Coding 驱动生成，建立了"文档先行 + 分层 AGENTS.md 上下文"的 AI 协作工程体系，单二进制跨三平台分发，内置 16 套模板。

---

## 五、可深聊的后端技术点（面试准备）

1. **纯 Go SQLite vs CGO SQLite 的取舍**：为什么选 modernc.org/sqlite，交叉编译与分发优势。
2. **WAL 模式与并发**：WAL 如何提升读写并发，busy_timeout 的作用，与软删除索引的配合。
3. **两层保存模型的设计动机**：防止草稿意外落库，显式保存与自动保存的状态分离，未导出方法保证前端无法绕过。
4. **无头浏览器实例管理**：惰性启动、健康检查、连接断开自动重启、CDP 调用链路。
5. **数据目录热切换**：回调链路（关日志 → 重开 DB → 重注入依赖 → 通知前端），失败回滚策略。
6. **原子配置写入**：`.tmp` + `rename` 的原子性保证，锚点指针的"提交点"设计。
7. **泛型隐藏过滤**：`filterSlice[T]` / `filterGroup[T]` 的设计，不可变副本，前后端语义对齐。
8. **go:embed 单二进制**：编译期嵌入前端产物与模板，分发优势 vs 动态加载的取舍。
