# Gosume

<div align="center">

[![中文](https://img.shields.io/badge/Lang-zh-red)](#中文) &nbsp;&nbsp; [![English](https://img.shields.io/badge/Lang-en-blue)](#english)

</div>

---


***Gosume*** 是一款桌面端简历制作工具，无需打开 Word 或排版软件，即可快速制作专业、美观的简历。

基于 **Go + Wails v3** 与 **React + TypeScript** 构建，提供实时预览、多套模板、一键导出 PDF / DOCX(暂未支持) / PNG(暂未支持)。

![Gosume 截图](screenshots/editor.png)

### 功能特性

- **实时预览** — 编辑内容即时渲染，所见即所得，无需手动刷新。
- **多模板支持** — 内置经典正式风、现代专业风两套模板，支持用户自行添加自定义模板。
- **丰富的数据模型** — 涵盖个人信息、工作经历、项目经历、教育背景、技能、语言、奖项、自定义模块。
- **多格式导出** — 支持导出为 PDF、DOCX、PNG，可调节缩放比例和页码范围。
- **自动保存** — 编辑内容自动持久化到本地 SQLite 数据库，告别数据丢失。
- **项目文件** — 支持保存和打开 `.resume.json` 文件，便于归档和版本管理。
- **键盘快捷键** — 完整的键盘操作支持（Ctrl+S 保存等），提升编辑效率。
- **拖拽排序** — 拖拽即可调整模块和条目的顺序。
- **示例数据** — 一键填充示例数据，快速体验模板效果。
- **数据目录可配置** — 自由选择数据存储位置，切换后热重载。
- **跨平台** — 支持 Windows、macOS、Linux 桌面端，以及 iOS / Android 移动端。

### 截图展示

<!-- TODO: 请替换为实际截图 -->

| 编辑器 | 模板选择 |
|--------|----------|
| ![编辑器](screenshots/editor.png) | ![模板选择](screenshots/templates.png) |

| 导出对话框 | 实时预览 |
|------------|----------|
| ![导出](screenshots/export.png) | ![预览](screenshots/preview.png) |

### 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | [Wails v3](https://wails.io) |
| 后端 | Go 1.25 |
| 前端 | React 18 + TypeScript |
| 样式 | Tailwind CSS |
| 状态管理 | Zustand |
| 表单校验 | React Hook Form + Zod |
| 数据库 | SQLite (modernc.org/sqlite) |
| 图标 | Lucide React |
| 日志 | Uber Zap |

### 快速开始

#### 环境要求

- Go 1.25+
- Node.js 18+
- [Task](https://taskfile.dev)（可选，用于构建脚本）

#### 开发调试

```bash
# 安装前端依赖
cd frontend && npm install && cd ..

# 启动开发模式（Go + 前端热重载）
task dev
```

#### 构建打包

```bash
# 为当前平台构建
task build

# 打包为可分发的安装包
task package
```

#### Docker（服务端模式）

```bash
# 构建 Docker 镜像
task build:docker

# 运行容器
task run:docker
```

### 项目结构

```
├── main.go              # 应用入口
├── pkg/
│   ├── config/          # 配置管理
│   ├── export/          # PDF、DOCX、PNG 导出
│   ├── log/             # 结构化日志（Zap）
│   ├── model/           # 简历数据模型
│   ├── render/          # HTML 模板渲染
│   ├── service/         # Wails 服务层（API）
│   ├── store/           # SQLite 持久化与项目文件
│   └── template/        # 模板加载与校验
├── templates/           # 内置简历模板
│   ├── classic/         # 经典正式风（单栏）
│   └── modern/          # 现代专业风（双栏）
├── frontend/            # React + TypeScript 前端
│   └── src/
│       ├── components/  # UI 组件（编辑器、预览、布局）
│       ├── stores/      # Zustand 状态管理
│       ├── services/    # 后端 API 绑定
│       └── routes/      # 页面级组件
└── build/               # 各平台构建配置
```

### 模板系统

Gosume 采用基于目录的模板系统，每个模板包含以下文件：

- `template.json` — 模板元数据、配色、特性、模块布局
- `template.html` — Go 模板，用于渲染简历
- `styles.css` — 模板专属样式

用户可将自定义模板放入模板数据目录即可使用。

### 开源协议

[MIT](LICENSE)

---

## English

Gosume is a desktop resume builder — create professional, polished resumes without touching a word processor.

Built with **Go + Wails v3** and **React + TypeScript**, Gosume delivers live preview, multiple templates, and one-click export to PDF, DOCX, and PNG.

![Gosume Screenshot](screenshots/editor.png)

### Features

- **Live Preview** — See every change rendered instantly as you type. No compile step, no refresh.
- **Multiple Templates** — Built-in templates (Classic, Modern) with support for custom user-created templates.
- **Rich Data Model** — Personal info, work experience, projects, education, skills, languages, awards, and custom sections.
- **Export Anywhere** — PDF, DOCX, and PNG export with configurable scaling and page range.
- **Auto-Save** — Your work is automatically persisted to a local SQLite database. Never lose progress.
- **Project Files** — Save and open `.resume.json` files for portability and version control.
- **Keyboard Shortcuts** — Full keyboard navigation for fast editing (Ctrl+S save, etc.).
- **Drag & Drop** — Reorder sections and items by dragging.
- **Sample Data** — One-click sample data to explore templates before filling in your own details.
- **Configurable Data Directory** — Choose where your data lives; hot-reloads on change.
- **Cross-Platform** — Windows, macOS, Linux desktop apps, plus mobile support (iOS/Android).

### Screenshots

<!-- TODO: Replace with actual screenshots -->

| Editor | Templates |
|--------|-----------|
| ![Editor](screenshots/editor.png) | ![Template Picker](screenshots/templates.png) |

| Export Dialog | Preview |
|---------------|---------|
| ![Export](screenshots/export.png) | ![Preview](screenshots/preview.png) |

### Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Framework | [Wails v3](https://wails.io) |
| Backend | Go 1.25 |
| Frontend | React 18 + TypeScript |
| Styling | Tailwind CSS |
| State Management | Zustand |
| Forms & Validation | React Hook Form + Zod |
| Database | SQLite (modernc.org/sqlite) |
| Icons | Lucide React |
| Logging | Uber Zap |

### Getting Started

#### Prerequisites

- Go 1.25+
- Node.js 18+
- [Task](https://taskfile.dev) (optional, for build scripts)

#### Development

```bash
# Install frontend dependencies
cd frontend && npm install && cd ..

# Run in development mode (hot-reload for both Go and frontend)
task dev
```

#### Build

```bash
# Build for current platform
task build

# Package for distribution
task package
```

#### Docker (Server Mode)

```bash
# Build the Docker image
task build:docker

# Run the container
task run:docker
```

### Project Structure

```
├── main.go              # Application entry point
├── pkg/
│   ├── config/          # Configuration management
│   ├── export/          # PDF, DOCX, PNG exporters
│   ├── log/             # Structured logging (Zap)
│   ├── model/           # Resume data models
│   ├── render/          # HTML template rendering
│   ├── service/         # Wails-bound services (API layer)
│   ├── store/           # SQLite persistence & project files
│   └── template/        # Template loader & validation
├── templates/           # Built-in resume templates
│   ├── classic/         # Classic formal single-column
│   └── modern/          # Modern two-column tech style
├── frontend/            # React + TypeScript frontend
│   └── src/
│       ├── components/  # UI components (editor, preview, layout)
│       ├── stores/      # Zustand state stores
│       ├── services/    # Backend API bindings
│       └── routes/      # Page-level components
└── build/               # Platform-specific build configs
```

### Template System

Gosume uses a directory-based template system. Each template contains:

- `template.json` — Metadata, colors, features, section layout
- `template.html` — Go template for rendering
- `styles.css` — Scoped CSS for the template

Users can add custom templates by placing them in the templates data directory.

### License

[MIT](LICENSE)

---

<div align="center">

**Gosume** — 你的简历，你来做主 / Your resume, crafted.

</div>
