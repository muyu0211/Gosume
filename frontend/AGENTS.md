# AGENTS.md

## 前端 — React/TypeScript

## 技术栈

* **React 18**，全部使用函数组件 + hooks

* **TypeScript** strict 模式，路径别名 `@/` → `src/`

* **Vite 5**，配合 `@vitejs/plugin-react` 和 `@wailsio/runtime/plugins/vite`

* **Tailwind CSS 3**，主题令牌定义在 `assets/styles/globals.css` 的 `html[data-theme=...]` 块（联席会议见下文「主题」）

* **zustand 5** 状态管理（不使用 Redux）

* **react-router-dom v7**，使用 HashRouter（适配 Wails 的 file:// 协议）；路由：`/` 欢迎页、`/editor` 编辑器、`/settings` 设置、`/community` 模板社区

* **react-hook-form 7** + **zod 4** 表单校验

* **lucide-react** 图标库

* **html2canvas** 客户端截图生成（证件照工具等）

## 目录结构

```
frontend/src/
├── App.tsx               # 路由 + 平台初始化 + 主题加载 + 关闭二确
├── routes/               # WelcomePage / EditorPage / SettingsPage / CommunityPage
├── components/
│   ├── layout/           # TitleBar / Sidebar / Toolbar / StylePanel / StatusBar
│   ├── editor/           # EditorPanel + 各区块编辑（Personal/Experience/Education/Skill/Language/Summary/Award/Custom/Extras）+ AIPolishControl
│   ├── preview/          # PreviewPanel（预览与分页）
│   ├── resume/           # ResumeListDrawer / ImportPreviewDialog
│   ├── template/         # TemplateSelector / TemplateSwitcher
│   ├── export/           # ExportDialog
│   ├── ai/               # AIConfigManagerDialog / ProviderLogo
│   ├── tools/            # ToolsPanel + 证件照 IdPhotoTool（含 aiMatting/mattingWorker/lib）
│   └── ui/               # Modal / ConfirmDialog / CustomSelect / Tooltip / RichTextField / 等通用组件
├── stores/               # resumeStore / templateStore / editorStore / themeStore / appStore
├── lib/                  # 模板引擎/分页/布局/主题/i18n/markdown/paper/…（见下文）
├── services/             # backend.ts（唯一 Wails 桥）+ 各领域 service 封装
├── hooks/                # useAutoSave / usePreview / useKeyboardShortcuts / useDragReorder
└── types/                # resume / template / export / community / gosume_file
```

## 架构模式

### 与后端通信（唯一入口 `services/backend.ts`）

所有 Go 服务调用统一走 `callService`。服务名 + 方法名直接映射 `包.结构体.方法`（见 `pkg/AGENTS.md` 服务层）：

```ts
import { callService } from '../services/backend'
const resume = await callService<Resume>('ResumeService', 'NewResume', templateId, 'zh-CN')
```

* **绑定全名 = `包路径.结构体名.方法名`**。`callService` 按 `SERVICE_PACKAGE_OVERRIDES`（大多数服务在默认包 `gosume/pkg/resume/service`；AIService / AutofillService / ToolService 例外）确定包路径。**新增服务目录时调用 `registerServicePackage` 登记映射**，勿改硬编码表。
* 非 Wails（纯 Vite 开发）下 `callService` 返回 `null`，各 store 有本地 fallback。

**统一响应解析**（与后端 `pkg/util/response.go` 对齐）：返回体含 `code` 字段时按 code 处理——

| code | 含义 | callService 行为 |
|------|------|----------------|
| 0 | 成功 | 返回 `data`（null/undefined → `null`） |
| 300 | 警告（非致命） | reject `ApiError`（`isWarn === true`） |
| 500 | 失败 | reject `ApiError`（`message` 为后端中文文案） |

无 `code` 字段的**旧式裸返回值**（如 `ExportService.Export` 返回 string、`ExportBatch` 返回 string[]、`UpdateService.GetDownloadProgress` 返回 int）原样透传。

**服务方法总表**（详见 `pkg/AGENTS.md` 服务方法表）：

