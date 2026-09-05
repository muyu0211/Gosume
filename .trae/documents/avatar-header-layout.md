# 完善信息区（头部）布局切换逻辑 + 双栏模板禁用

## Context（背景与目标）

编辑器「信息区布局」按钮此前仅是前端 UI（本地 `useState` 三态，`PersonalSection.tsx`），未接任何渲染逻辑。现状是模板私有 CSS（`templates/*/styles.css`）通过 `.r-header` 的 `grid-template-areas` 各自决定头像排布（居中/居左/居右）。

目标：

1. 让布局三态（居中 `center` / 头像居左 `avatar-left` / 头像居右 `avatar-right`）真正生效——通过运行时的样式覆盖，统一作用于**预览、PDF/PNG 导出**。
2. 支持「跟随模板」（nil）回到模板原生布局，零回归。
3. 双栏模板（`.r-header` 是侧栏）不支持改布局：布局按钮**渲染但禁用 + Tooltip 提示**（按钮位置稳定、Tooltip 组件现成，改动量小）。

## 关键机制（已核实）

- 渲染链路单一：`renderTemplate(tmpl, resume)` → `injectGlobalVarsCss(rendered, layout, personal)`，预览（`usePreview.ts`/`PreviewPanel.tsx`）、测量（`resumeStore.measureHeight`）、导出（`ExportDialog.tsx`、`ResumeListDrawer.tsx`）全部走它。**在这里注入即在所有端生效，无需改任何调用点。**

- 现有 `buildGlobalVarsCss` 已注入 `.r-avatar img` 的 `!important` 尺寸/圆角覆盖（`frontend/src/lib/layoutPresets.ts`），布局覆盖复用同一 `<style id="resume-global-vars">` 渠道。

- 统一 DOM 契约：`.r-header` 含 `.r-header-text`/`.r-avatar`/`.r-contact`/`.r-langs`，网格区域名恒为 `text`/`avatar`/`contact`/`langs`（`templates/template.html`）。→ 单一 `.r-header` 覆盖可达**所有单栏模板**。

- 双栏识别：模板无元数据字段。但双栏模板 `styles.css` 的 `.resume-container` 必有 `display:grid` + `grid-template-columns`；单栏恒为 `max-width:100%`。前端经 `loadTemplateContent` 可拿到模板 css 文本。

  - 双栏（4）：`creative`、`split`、`business-navy-sidebar`、`warm-coral-sidebar-right`

  - 单栏（20）：余下全部（含 `indigo-pro-right`/`jade-bamboo-left`/`rose-petal-left`/`mono-minimal-center` 等 header 内双列但容器单栏的模板）。

### 跨模板全局泄漏（必须门控）

`GlobalLayout` 是**全局共享**（config.json）。若在单栏模板设置布局后切到双栏模板，朴素覆盖会破坏侧栏。因此覆盖必须**在注入时按「当前渲染 html 内联的模板 css」判断是否单栏，仅单栏才注入**。该判断可自包含在 `injectGlobalVarsCss` 内部（从 `html` 解析首个 `<style>` 即模板 css），无需改动任何调用点的签名。

## 实施步骤

### 1. 后端字段 — `pkg/user_config/layout_presets.go`

- `GlobalLayout` 增加字段（镜像 `AvatarRadius *int` 的 nil 语义）：

  ```go
  HeaderLayout *string `json:"header_layout,omitempty"` // center|avatar-left|avatar-right; nil=跟随模板
  ```

- 常量：`HeaderLayoutCenter = "center"`，`HeaderLayoutLeft = "avatar-left"`，`HeaderLayoutRight = "avatar-right"`。

- `DefaultGlobalLayout()`：`HeaderLayout: nil`（默认跟随模板，零回归）。

- `ValidateGlobalLayout()`：非 nil 时校验取值在三个常量之一，否则报错「信息区布局取值需为 center/avatar-left/avatar-right 之一」。

- `pkg/resume/service/system_service.go`：结构无需改（GetLayout/SaveLayout 整个 struct 事务）。可选：`SaveLayout` 日志（L164-165）补记 header layout 值，与 avatarRadius 对齐。

### 2. 前端类型 / 常量 / 注入 — `frontend/src/lib/layoutPresets.ts`

