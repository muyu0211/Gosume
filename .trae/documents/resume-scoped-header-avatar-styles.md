# 头像圆角与信息区布局改为per-resume存储

## Context（背景与目标）

当前「头像圆角程度 `avatarRadius`」「信息区布局 `headerLayout`」被设计为**全局配置**（`GlobalLayout`，存于 `config.json`，所有简历共享）。用户明确指出：这两项是**针对当前简历**的展示样式，不该全局共享——否则一份简历的调整会影响所有简历。

目标：把这两个字段迁到**每份简历**的 `resume.personal` 中，与既有的 `avatar_width`/`avatar_height`（头像尺寸）同处存放、同一套读写模式；全局 `GlobalLayout` 恢复为只含「页边距 + 内容间距」这些真正跨简历的基础排版。常见简历尺寸/圆角/布局这类针对单份简历的样式全部 per-resume。

## 现状机制（已核实）

- resume 整份以 JSON 持久化进 SQLite（`resume_repo.go` 的 `data TEXT`），新增 per-resume 字段**无需 DDL**，走现有 `SetResume`/`ExplicitSave` 自动落盘。

- 头像尺寸已 per-resume：`resume.personal.avatar_width/height`，前端用 `updateField('personal.avatar_width', w)` 写（[PersonalSection.tsx](file:///d:/Kits/IDE/Gosume/frontend/src/components/editor/PersonalSection.tsx)），后端 `Personal` struct 有 `AvatarWidth/AvatarHeight`（`json:"avatar_width,omitempty"`）。

- 渲染/预览/测量/导出统一走 `injectGlobalVarsCss(rendered, layout, personal)`，四类调用点（`usePreview.ts` L44、`resumeStore.measureHeight` L241、`ExportDialog.tsx` L69、`ResumeListDrawer.tsx` L186）第三参数全部传入 `resume.personal`。→ **只要扩展该参数类型并改 build/inject 从** **`personal`** **读取即可，调用点零改动。**

- 头像圆角与信息区布局当前在 `layoutPresets.ts` 的 `buildGlobalVarsCss`/`injectGlobalVarsCss` 从 `layout.*` 读取注入；`PersonalSection` 用 `setLayout({ avatarRadius })`、`setLayout({ headerLayout })` 写全局。

## 实施步骤

### 1. 后端：移除全局字段 + 增加 per-resume 字段

- `pkg/user_config/layout_presets.go`：从 `GlobalLayout` 删除 `AvatarRadius`、`HeaderLayout`；删除 `HeaderLayoutCenter/Left/Right` 常量；`DefaultGlobalLayout` 移除对应默认；`ValidateGlobalLayout` 移除对应校验（AvatarRadius 校验、HeaderLayout 取值校验）。全局布局只剩 pageMargin + spacing。

- `pkg/resume/model/personal.go`：`Personal` 增加（与 `AvatarWidth` 同风格，nil 语义）：

  ```go
  AvatarRadius *int    `json:"avatar_radius,omitempty"`  // 头像圆角 0~100；nil=跟随模板原生
  HeaderLayout *string `json:"header_layout,omitempty"`  // center|avatar-left|avatar-right；nil=跟随模板原生
  ```

### 2. 前端：类型/常量

- `frontend/src/lib/layoutPresets.ts`：

  - `GlobalLayout` **删除** `avatarRadius` 与 `headerLayout` 字段；`DEFAULT_GLOBAL_LAYOUT` 移除对应项。

  - **保留** `HeaderLayout` 类型（改用于 `resume.personal.header_layout`）与 `HEADER_LAYOUT_VALUES`、`isDoubleColumnCss`、`detectHeaderLayoutCss`、`headerLayoutOverlayCss`。

  - `buildGlobalVarsCss` 的 `personal` 参数类型扩为 `{ avatar_width?; avatar_height?; avatar_radius?; header_layout? }`；圆角注入改读 `personal.avatar_radius`（移除外层在 global 的读取）。

  - `injectGlobalVarsCss`：`headerLayout`（布局覆盖）改从 `personal.header_layout` 读取，且门控逻辑不变——单栏才注入，双栏恒不注入。

- `frontend/src/types/resume.ts`：`Personal` 接口新增：

  ```ts
  /** 简历头像圆角程度 0~100（0=直角矩形，100=圆形）；null/未设置=跟随模板原生。 */
  avatar_radius?: number | null
  /** 简历信息区布局 center|avatar-left|avatar-right；null/未设置=跟随模板原生。 */
  header_layout?: HeaderLayout | null   // HeaderLayout 从 lib/layoutPresets import
  ```

### 3. 前端 UI — `frontend/src/components/editor/PersonalSection.tsx`

按既有 `avatar_width/height` 的 per-resume 写法（`updateField('personal.xxx')`）迁移：

- 全局写移除：删掉 `setLayout`/`setHeaderLayout`/`layout` 用于这两项的读（`layout.avatarRadius`、`layout.headerLayout`）。

- 头像圆角 slider（约 L433-443）：`value={p.avatar_radius ?? 0}`，`onChange={(e) => updateField('personal.avatar_radius', e.target.value === '' ? null : Number(e.target.value))}`（空/null 表示跟随模板）。

- 信息区布局按钮：`const headerLayout: HeaderLayout | null = p.header_layout ?? null`；点选后 `updateField('personal.header_layout', v)`（point等于 native 且未设置时仍不写入，保留原「跟随原生」语义）；`effectiveLayout = p.header_layout ?? (isDoubleColumn ? null : nativeLayout)`。

- 双栏检测、`nativeLayout`、`onSelectHeaderLayout` 逻辑保留不变（基于 `resume.meta.template_id`）。

### 4. 前端预览增量 — `frontend/src/components/preview/PreviewPanel.tsx`

- `layoutKey`（约 L200-204）：移除 `String(l.headerLayout ?? '')` 与 `String(l.avatarRadius ?? '')`（二者已不属于全局 layout，需删；页边距/间距保留）。

- `avatarKey`：当前为 `[avatar_width, avatar_height]`，追加 `avatar_radius`、`header_layout`（per-resume 样式变化都应触发 `updateStyleById` 增量更新 `GLOBAL_VARS_STYLE_ID`）。

## 历史数据说明

全局 `config.json` 中已存在的 `avatar_radius`/`header_layout` 被移除字段后自然忽略，**不做迁移**（全局值语义本就不符合 per-resume 意图）；新行为每份简历默认 nil（跟随模板人工失败兜底居中），零回归。

## 涉及文件

- `pkg/user_config/layout_presets.go`（删全局字段/常量/默认/校验）

- `pkg/resume/model/personal.go`（加 per-resume 字段）

- `frontend/src/lib/layoutPresets.ts`（GlobalLayout 裁剪；build/inject 改从 personal 读）

- `frontend/src/types/resume.ts`（Personal 加字段）

- `frontend/src/components/editor/PersonalSection.tsx`（UI 改 updateField per-resume）

- `frontend/src/components/preview/PreviewPanel.tsx`（layoutKey / avatarKey 调整）

## 验证

1. `go build ./pkg/...`；改用 esbuild 转译前端改动文件均通过。
2. `task dev`：简历 A 设「头像圆角=80」「信息区布局=头像居左」→ 保存 → 刷新 → 两值保留在简历 A 的 preview 与导出。
3. 另开简历 B：默认圆角 nil、布局高亮其模板原生，**不受 A 影响**；`config.json` 不再出现 `avatar_radius`/`header_layout`（值随各简历 `resume.personal` 保存）。
4. 双栏模板（creative/split 等）布局按钮仍禁用；预览/PDF/PNG 布局与圆角与单栏一致生效。
5. PreviewPanel：改圆角/布局/头像尺寸均触发样式增量即时刷新，切换模板全量重建正常。