| 服务 | 方法 |
|------|------|
| `ResumeService` | NewResume, GetResume, SetResume, GetTemplateID, InitResume, AutoSave, UpdateResumeMeta, ListResumes, LoadResume, ExplicitSave, GetResumeByID, DeleteResume |
| `TemplateService` | ListTemplates, GetTemplate, GetTemplateContent, ImportTemplatePackage, ImportSharePackage, ValidateForTemplate, CreateTemplate, UpdateTemplate, DeleteTemplate, CloneTemplate, ListCategories, ListTemplatesByCategory, SetTemplateFavorite, ListImportLogs, DeleteImportLog, ExportTemplatePackage |
| `ExportService` | Export, ExportBatch, GetResumeContentHeight |
| `FileService` | ExportFile, ParseFile, ImportFile |
| `SystemService` | ConfirmWindowClose, MinimizeWindow, MaximizeWindow, IsWindowMaximised, CloseWindow, QuitApp, GetAppVersion, GetDataDir, GetTheme, SetTheme, GetOS, GetAppDataDir, PickDataDir, SetDataDir, OpenExternalURL, ShowInFolder |
| `UpdateService` | GetDownloadProgress, CheckUpdate, DownloadUpdate, ApplyUpdate, CancelUpdate |
| `CommunityService` | GetCommunityInfo, ListCommunityTemplates, GetCommunityTemplate, DownloadCommunityTemplate, PublishCommunityTemplate, RateCommunityTemplate |
| `AIService` | ListAIConfigs, GetAIConfig, SaveAIConfig, SetActiveAIConfig, DeleteAIConfig, TestConnection, Chat, Polish |
| `AutofillService` | GetStatus, Start, Stop, RotateToken |
| `ToolService` | SaveImage |

### 错误处理

非 0 code 时 `callService` 抛 `ApiError`（`message` 已是面向用户的中文文案），直接可用于界面提示：

```ts
try {
  await callService('ExportService', 'Export', ...)
} catch (err) {
  // ApiError.message 即后端文案；也可用 isApiError(err) 判断
  setErrorMsg(extractErrorMessage(err, '导出失败，请重试'))
}
```

`extractErrorMessage`（`lib/errorUtils.ts`）按优先级：`ApiError.message`/`Error.message` → 对象 `message` 属性 → Wails 反序列化 `message` → fallback 字符串。用户主动取消的对话框操作后端返回 `code=0` 且 `data` 为空，前端据此视为正常返回，勿弹错。

### 状态管理（zustand）

| Store | 职责 | 核心状态 |
| ------ | ------ | ------ |
| `resumeStore` | 简历数据、CRUD、预览 HTML、脏标记、离开保护 | `resume`、`isDirty`、`filePath`、`currentId`、`resumeList`、`previewHtml`、`isPreviewLoading`、`avatarRenderedSize`、`nativeLayout`、`contentHeight`，数组操作辅助、`updateCustomCss`、`requestLeave/confirmLeaveSave`（未保存跳转二确） |
| `templateStore` | 模板列表 | `templates`、`selectedId`、`isLoading` |
| `editorStore` | 编辑器 UI | `activeSection`、`zoom`、`splitRatio`、`flashSection`（点击跳转高亮）、`stylePanelOpen`/`stylePanelWidth`（右栏宽 240–420，常量 `STYLE_PANEL_*`）、`grayscale`（黑白打印预览） |
| `themeStore` | 应用主题 | `mode`（system/classic/wheat/obsidian）、`applied`；`ensureLoaded`/`setMode`/`refreshSystem` |
| `appStore` | **应用 UI 语言**（非简历语言） | `language`（zh-CN/en-US），持久化 localStorage；`setLanguage` |

持久化变更通过后端服务完成；仅 UI 状态（面板折叠、拖拽中的本地状态等）保留在 store 本地。

### 应用 UI 语言（i18n）

应用界面语言与「简历语言」（`resume.meta.language`）**彻底解耦**：

* 设置页「语言」→ `appStore.language` → 只用 `i18n.ts` 取词；编辑页工具栏「中英切换」→ `resume.meta.language` → 只管简历渲染。
* 界面文案一律走 `lib/i18n.ts` 的 `t(key)`（非响应式，回调用）或 `useT()`（响应式 hook，组件内用），词表 `STRINGS` 结构为 `key → {zh, en}`，**禁止硬编码界面文案**。
* 词条长度规范：英文按钮/标签 ≤ 中文 1.5 倍宽；无法更短时组件须 `truncate`/`min-w-0` 可收缩，勿硬撑固定宽度。
* 板块标题/下拉/校验/占位/Tooltip/状态栏等均需接入；板块名不写死，见「模块名规范」。

