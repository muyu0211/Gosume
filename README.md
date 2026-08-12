# Gosume

<div align="center">

[![Stars](https://img.shields.io/github/stars/muyu0211/Gosume?style=social)](https://github.com/muyu0211/Gosume)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go&logoColor=white)](https://go.dev)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Wails](https://img.shields.io/badge/Wails-v3-FF4081)](https://wails.io)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](#下载安装)

**⚡ 专业 · 简洁 · 高颜值 · 本地优先**

一款为开发者和职场人打造的**桌面级简历制作神器**。
无需排版知识，无需打开 Word — 选择模板 → 填写内容 → 一键导出，
**三步搞定一份高质量简历。**

[![中文](https://img.shields.io/badge/🌏-中文-red)](#中文) &nbsp;&nbsp; [![English](https://img.shields.io/badge/🌐-English-blue)](#english)

---

![Gosume 主界面](images/1.png)

</div>

---

## 中文

### ✨ 为什么选择 Gosume

| 🌟 核心优势 | 说明 |
|-----------|------|
| **🎯 所见即所得** | 编辑内容即时渲染为最终效果，告别反复调整格式的痛苦。输入什么，导出就是什么。 |
| **🎨 16 套精选模板** | 从经典正式风到极客终端风，覆盖互联网、金融、设计、学术等 **10+ 求职场景**，每套模板都经过像素级调校。 |
| **📤 高质量导出** | 基于无头浏览器 Chromium 渲染，支持 **PDF / PNG** 双格式。可调节纸张大小、缩放比例，批量导出一步到位。 |
| **💾 永不丢失** | 两层保存机制：首次手动保存后，**自动持久化**到本地 SQLite 数据库（WAL 模式），即使意外关闭也能完整恢复。 |
| **🔒 隐私至上** | **本地优先 (Local-First)** 架构，所有数据 100% 存储在你自己的电脑上，无需联网，无需注册账号，零隐私泄露风险。 |
| **📱 全平台覆盖** | 支持 **Windows / macOS / Linux** 桌面端，以及 **iOS / Android** 移动端，随时随地编辑你的简历。 |
| **🧩 模板可扩展** | 支持导入 `.zip` 模板包，懂 HTML+CSS 就能自制模板，同时提供模板生成SKILL，通过SKILL让agent自动生成适合自己的简历模板。 |
| **⚡ 原生性能** | 基于 **Wails v3** (Go + Webview2) 构建，单二进制分发，启动 < 1s，内存占用仅为 Electron 应用的 **1/5**。 |

---

### 🎨 内嵌 16 套模板 · 总有一款适合你

<div align="center">

| 模板 | 风格 | 适用场景 |
|:----:|:----:|:--------:|
| **Classic** 经典 | 单栏 · 沉稳大气 | 传统行业 · 国企 · 正式场合 |
| **Modern** 现代 | 双栏 · 简洁科技 | 互联网 · 科技行业 |
| **Creative** 创意 | 侧边栏 · 色彩鲜明 | 设计 · 创意 · 市场类 |
| **Minimal** 极简 | 留白 · 干净利落 | 外企 · 追求简洁 |
| **Compact** 紧凑 | 高密度 · 一页容纳 | 资深人士 · 内容较多 |
| **Executive** 高管 | 权威感 · 稳重 | 管理岗位 · 高管职位 |
| **Academic** 学术 | 严谨规范 | 高校 · 科研 · 读博申请 |
| **Gradient** 渐变 | 渐变色 · 年轻活力 | 新兴行业 · 创业公司 |
| **Bold** 黑金 | 高对比 · 霸气 | 高端职位 · 彰显个性 |
| **Ink** 水墨 | 中式美学 | 文化创意 · 教育行业 |
| **Leaf** 青叶 | 清新自然 | 环保 · 教育 · NGO |
| **Swiss** 瑞士 | 网格系统 · 排版考究 | 国际化企业 · 设计感 |
| **Split** 分栏 | 左右分明 | 内容模块清晰分类 |
| **Timeline** 时间线 | 时间轴布局 | 强调成长轨迹 |
| **Zen** 禅意 | 极简留白 | 日企 · 侘寂美学 |
| **Terminal** 终端 | 命令行风格 | 开发者 · 技术极客 |

</div>

![模板预览 - 经典正式风](images/2.png)
![模板预览 - 现代专业风](images/3.png)

---

### 🖥️ 沉浸式编辑体验

<div align="center">

**左侧编辑 · 右侧实时预览 · 焦点不丢失**

</div>

![编辑区域](images/4.png)
![编辑区域](images/5.png)
![编辑区域](images/6.png)
![编辑区域](images/7.png)
![编辑区域](images/8.png)

---

### 🚀 功能亮点速览

```
┌─────────────────────────────────────────────────────────────┐
│  ✋ 拖拽排序        拖拽即可调整模块和条目的展示顺序           │
│  ⌨️  键盘快捷键      完整键盘操作支持，Ctrl+S 保存、Ctrl+Z 撤销 │
│  📋 示例数据        一键填充示例简历，快速预览模板效果          │
│  📁 项目文件        保存 / 打开 .resume.json，多版本管理       │
│  🧩 自定义模板      放入模板目录或导入 .zip 包     │
│  🔐 本地优先        数据全在本地，离线可用，隐私安全           │
│  📦 批量导出        多份简历一次性导出，省时省力               │
│  📏 边距预设        内置多种页边距方案，一键切换               │
└─────────────────────────────────────────────────────────────┘
```

---

### 📥 下载安装

前往 **[GitHub Releases](https://github.com/muyu0211/Gosume/releases)** 页面下载对应平台的安装包。

| 平台 | 格式 | 说明 |
|------|------|------|
| 🪟 **Windows** | `.exe` / `.msi` / `.msix` | 支持 Win10 及以上 |
| 🍎 **macOS** | `.dmg` | 支持 Intel & Apple Silicon |
| 🐧 **Linux** | `.AppImage` / `.deb` | 主流发行版通用 |
| 📱 **iOS** | TestFlight / IPA | 详见 Release 说明 |
| 🤖 **Android** | `.apk` | 支持 Android 8.0+ |

---

### 🏗️ 技术架构

```
┌──────────────────────────────────────────────────────────────┐
│                        Gosume 架构                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────┐     Wails Service Bind             │
│  │  Frontend (React 18) │◄──────────────────────────────────►│
│  │  ├─ Zustand Store    │     callService("Svc", "Method")   │
│  │  ├─ Tailwind CSS     │                                    │
│  │  └─ Vite 5 (HMR)     │                                    │
│  └──────────┬───────────┘                                    │
│             │ runtime.Events()                               │
│  ┌──────────▼───────────┐                                    │
│  │   Backend (Go 1.25)  │                                    │
│  │  ├─ Service Layer    │  Resume / Template / Export / File │
│  │  ├─ Render (HTML)    │  Go html/template → 静态 HTML      │
│  │  ├─ Export (Rod)     │  无头 Chromium → PDF / PNG         │
│  │  ├─ Store (SQLite)   │  modernc.org/sqlite (纯 Go, 无CGO) │
│  │  └─ Config (JSON)    │  支持热切换数据目录                 │
│  └──────────────────────┘                                    │
│                                                              │
│  Build: 单二进制嵌入 frontend/dist + 16 套内置模板             │
└──────────────────────────────────────────────────────────────┘
```

**技术栈一览：**

| 层级 | 技术选择 |
|------|---------|
| 桌面框架 | Wails v3 (Go + Webview2) |
| 后端语言 | Go 1.25 |
| 前端框架 | React 18 + TypeScript strict |
| 打包工具 | Vite 5 |
| CSS 框架 | Tailwind CSS 3 |
| 状态管理 | Zustand 5 |
| 表单处理 | react-hook-form + zod 4 |
| 图标库 | lucide-react |
| 数据库 | SQLite (modernc.org/sqlite, WAL 模式) |
| 日志 | zap (结构化日志 + 轮转) |
| 导出引擎 | rod (无头 Chromium) |

---

### 🛠️ 开发指南

**环境要求：** Go 1.25+ · Node.js 18+ · npm / pnpm

```bash
# 克隆项目
git clone https://github.com/muyu0211/Gosume.git && cd Gosume

# 安装前端依赖
cd frontend && npm install && cd ..

# 启动开发模式（Wails Dev Server，前端热重载 + 后端热编译）
task dev

# 生产构建
task build

# 打包分平台安装包
task package
```

项目采用 **MIT 协议** 开源。欢迎提交 Issue、PR 和自制模板！ 🙌

---

## English

### ✨ Why Gosume

| 🌟 Core Advantages | Description |
|-------------------|-------------|
| **🎯 WYSIWYG** | Every edit renders instantly as the final output. What you see is **exactly** what you export. |
| **🎨 16 Handcrafted Templates** | From classic formal to terminal hacker style, covering **10+ industries** — tech, finance, design, academia, and more. Each template is pixel-perfect tuned. |
| **📤 High-Quality Export** | Rendered via headless Chromium for perfect fidelity. Supports **PDF / PNG** with adjustable paper size, scale, and **batch export**. |
| **💾 Never Lose Work** | Two-tier save system: auto-persist to local SQLite (WAL mode) after the first manual save. Survives unexpected crashes without data loss. |
| **🔒 Privacy First** | **Local-First architecture**. All data stays **100% on your device**. No internet required, no account signup, zero privacy risk. |
| **📱 Cross-Platform** | Available on **Windows / macOS / Linux** desktop, plus **iOS / Android** mobile — edit your resume anywhere. |
| **🧩 Extensible Templates** | Import `.zip` packages. Know HTML+CSS? Build your own template and share it. |
| **⚡ Native Performance** | Built with **Wails v3** (Go + Webview2). Single-binary distribution, < 1s cold start, **5x lighter** memory footprint vs Electron apps. |

---

### 🎨 16 Templates · Find Your Style

<div align="center">

| Template | Style | Best For |
|:--------:|:-----:|:--------:|
| **Classic** | Single-column · Timeless | Traditional · Conservative |
| **Modern** | Two-column · Clean | Tech · Startups |
| **Creative** | Sidebar · Bold Colors | Design · Marketing · Creative |
| **Minimal** | Whitespace · Elegant | Corporate · Modern Workplaces |
| **Compact** | High-Density · One-Page | Senior Pros · Rich Experience |
| **Executive** | Authoritative · Refined | Management · Executive Roles |
| **Academic** | Structured · Formal | Universities · Research · PhD |
| **Gradient** | Vibrant · Modern | Emerging Industries · Startups |
| **Bold** | High-Contrast · Striking | Senior Roles · Stand-Out Apps |
| **Ink** | Chinese Ink Aesthetic | Cultural · Creative · Education |
| **Leaf** | Fresh · Earthy Tones | Environment · Education · NGO |
| **Swiss** | Grid · Typography-Focused | Global Companies · Design |
| **Split** | Two-Column Layout | Clear Content Categorization |
| **Timeline** | Timeline-Based Layout | Career Progression Focus |
| **Zen** | Minimalist · Wabi-Sabi | Japanese Cos · Minimalist |
| **Terminal** | Command-Line Style | Developers · Tech Enthusiasts |

</div>

![Template Preview - Classic Formal](images/2.png)
![Template Preview - Modern Professional](images/3.png)

---

### 🖥️ Immersive Editing Experience

<div align="center">

**Edit on the left · Live preview on the right · Flow uninterrupted**

</div>

![Editing Area](images/4.png)
![Editing Area](images/5.png)
![Editing Area](images/6.png)
![Editing Area](images/7.png)
![Editing Area](images/8.png)

---

### 🚀 Feature Highlights

```
┌──────────────────────────────────────────────────────────────┐
│  ✋ Drag & Drop       Reorder sections and items by dragging   │
│  ⌨️  Keyboard Shortcuts  Ctrl+S save, Ctrl+Z undo, and more   │
│  📋 Sample Data       One-click fill to preview templates     │
│  📁 Project Files     Save / Open .resume.json for versioning │
│  🧩 Custom Templates  Drop in folder or import .gosume-pack   │
│  🔐 Local-First       All data local, offline-ready, private  │
│  📦 Batch Export      Export multiple resumes at once         │
│  📏 Margin Presets    Switch page margins with one click      │
└──────────────────────────────────────────────────────────────┘
```

---

### 📥 Download

Visit the **[GitHub Releases](https://github.com/muyu0211/Gosume/releases)** page to download the installer for your platform.

| Platform | Format | Notes |
|----------|--------|-------|
| 🪟 **Windows** | `.exe` / `.msi` / `.msix` | Win10+ recommended |
| 🍎 **macOS** | `.dmg` | Intel & Apple Silicon |
| 🐧 **Linux** | `.AppImage` / `.deb` | Mainstream distros |
| 📱 **iOS** | TestFlight / IPA | See Release notes |
| 🤖 **Android** | `.apk` | Android 8.0+ |

---

### 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Gosume Architecture                    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────┐     Wails Service Bind             │
│  │  Frontend (React 18) │◄──────────────────────────────────►│
│  │  ├─ Zustand Store    │     callService("Svc", "Method")   │
│  │  ├─ Tailwind CSS     │                                    │
│  │  └─ Vite 5 (HMR)     │                                    │
│  └──────────┬───────────┘                                    │
│             │ runtime.Events()                               │
│  ┌──────────▼───────────┐                                    │
│  │   Backend (Go 1.25)  │                                    │
│  │  ├─ Service Layer    │  Resume / Template / Export / File │
│  │  ├─ Render (HTML)    │  Go html/template → Static HTML    │
│  │  ├─ Export (Rod)     │  Headless Chromium → PDF / PNG     │
│  │  ├─ Store (SQLite)   │  modernc.org/sqlite (pure Go)      │
│  │  └─ Config (JSON)    │  Hot-swappable data directory      │
│  └──────────────────────┘                                    │
│                                                              │
│  Build: Single binary embeds frontend/dist + 16 templates     │
└──────────────────────────────────────────────────────────────┘
```

**Tech Stack:**

| Layer | Technology |
|-------|-----------|
| Desktop Framework | Wails v3 (Go + Webview2) |
| Backend | Go 1.25 |
| Frontend | React 18 + TypeScript strict |
| Bundler | Vite 5 |
| CSS | Tailwind CSS 3 |
| State Management | Zustand 5 |
| Forms | react-hook-form + zod 4 |
| Icons | lucide-react |
| Database | SQLite (modernc.org/sqlite, WAL mode) |
| Logging | zap (structured + rotation) |
| Export Engine | rod (Headless Chromium) |

---

### 🛠️ Development

**Prerequisites:** Go 1.25+ · Node.js 18+ · npm / pnpm

```bash
# Clone
git clone https://github.com/muyu0211/Gosume.git && cd Gosume

# Install frontend deps
cd frontend && npm install && cd ..

# Dev mode (Wails Dev Server + HMR + Hot reload)
task dev

# Production build
task build

# Package installers for all platforms
task package
```

Licensed under **MIT**. Issues, PRs and custom templates are welcome! 🙌

---

<div align="center">

**Made with 💜 by the Gosume Team**

**Gosume** — 你的简历，你来做主 / Your resume, crafted.

</div>
