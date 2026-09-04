# AGENTS.md

## 前端 — React/TypeScript

## 技术栈

* **React 18**，全部使用函数组件 + hooks

* **TypeScript** strict 模式，路径别名 `@/` → `src/`

* **Vite 5**，配合 `@vitejs/plugin-react` 和 `@wailsio/runtime/plugins/vite`

* **Tailwind CSS 3**，自定义主题配置在 `tailwind.config.ts`

* **zustand 5** 状态管理（不使用 Redux）

* **react-router-dom v7**，使用 HashRouter（适配 Wails 的 file:// 协议）

* **react-hook-form 7** + **zod 4** 表单校验

* **lucide-react** 图标库

* **html2canvas** 客户端截图生成

## 架构模式

### 与后端通信

所有 Go 服务调用统一通过 `services/backend.ts`：

```ts
import { callService } from '../services/backend'

const resume = await callService<Resume>('ResumeService', 'NewResume', templateId, 'zh-CN')
```

服务名和方法名与 Go 端定义一一对应：

| 服务                | 可调用方法                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ResumeService`   | NewResume, LoadResume, GetResumeByID, ExplicitSave, AutoSave, DeleteResume, SetResume, GetCurrentID, ListResumes, UpdateResumeMeta                        |
| `TemplateService` | ListTemplates, GetTemplate, GetTemplateContent, ImportTemplatePackage, CreateTemplate, UpdateTemplate, DeleteTemplate, CloneTemplate, ValidateForTemplate |
| `ExportService`   | ExportHTML, ExportBatchHTML                                                                                                                               |
| `FileService`     | OpenFile, SaveFile, GetRecentFiles                                                                                                                        |
| `SystemService`   | GetAppInfo, GetConfig, SetConfig, SetDataDir, GetDefaultDataDir, OpenDataDir, GetSystemInfo                                                               |

在纯 Vite 开发模式下（无 Wails 运行时），`callService` 返回 `null`，各 store 有本地 fallback 逻辑。

### 错误处理

所有 Go 服务方法返回的错误统一使用中文用户友好消息（`UserError`）。前端通过 `lib/errorUtils.ts` 中的 `extractErrorMessage` 统一提取：

```ts
import { extractErrorMessage } from '../lib/errorUtils'

try {
  await callService('ExportService', 'ExportPDF', ...)
} catch (err) {
  setErrorMsg(extractErrorMessage(err, '导出失败，请重试'))
}
```

`extractErrorMessage` 按优先级处理：Error.message → Wails JSON 序列化错误中的 `message` 字段 → 对象的 `message` 属性 → fallback 字符串。

### 模板导入

用户在欢迎页或编辑器模板切换器中可导入 `.zip` 模板包。前端通过 `services/templateService.ts` 的 `importTemplatePackage()` 调用后端：

```ts
import { importTemplatePackage, loadTemplateMetas } from '../services/templateService'