- 类型与默认：

  ```ts
  export type HeaderLayout = 'center' | 'avatar-left' | 'avatar-right'
  export interface GlobalLayout { /* 现有 */ headerLayout?: HeaderLayout | null }
  export const HEADER_LAYOUT_VALUES = ['center','avatar-left','avatar-right'] as const
  // DEFAULT_GLOBAL_LAYOUT 增加 headerLayout: null
  ```

- 双栏启发式：

  ```ts
  export function isDoubleColumnCss(css: string): boolean {
    const blocks = css.match(/\.resume-container\s*\{[^}]*\}/g)
    return !!blocks && blocks.some(b => /display\s*:\s*grid/i.test(b) && /grid-template-columns\s*:/i.test(b))
  }
  ```

- 三态覆盖规则串 `headerLayoutOverlayCss(hl: HeaderLayout | null): string`（见下方「注入规则」；返回空串表示不注入）。

- `buildGlobalVarsCss` 保持纯函数（只产基础规则）；门控放 `injectGlobalVarsCss`：

  ```ts
  function extractTemplateCss(html: string): string {
    return html.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? ''
  }
  export function injectGlobalVarsCss(html, layout, personal) {
    const single = !isDoubleColumnCss(extractTemplateCss(html))
    const hl = single ? (layout.headerLayout ?? null) : null   // 双栏恒不注入
    const rule = buildGlobalVarsCss(layout, personal)
      + (hl ? '\n' + headerLayoutOverlayCss(hl) : '')
    return injectStyleTag(html, rule, GLOBAL_VARS_STYLE_ID)
  }
  ```

### 注入规则（`.r-header`，全部 `!important`，仅`.r-header`不触碰 `.resume-container`，分页核心对单/双栏的 computed 检测不受影响）

- **center**（单列纵排居中）：
  `.r-header{grid-template-columns:1fr!important;grid-template-areas:"avatar" "text" "contact" "langs"!important;text-align:center!important;}`
  `.r-avatar{grid-area:avatar!important;margin:0 0 8pt 0!important;justify-self:center!important;}`
  `.r-header-text{grid-area:text!important;text-align:center!important;}`
  `.r-contact{grid-area:contact!important;justify-self:center!important;}`
  `.r-langs{grid-area:langs!important;justify-self:center!important;}`

- **avatar-left**（头像居左，文字/联系/语言在右）：
  `.r-header{grid-template-columns:auto 1fr!important;grid-template-areas:"avatar text" "avatar contact" "avatar langs"!important;align-items:center!important;text-align:left!important;column-gap:12pt!important;}`
  `.r-avatar{grid-area:avatar!important;margin:0!important;justify-self:center!important;}`
  `.r-header-text{grid-area:text!important;text-align:left!important;}`
  `.r-contact{grid-area:contact!important;}`
  `.r-langs{grid-area:langs!important;}`

- **avatar-right**（头像居右，文字/联系/语言在左）：
  `.r-header{grid-template-columns:1fr auto!important;grid-template-areas:"text avatar" "contact avatar" "langs avatar"!important;align-items:center!important;text-align:left!important;column-gap:12pt!important;}`
  `.r-avatar{grid-area:avatar!important;margin:0!important;justify-self:center!important;}`
  `.r-header-text{grid-area:text!important;text-align:left!important;}`
  `.r-contact{grid-area:contact!important;}`
  `.r-langs{grid-area:langs!important;}`

要点：`auto`/`1fr` 列撑开左右分栏，头像列自适应图片宽度且跨 3 行、`align-items:center` 垂直居中；`text-align` 统一居中或居左；对 `.r-avatar` 清 `margin` 抵消居中模板自带的 `8pt` 下边距；四子块统一 `grid-area:!important`，即使将来模板改名也稳健。

### 3. UI 状态 — `frontend/src/components/editor/PersonalSection.tsx`

- 用全局 layoutStore 替代本地 `headerLayout` state（约 L109）：

  ```ts
  import { type HeaderLayout } from '../../lib/layoutPresets'
  const headerLayout: HeaderLayout | null = layout.headerLayout ?? null
  const setHeaderLayout = (v: HeaderLayout | null) => setLayout({ headerLayout: v })
  ```