### 主题（themeStore）

* 选项 `system | classic | wheat | obsidian`（跟随系统 / 经典 / 麦色 / 深色），`applied` 是解析后的三选一。
* `system` 依据 `prefers-color-scheme` 映射（浅→wheat，深→obsidian），监听 `matchMedia` 变化自动 `refreshSystem`。
* 实际以 `document.documentElement.dataset.theme` 写入 `<html data-theme>`，令牌变量在 `assets/styles/globals.css` 的 `html[data-theme=...]` 块。
* 持久化经 `SystemService.GetTheme/SetTheme`（config.json）。`ensureLoaded` 在 `App.tsx` 挂载时调用。

### 简历字段更新

字段更新通过 `resumeStore.updateField` 使用点号路径表示法：

```ts
updateField('personal.full_name', '张三')
updateField('jobs[0].company', '某公司')
```

### 自动保存

`useAutoSave` hook 监听 `isDirty`，防抖后调 `ResumeService.AutoSave`；`Ctrl+S` 调 `ExplicitSave`，`Ctrl+E` 导出。

### 预览与渲染（统一 HTML + per-resume custom_css）

简历 HTML 由应用内置的统一 HTML（`templates/template.html`，Go html/template 语法）承载，模板只提供 `template.json` + `styles.css`。渲染管线（完全在客户端完成，不经过 Go 后端）：

1. `renderTemplate`（`lib/templateEngine.ts`）把模板 CSS 合并进统一 HTML，按其 `paper_size`/`orientation` 打上 `.resume-page` 的 `data-paper-size`/`data-orientation` 属性；它同时注入 `globalCss`（`resume-global.css`，`<style id="resume-base">`，对所有模板生效）。
2. `injectGlobalVarsCss`（`lib/layoutPresets.ts`）把当前简历的 per-resume `custom_css` 注入为 `<style id="resume-custom">`（见下「页面布局」）；双栏模板上自动剥除 `header-layout` 头，防破坏侧栏。
3. `usePreview` hook 以 300ms 防抖生成 `previewHtml` 写入 `resumeStore`；单文件导出复用 `previewHtml`，批量导出对每份简历独立执行同流程。

模板引擎辅助函数与运算符（与 Go 端一致）：`dateRange`、`skillLevel`、`i18n`(lang,zh,en)、`nl2br`、`md`、`mdInline`、`safeHTML`、`safeURL`、`defaultVal`、`not / and / or / eq / ne`。

长文本字段（概述/亮点/总结）为所见即所得富文本，底层以 Markdown 源码存储，编辑器 `components/ui/RichTextField.tsx`，双向转换 `lib/markdown.ts`，模板用 `{{md}}`/`{{mdInline}}` 渲染。

### 页面布局（per-resume custom_css，`resume.custom_css`）

> 布局为**每份简历独立**，存于 `resume.custom_css`（不是全局 config）。所有样式定制以「带哨兵段的 CSS」承载，生成/解析/剥除见 `lib/customCss.ts`；空串 = 无定制 = 模板原生外观。**不再有** `SystemService.GetLayout/SaveLayout` 或 `layoutStore`。

支持的可定制项与可调范围（常量定义在 `lib/layoutPresets.ts`，**不得硬编码**）：

| 项 | 字段 | 范围 | 注入方式 |
|----|------|------|---------|
| 页边距 | `pageMarginY/X` | `MARGIN_PX_MIN..MARGIN_PX_MAX`（0–80px，Y/X 成对） | `:root` 设 `--resume-padding-y/-x/-padding`，前端按 `25.4/96` 换算 mm |
| 内容间距 | `spacingSection/Item/Detail` | `SPACING_PX_MIN..MAX`（0–40）、`DETIAL_SPACING_PX_MIN..MAX`（0–15） | 三段独立 `margin-bottom !important` 覆盖（选择器契约见 `templates/resume-global.css` 与 `customCss.ts` 常量） |
| 头像尺寸/圆角 | `avatarWidth/Height/Radius` | Radius 0–100（0 直角、100 圆形） | `.r-avatar img` `!important` |
| 信息区布局 | `headerLayout` | `center / avatar-left / avatar-right`（仅单栏生效） | header-layout 段；双栏模板剥除 |
| 全局字体 | `fontKey` | `lib/fontOptions.ts` 的 key | 覆盖 `--font-family/-heading/--mono` |
| 字号（四级） | `fontSizeName/Title/Body/Detail` | px，各自独立 | 四级选择器组 `!important` |