const result = await importTemplatePackage()  // 弹出原生文件选择对话框
if (result) {
  setTemplates(await loadTemplateMetas())      // 刷新模板列表
  setActiveTemplate(result.id)                  // 切换到新模板
}
```

导入成功后需刷新模板列表并重新生成缩略图。仅在 Wails 桌面环境下可用，纯浏览器模式下抛出错误。

### 状态管理

三个 zustand store：

| Store           | 职责         | 核心状态                                                     |
| --------------- | ---------- | -------------------------------------------------------- |
| `resumeStore`   | 简历数据与 CRUD | `resume`、`isDirty`、`currentId`、`resumeList`，以及所有数组操作辅助方法 |
| `templateStore` | 模板列表       | `templates`、`selectedId`、`isLoading`                     |
| `editorStore`   | 编辑器 UI     | 当前编辑区块、撤销栈、预览设置                                          |

### 简历字段更新

字段更新通过 `resumeStore.updateField` 使用点号路径表示法：

```ts
updateField('personal.full_name', '张三')
updateField('jobs[0].company', '某公司')
```

### 自动保存

`useAutoSave` hook 监听 `isDirty` 状态，在防抖延迟后调用 `ResumeService.AutoSave`。手动保存（`Ctrl+S`）调用 `ResumeService.ExplicitSave`。

### 预览与渲染（统一 HTML）

Gosume 一期改造后，简历 HTML 由应用内置的统一 HTML（`templates/template.html`）承载，模板只提供 `template.json`（元数据）+ `styles.css`（样式）。前端 `renderTemplate`（`lib/templateEngine.ts`）在客户端把模板 CSS 内联进统一 HTML 并渲染为完整 HTML，随后 `injectLayoutCss`（`lib/layoutPresets.ts`）注入页边距变量与内容间距规则；`renderTemplate` 还会把模板的 `paper_size`/`orientations` 标注为 `.resume-page` 的 `data-paper-size`/`data-orientation` 属性。

`usePreview` hook 以 300ms 防抖生成 `previewHtml` 写入 `resumeStore`。不经过 Go 后端——后端内存仅在显式保存时同步，确保每次按键即时反映。单文件导出（ExportDialog）直接复用 `previewHtml`；批量导出（ResumeListDrawer）对每份简历独立执行相同的渲染 + 注入流程。

模板引擎（`lib/templateEngine.ts`）是 Go `html/template` 语法的前端实现，提供以下辅助函数与运算符：

| 辅助函数                               | 用途                                                 |
| ---------------------------------- | -------------------------------------------------- |
| `dateRange(start, end, isCurrent)` | 日期范围，在职/无结束日期显示"至今"                                |
| `skillLevel(level)`                | 输出 5 个 `.skill-dot`/`.skill-dot.filled` 等级点        |
| `i18n(lang, zhKey, enKey)`         | 根据简历语言切换中英文                                        |
| `nl2br(s)`                         | 换行转 `<br>`，自动 HTML 转义                              |
| `md(s)`                            | 受限子集 Markdown → HTML（段落 + 列表 + 行内，已消毒；单换行转 `<br>`） |
| `mdInline(s)`                      | 受限子集 Markdown → 仅行内 HTML（亮点条目用，不产生块级标签）            |
| `safeHTML(s)`                      | 输出原始 HTML（仅限已确保安全的内容）                              |
| `safeURL(s)`                       | 标记可信 URL（头像 data URI 不被转义）                         |
| `defaultVal(fallback, val)`        | 值为空时返回默认值                                          |
| `not / and / or / eq / ne`         | Go 布尔运算符（`{{if .Jobs}}` 等条件渲染）                     |

### 分页与导出

分页核心在 `lib/paginationCore.ts`，预览和导出共用，保证"所见即所得"：

* `readPageStyle(doc)` 读取 `.resume-page` 的 padding/背景/纸张规格（`data-paper-size`），必须在调用方重绘 body 之前调用。

* `paginateResume(doc, body, options)` 把 `.resume-container` 内容按纸张规格拆成多页 `.resume-page`，支持 `paged`（固定尺寸分页，预览/PDF）与 `continuous`（单页连续，PNG）两种模式。

* 预览：`lib/paginate.ts` 的 `paginateContent(iframe)` 返回 `{ pageCount, paper }`，`PreviewPanel` 据此设预览宽度与页数。

* 导出：`lib/exportHtml.ts` 的 `paginateHTMLString(previewHtml, mode)` 在隐藏 iframe 中分页后序列化，交给后端 `ExportService.ExportHTML` 转 PDF（paged）或 PNG（continuous）。

* 纸张规格单一来源：`lib/paper.ts`（A4/Letter 的 mm/px/in 三套单位），所有尺寸换算走 `resolvePaper`/`DEFAULT_PAPER`，不再硬编码 A4 像素。

* 分页前 `waitForDocumentReady(doc)` 等待字体与图片就绪，避免测量高度偏小导致分页错位。

分页 DOM 契约（与 `templates/AGENTS.md` 对齐）：`.resume-page > .resume-container > .r-header + .r-main`；单栏 `.resume-container` 为 block，双栏为 grid（`.r-header` 即侧栏）。

### 页面布局

`LayoutPopover`（Toolbar 内）提供「页边距」（上下/左右）与「内容间距」（模块/条目/细节）两组**1px 拖动条**，以 **px 数值**存于全局配置（`lib/layoutPresets.ts` 的 `GlobalLayout`，经 `SystemService.GetLayout/SaveLayout` 读写，运行时经 `stores/layoutStore.ts` 加载），所有简历共享：

* 页边距范围 `MARGIN_PX_MIN..MARGIN_PX_MAX`（1–60px），内容间距 `SPACING_PX_MIN..SPACING_PX_MAX`（1–20px）；范围/默认常量引用 `lib/layoutPresets.ts`，不得硬编码

* 渲染时前端将 px 按 `25.4/96` 换算为 mm 注入（页边距为 `--resume-padding[-y/-x]`，内容间距三层注入 `margin-bottom !important`）

* 内容间距分三层注入（模块 ↔ 模块 / 条目 ↔ 条目 / 细节 ↔ 细节），集合在 `lib/layoutPresets.ts` 的 `buildLayoutCss`

* 覆盖的选择器清单与模板侧规范见 `templates/AGENTS.md` 的"全局布局"小节，新增参与间距调整的组件需两侧同步

## 开发规范

### 模态窗口规范（Modal）

所有模态窗口**必须**基于 `components/ui/Modal.tsx` 通用外壳，禁止手写 `fixed inset-0` overlay 或自造动画：

```tsx
import { useRef } from 'react'
import { Modal, type ModalHandle } from '../ui/Modal'