- 双栏检测（用 `resume.meta.template_id`，比 activeTemplateId 更贴近实际渲染；失败保守视为单栏）：

  ```ts
  const [isDoubleColumn, setIsDoubleColumn] = useState(false)
  useEffect(() => {
    if (!resume?.meta?.template_id) return
    let alive = true
    loadTemplateContent(resume.meta.template_id)
      .then(t => { if (alive) setIsDoubleColumn(isDoubleColumnCss(t.css)) })
      .catch(() => {})
    return () => { alive = false }
  }, [resume?.meta?.template_id])
  ```

- **「跟随模板」第四项**（key=`null`）：因为全局 nil 语义，必须有方式回到 null，否则设定一次即永久非 null。加到 `HEADER_LAYOUT_PRESETS` 渲染循环前：纯文字按钮（「跟随模板」），`active` 当 `headerLayout === null`，点击 `setHeaderLayout(null)`。`active` 判定改为 `headerLayout === preset.key`（类型 `HeaderLayout | null`）。`LayoutMiniPreview` 只画三态图形；nil 项用纯文字 label。

- **双栏禁用**：`const disabled = isDoubleColumn`；按钮加 `disabled={disabled}`，Tooltip `label={disabled ? '双栏模板由侧栏固定，不支持切换布局' : preset.label}`；样式上 `disabled` 时降透明度、`cursor-not-allowed`。推荐「渲染但禁用」而非隐藏（按钮位置稳定；切换单/双栏模板时面板不跳动）。

### 4. 增量预览 — `frontend/src/components/preview/PreviewPanel.tsx`

- `layoutKey` 数组（L200-201）追加 `String(l.headerLayout ?? '')`，使布局切换触发 styles-only 增量更新（增量规则取自最新 full-render 的 `parts.globalVarsRule`，继承门控正确性）。

- 无需改动 `usePreview.ts`、`resumeStore.ts`、`ExportDialog.tsx`、`ResumeListDrawer.tsx`（门控在 `injectGlobalVarsCss` 内自包含，previewHtml 每次全量刷新即带正确覆盖规则）。

### 实施顺序

(1) 后端 struct+默认+校验 → (2) `layoutPresets.ts` 类型/常量/启发式/覆盖/门控 → (3) `PersonalSection` UI（读全局、nil 项、双栏禁用）→ (4) `PreviewPanel` layoutKey。其中 (2) 完成后即可手工设 `layout.headerLayout` 验证三态渲染，再接 UI。

## 涉及文件

- `pkg/user_config/layout_presets.go`（struct/默认/校验）

- `frontend/src/lib/layoutPresets.ts`（类型、默认、`isDoubleColumnCss`、`headerLayoutOverlayCss`、`injectGlobalVarsCss` 门控）

- `frontend/src/components/editor/PersonalSection.tsx`（布局按钮接全局、跟随模板项、双栏禁用+提示）

- `frontend/src/components/preview/PreviewPanel.tsx`（layoutKey 追加）

- `pkg/resume/service/system_service.go`（可选：SaveLayout 日志补记）

## 验证（端到端）

1. `task dev`，打开单栏模板（如 classic），`header_layout` 未设时注入的 `<style id="resume-global-vars">` **不含** `.r-header` 规则（回归检查）。
2. 点击 头像居左/居右/居中 → 预览即时更新；约 250ms 后 `config.json` 出现 `"header_layout":"avatar-left"`；刷新应用状态仍持久。
3. 切换多个单栏模板（bold/minimal/swiss/gradient/mono-minimal-center/jade-bamboo-left/indigo-pro-right/rose-petal-left），三态排布一致成立。
4. 点击「跟随模板」→ 回到模板原生布局，注入样式里的 `.r-header` 规则消失，`config.json` 移除 `header_layout`。
5. **双栏禁用**：切到 creative/split/business-navy-sidebar/warm-coral-sidebar-right，四按钮渲染但置灰、Tooltip 提示、点击无效；即使全局 `header_layout` 仍被设置，`.r-header` 覆盖也**不注入**，侧栏保持原生。
6. **PDF/PNG 一致性**：ExportDialog 导出 PDF/PNG，与预览排布一致（同一 `renderTemplate`+`injectGlobalVarsCss`）；classic 头像居右时 PDF 每页头像都在右。
7. **跨模板回归**：全局 `header_layout="avatar-left"` 时打开双栏简历不破损（门控抑制）；打开单栏简历覆盖重新生效。
8. 模板切换器在单/双栏间切换时，禁用态随 `resume.meta.template_id` 变化即时跟随。