* `buildCustomCss(state)` 生成（空态返回空串），`parseCustomCss(css)` 反向解析供控件回显，`stripHeaderLayoutCss` 剥除信息区段；三者为恒等/可逆关系，供增量合并。
* 滑动条 nil 占位默认值 `DISPLAY_DEFAULT_LAYOUT`（仅 UI 显示起点，非渲染回退；渲染回退是模板原生外观）。
* `StylePanel` 是主要消费者；单栏布局调整按钮对**双栏模板禁用**（`cursor-not-allowed` + Tooltip）。

### 分页与导出

分页核心在 `lib/paginationCore.ts`（配合 `paginationLines.ts` 行级分页），预览和导出共用，保证所见即所得：

* `readPageStyle(doc)` 读取 `.resume-page` 的 padding/背景/纸张规格（`data-paper-size`），必须在调用方重绘 body 前调用。
* `paginateResume(doc, body, options)` 按纸张规格拆分，`paged`（固定尺寸，预览/PDF）与 `continuous`（连续，PNG）两种模式。
* 预览：`lib/paginate.ts` 的 `paginateContent(iframe)` 返回 `{pageCount, paper}`；导出：`lib/exportHtml.ts` 的 `paginateHTMLString(previewHtml, mode)` 在隐藏 iframe 分页后序列化，交给后端 `ExportService.Export`（PDF paged / PNG continuous）。
* 纸张规格单一来源：`lib/paper.ts`（A4/Letter 的 mm/px/in），换算走 `resolvePaper`/`DEFAULT_PAPER`。
* 分页前 `waitForDocumentReady(doc)` 等待字体与图片就绪。
* DOM 契约见 `templates/AGENTS.md`：`.resume-page > .resume-container > .r-header + .r-main`；单栏 block、双栏 grid。

### 模板导入 / 社区

* 导入 `.zip` 模板包：`services/templateService.ts` 的 `importTemplatePackage()` 弹原生文件选择框（`TemplateService.ImportTemplatePackage`），成功后刷新模板列表 + 重新生成缩略图；`ImportSharePackage` 走分享导入，配 `ImportPreviewDialog`。
* 模板市场：`CommunityPage` + `services/communityService.ts` 调 `CommunityService`（需联网）。

### 证件照工具（tools）

`components/tools/IdPhotoTool.tsx`：纯前端 canvas 处理（含 `aiMatting.ts`/`mattingWorker.ts` AI 抠图 Worker），支持导出 **JPG / PNG / WebP**；落盘经 `ToolService.SaveImage`（base64 + 原生保存对话框）。工具箱仅保留证件照一项（`ToolsPanel`）。

### AI 润色（AIPolishControl）

各编辑区块内的 `AIPolishControl` 调 `AIService.Polish({mode, semantic, text, lang})`；AI 配置在 `AIConfigManagerDialog`（多套配置、Key 脱敏、测试连接）。未配置时按钮不可用。AI 相关文案同样过 i18n。

## 开发规范

> **代码复用（核心原则：避免重复造轮子）。** 新增任何 UI / 逻辑 / 工具前，先判断项目里是否已有可复用的实现：
>
> * **UI 组件优先复用** `components/ui/` 的通用件（`Modal`、`ConfirmDialog`、`CustomSelect`、`Tooltip`、`RichTextField`、`AnimatedRange`、`VisibilityToggle`、`Expandable` 等）与 `components/layout/` 组件，**禁止自造同类组件**。确实需要新组件时，尽量做**通用、可配置（props 化）、可拓展**的通用件并放回 `components/ui/`，避免写死只在单处可用的样式逻辑。
> * **逻辑/常量优先复用** `lib/` 下的封装（`templateEngine`、`paginationCore`、`customCss`、`layoutPresets`、`paper`、`markdown`、`errorUtils`、`i18n`、`theme`、`fontOptions`、`resumeSections` 等）与 `hooks/`（`useAutoSave`、`usePreview` 等），新增能力前先搜索是否已存在同能力实现。
> * **样式组件可复用可拓展**：主轴方向是「一套通用组件 + props 驱动差异」，而非为每个场景复制一份组件；样式尽量用主题令牌 + Tailwind 组合，避免组件内硬编码不可改的魔法值。
> * 借助**成熟第三方库**（lucide-react、html2canvas、zod 等）而非自研，引入前确认能力覆盖且维护良好。