export function XxxDialog({ onClose }: Props) {
  const modalRef = useRef<ModalHandle>(null)

  return (
    <Modal ref={modalRef} onClose={onClose} width="w-[520px]" cardClassName="...">
      {/* Header / Content / Footer */}
    </Modal>
  )
}
```

统一行为（Modal 内置，无需重复实现）：

* 三阶段过渡动画：entering → open → exiting（overlay 淡入淡出 + 卡片 opacity/scale/translate-y，200ms）；

* overlay 点击关闭、Escape 关闭；

* 卡片 `max-h-[90vh]` 居中，随窗口大小自适应；

* 业务完成后主动关闭：`modalRef.current?.close()`（触发退场动画后再调 `onClose`）；父组件在 `onClose` 中卸载。

尺寸与布局：

* `width` 控制卡片宽度（默认 `w-[520px]`）；内容少用 `w-[480px]`，确认框用 `w-[380px]`；

* 内容可能超高需要滚动时，二选一：

  * **整体滚动**：`cardClassName="overflow-auto"`（如 ExportDialog）；

  * **固定 Header/Footer**：`cardClassName="flex flex-col overflow-hidden"`，Header/Footer 加 `flex-shrink-0`、内容区加 `flex-1 overflow-auto`（如 ImportPreviewDialog）；

* Header 行高默认 `px-6 py-3`，图标盒 `w-8 h-8 rounded-lg`、图标 `w-4 h-4`、标题 `text-base`（紧凑风格，新增对话框遵循）。

次级确认框（覆盖在模态之上）：

* 用 `ConfirmDialog`，勿自绘；其 overlay 统一 `bg-black/25 backdrop-blur-sm`（ConfirmDialog / UnsavedChangesDialog 已内置）；

* 嵌套时靠 DOM 顺序自然叠层（同为 z-50），勿再叠加更高 z-index。

自定义浮层（下拉等）：

* 浮层面板用 Portal 渲染到 `document.body` + `fixed` 定位 + `z-[9999]`，脱离模态 overflow 裁剪（参考 `components/ui/CustomSelect.tsx`）；

* 面板内部滚动不应触发关闭；外部滚动时重算定位跟随触发元素。

### 通用规则

* 代码格式化工具：Prettier + ESLint

* 禁止使用：any 类型、var 声明、硬编码魔法值（如直接写 100 代替 MAX\_PAGE\_SIZE）

* **样式须适配 Gosume 主题**：所有界面颜色/背景/边框/阴影一律使用主题令牌（`surface-*`/`primary-*`/`bg-elev` 及 `globals.css` 中的 CSS 变量），禁止在组件里硬编码与主题相关的 hex / `bg-white` / `text-black` 等，确保三套主题（经典/麦色/深色）与"跟随系统"下均可读、一致。

* **下拉/按钮风格一致**：工具栏按钮及点击展开的下拉面板样式必须保持统一——触发器用 `bg-elev`/`surface` 边框 + hover 态，面板用 Portal + `fixed` + `z-[9999]` + `animate-dropdown-enter`（参考 `CustomSelect.tsx` 与 `Tooltip.tsx`）；同一功能的多个入口（如"页边距""内容间距"两个下拉按钮）视觉与交互需完全一致。

### 模块名规范（禁止写死）

简历各板块的**名称一律通过** **`lib/resumeSections.ts`** **获取，禁止在组件或常量中写死**模块名字符串，避免与模板标题 / 本地化文案脱节——后续修改模板 i18n 只需改一处：

* **导航 / 编辑区 / 删除确认等 UI 文案**：用 `getSectionTitle(sectionId, language)` 取本地化标题（单一来源 `SECTION_TITLES`，zh/en），语言取 `resume.meta.language`：

  ```ts
  const language = useResumeStore((s) => s.resume?.meta?.language)
  <span>{getSectionTitle('education', language)}</span>   // 教育背景 / Education
  ```

* **需要展示模板实际渲染标题的场景（如 StatusBar 板块统计）**：解析 `previewHtml` 中 `.r-main .section-title` / `.r-langs .r-subtitle` 的文本（含用户自定义模块名），并用 `sectionTitleId` 把渲染标题映射回板块 id 以配对计数。

* **已知消费方**：Sidebar 导航、EditorPanel 及各编辑组件（Education/Skill/Language/Summary/Personal/Custom）、ItemDeleteConfirmDialog、StatusBar。新增任何需要显示板块名的 UI 都应复用上述逻辑，不要新增写死的模块名。

* **`SECTION_TITLE_FALLBACK`**：仅在模板未带 `data-section`（如运行中 App 的嵌入式模板未更新）时用于推断板块 id，属兼容手段，不应作为新文案的源头。

### React+TS 专属规则

* 组件风格：优先使用函数式组件（React.FC），禁止使用类组件

* 类型定义：使用 interface 定义组件 props，简单场景可使用 type

* 命名规范：

  * 组件名：PascalCase（如 UserList）

  * 函数名：camelCase（如 handleUserClick）

  * 常量名：UPPER\_CASE\_SNAKE\_CASE（如 MAX\_PAGE\_SIZE）

* 示例：

```ts
// 正确示例
interface UserListProps {
  users: Array<{ id: number; name: string }>;
}
export const UserList: React.FC<UserListProps> = ({ users }) => {
  const handleClick = (id: number) => {
    console.log(`User ID: ${id}`);
  };
  return (
    <div className="user-list">
      {users.map(user => (
        <button key={user.id} onClick={() => handleClick(user.id)}>
          {user.name}
        </button>
      ))}
    </div>
  );
};
```

### 代码注释

* 代码应有详细规范的注释；

* 注释应符合社区主流注释风格：方法名，方法作用，方法参数等

### 禁止操作

* 不得修改/删除：.env（密钥文件）、src/core（核心工具类）、migrations/（迁移文件）

* 不得修改：package.json 中的依赖版本、CI/CD 流水线配置（.github/workflows/）

* 不得提交：node\_modules 目录、IDE 配置文件（.vscode/）、未完成的测试代码