### 模态窗口规范（Modal）

所有模态窗口**必须**基于 `components/ui/Modal.tsx` 通用外壳（`useRef<ModalHandle>`，`width` 定制宽度），禁止手写 `fixed inset-0` overlay 或自造动画。Modal 内置：三阶段过渡（entering→open→exiting）、overlay/Escape 关闭、`max-h-[90vh]` 自适应、业务完成后 `modalRef.current?.close()`。

**进出场动画（已统一，勿改）**：
* 进入：卡片挂 `gosume-modal-in`（CSS `animation`：`scaleY 0.35→1` + `translateY` + 淡入，0.3s 回弹 easing）。挂载即无条件播放一次，不依赖时序/两帧。
* 退出：卡片挂 `gosume-modal-out`（`scaleY→0.6` + 淡出，0.2s），用 **`onAnimationEnd` 触发卸载**——必须用 `animation` + `animationend`（而非 `transition` + `transitionend`），否则覆盖层可能残留导致页面不可点击。
* 关键帧定义在 `assets/styles/globals.css` 的 `.gosume-modal-in/out`；新增/调整动画只改这里，勿在组件内另写。

**尺寸变化（内容高度增减）规范**：
* 不要在 Modal 内容上叠加 `Expandable`（grid 0fr↔1fr）或 JS 数值 height 测量——会造成「进入动画 + 二次展开」双重动画，或破坏 `flex flex-col overflow-hidden` 布局。
* 异步加载的模态（如 `AIConfigManagerDialog`）用**稳定最小高度**（内容区 `min-h-[380px]` 左右）避免加载完成时高度突变；内容在各自滚动区呈现。
* 全局 `interpolate-size: allow-keywords` 已启用，新版 WebView2 对微小高度变化可平滑过渡，无需额外 JS。

* `width`：默认 `w-[520px]`，内容少 `w-[480px]`，确认框 `w-[380px]`，配置管理类用 `w-[900px]`。
* 超高内容滚动：整体滚动用 `cardClassName="overflow-auto"`；固定 Header/Footer 用 `flex flex-col overflow-hidden` + Header/Footer `flex-shrink-0` + 内容 `flex-1 overflow-auto`（如 `AIConfigManagerDialog`：状态提示常驻 Footer）。
* 次级确认框用 `ConfirmDialog`（overlay 统一 `bg-black/25 backdrop-blur-sm`），靠 DOM 顺序叠层，勿再叠 z-index。
* 自定义浮层（下拉等）用 Portal 到 `document.body` + `fixed` + `z-[9999]`（参考 `CustomSelect.tsx`/`Tooltip.tsx`）；面板外部滚动时重算定位。

### Tooltip / 原生提示规范

交互元素（按钮、图标控件等）的提示统一遵循：

* **有可见文本标签的按钮不使用 Tooltip**：按钮内文字已表达语义（如「保存」「删除模板」「去设置」），无需再挂 Tooltip。
* **纯图标功能按钮/控件必须使用 `Tooltip`**：凡仅渲染图标、无可见文本、悬停需传达用途的交互元素，一律用 `components/ui/Tooltip` 包裹（`label` 走 `i18n` 的 `t()`，`side` 默认 bottom）。
* **全局禁用浏览器原生 `title` 作为提示**：不得在 `button`/`a` 等可交互元素上用 `title=` 做 tooltip。`title` 仅允许出现在**非交互**展示（如模板色点 `<span>` 标注颜色）或 Tooltip 鞭长莫及处，此等场景须用 `aria-label`/`aria-describedby` 保障无障碍。
* **无障碍与视觉提示并存**：`aria-label` 与 `Tooltip` 不冲突——图标按钮可同时放置（`aria-label` 供读屏，`Tooltip` 供视觉悬停）。

新增/调整任何按钮、图标交互时，先对照此规则自查：带文本 → 不用 Tooltip；纯图标 → 必须 Tooltip；禁止用原生 `title` 提示，保持全局一致。

### 通用规则

* 格式化：Prettier + ESLint。
* 禁止：`any` 类型、`var` 声明、硬编码魔法值（如直接写 100 代替 `SPACING_PX_MAX`）。
* **样式须适配主题**：所有界面颜色/背景/边框/阴影用主题令牌（`surface-*`/`primary-*`/`bg-elev` 及 `globals.css` 中的 CSS 变量），禁止硬编码 hex / `bg-white` / `text-black`，确保三套主题 + 跟随系统下均可读一致。
* 下拉/按钮风格统一：触发器 `bg-elev`/`surface` 边框 + hover 态；面板 Portal + `fixed` + `z-[9999]` + `animate-dropdown-enter`。同一功能多入口（如页边距/内容间距）外观交互完全一致。
* 图标按钮（可见性切换/删除）：默认彩色，hover 背景加深、图标加深；删除 `text-red-500` hover `bg-red-100 text-red-600`，`rounded-md`。Tooltip 仅用于图标按钮。
* 文本输入 hover：`transform: scale(1.01)` + `box-shadow` 内发光；按钮 hover：`scale-105` + 果冻动画，激活 `scale-95`。
* `input[type='range']` 必须设 `-webkit-user-drag: none` + `user-select: none`。
* 动态文本按钮/标签：`truncate min-w-0`；窄窗口只留图标（`hidden md:inline`）。

### 模块名规范（禁止写死）

简历各板块名称一律经 `lib/resumeSections.ts` 获取，禁止在组件/常量中写死模块名字符串：

* 导航/编辑区/删除确认等 UI 文案：`getSectionTitle(sectionId, language)`（单一来源 `SECTION_TITLES`，zh/en），语言取 `resume.meta.language`。
* 需展示模板实际渲染标题（如 StatusBar 板块统计）：解析 `previewHtml` 中标题文本，并用 `sectionTitleId` 映射回板块 id 配对。
* `SECTION_TITLE_FALLBACK` 仅作兼容推断，不作为新文案来源。
* 新增需显示板块名的 UI 复用上述逻辑，不要新增写死的模块名。
* 编辑区板块标题（个人信息/教育背景等）跟随**应用 UI 语言**（`useAppStore`），而非简历语言。

### 交互动画

* 模态窗口：进出场走 `gosume-modal-in/out`（见「模态窗口规范（Modal）」），**禁止**对 Modal 内容叠加 `Expandable`/height 数值过渡造成双重动画。
* 模板切换：纯透明度淡入（`animate-preview-enter`，0.28s）。
* 内容结构变化：FLIP 动画（`lib/morphPreview.ts`）按 `data-id`/`data-section`+index 匹配；保留块平移、新块淡入、删除块消失。
* 可折叠部分：CSS grid 动画（`grid-template-rows 0fr→1fr`，180ms）+ `overflow-hidden` + opacity/translateY（`Expandable` 组件）。

### React+TS 专属规则

* 组件风格：函数式组件（React.FC），禁止类组件。
* 类型：组件 props 用 interface，简单场景可用 type。
* 命名：组件 PascalCase、函数 camelCase、常量 UPPER_SNAKE_CASE。

```ts
// 正确示例
interface UserListProps {
  users: Array<{ id: number; name: string }>;
}
export const UserList: React.FC<UserListProps> = ({ users }) => {
  const handleClick = (id: number) => console.log(`User ID: ${id}`);
  return (
    <div className="user-list">
      {users.map(user => (
        <button key={user.id} onClick={() => handleClick(user.id)}>{user.name}</button>
      ))}
    </div>
  );
};
```

### 代码注释

* 代码应有详细规范的注释；
* 注释遵循社区主流风格：方法名、方法作用、方法参数等。

### 禁止操作

* 不得修改/删除：.env（密钥文件）、src/core（若存在核心类）、migrations/（若存在迁移）。
* 不得修改：package.json 中的依赖版本、CI/CD 流水线配置（.github/workflows/）。
* 不得提交：node_modules、IDE 配置（.vscode/）、未完成的测试代码。