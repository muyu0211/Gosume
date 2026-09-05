# 架构收敛：per-resume 注入 CSS（custom\_css）单一承载体 —— 模板原生默认

## Context（背景与目标）

用户明确的设计意图（本条消息重申）：**头像圆角、信息区布局等样式设置不需要作为数据模型字段存储，只需做 CSS 调整并注入**。后端只需保存「模板私有 CSS」（模板初始样式，只读）＋「全局 CSS」（仅对当前简历生效的注入样式），即可渲染出用户高度修改后的简历。**若每个样式特性都加字段，后续扩展成本很高**。

渲染模型 = **模板私有 CSS + 注入 CSS（`resume.custom_css`）叠加**，定位「一静一动、一默认一定制」。

**关键新决策（用户已确认）**：`custom_css` 为空（如新建简历、未做任何样式调整）时，**渲染完全采用模板原生外观**（不注入任何覆盖）。模板已在 `var(--resume-padding, <原生值>)` 中提供原生 fallback，不注入即呈现模板原生效果（与模板选择器缩略图一致）。

需收敛的当前分散存储：

- 页边距/内容间距 → 全局 `config.json`（`GlobalLayout`）

- 头像尺寸 `avatar_width/height`、圆角 `avatar_radius`、布局 `header_layout` → `resume.personal`（上一轮迁入，本轮移除）

- 渲染 `injectGlobalVarsCss(html, layout, personal)` 动态生成覆盖 CSS

目标：**收敛为单一 per-resume 字段** **`resume.custom_css`**；控件把旋钮渲染成一段哨兵分段的 CSS 写入；渲染直接读 `custom_css` 注入（空则不注入→原生）；后端 `GlobalLayout`/`GetLayout`/`SaveLayout` 全局布局功能一次性退役（仅保留内部只读读取供数据迁移）。

***

## 设计决策

1. **单一承载体**：`resume.custom_css: string`（一段带哨兵注释分段的 CSS），承载所有 per-resume 样式调整。数据模型不再为样式特性加字段；未来新增（字体 family/字号/主题色等）只需往 custom\_css 追加新段。
2. **空 = 原生**：`custom_css` 为空 → 不注入任何 `<style>` → 模板原生外观。
3. **不做迁移兼容**：旧数据丢失的样式（页边距/内容间距/头像尺寸/圆角/布局）由模板初始值兜底——`custom_css` 为空时渲染模板原生外观。前端/后端均无样式迁移逻辑。
4. **全局布局退役**：删除 `SaveLayout`/`SetLayout`/前端 `layoutStore`、`Manager.GetLayout`、`GlobalLayout` 结构；config.json 遗留 `layout` 字段由 JSON 反序列化自动忽略（无害）。
5. **双栏护栏**：渲染侧对双栏模板剥除 `header-layout` 段（`stripHeaderLayoutCss`），控件侧布局按钮已禁用。
6. **schema 版本**：`SchemaVersion` 1.0 → **1.1**；`Migrate` 只做版本解析并统一 version，不迁移任何字段。

***

## 哨兵段格式（契约，前端生成器与解析器共用）

custom\_css 由若干哨兵分段拼接，每段仅在该类值存在时输出；无任何值则为空串。

```
/*=gosume:vars*/                                          ← 页边距（成对）
:root { --resume-padding-y: Ymm; --resume-padding-x: Xmm; --resume-padding: Ymm Xmm; }
/*=gosume:spacing*/                                       ← 内容间距（三段独立）
*:has(+ .section-title) { margin-bottom: 0 !important; }         ← spacingSection 存在时
* + .section-title { margin-top: S1mm !important; }              ← spacingSection 存在时
.section-title { margin-bottom: S2mm !important; }               ← spacingItem 存在时
<ITEM_SELECTORS> { margin-bottom: S2mm !important; }             ← spacingItem 存在时
<DETAIL_SELECTORS>, .extra-row { margin-bottom: S3mm !important; } ← spacingDetail 存在时
/*=gosume:avatar*/                                        ← 头像尺寸/圆角（各属性存在时）
.r-avatar img { width: Wpx !important; height: Hpx !important; border-radius: R% !important; }
/*=gosume:header-layout*/                                 ← 信息区布局（仅单栏注入）
/* value: avatar-right */                                 ← 布局 key，供 parse 回读
<headerLayoutOverlayCss 输出>
/*=gosume:end*/
```

- 单位口径与现状一致：px→mm 用 `25.4/96`、两位小数；头像尺寸 px；圆角 `radius/2`%。

- `ITEM_SELECTORS`/`DETAIL_SELECTORS` 常量（现有 layoutPresets.ts 中的选择器契约）迁移到 customCss.ts（仅为前端生成器使用，无后端镜像）。

- **页边距成对语义**：`pageMarginY/X` 同存同空（UI 保证）。任一缺失时生成器不输出 vars 段（`--resume-padding` 是单栏消费的简写，无法表达"一侧原生一侧自定义"）。

- **header-layout 段的 key** 用 `/* value: <key> */` 注释行编码，避免从 CSS 反推布局（脆弱）。

***

## 变更清单

### 后端（Go）

| 文件                                     | 变更                                                                                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pkg/resume/model/resume.go`           | `Resume` 增 `CustomCSS string json:"custom_css,omitempty"`；`SchemaVersion` → `"1.1"`；`Migrate` 只做版本解析（1.1/1.0/1.0.0）并把 version 统一为 `SchemaVersion`，**不迁移字段** |
| `pkg/resume/model/personal.go`         | 删除 `AvatarWidth/AvatarHeight/AvatarRadius/HeaderLayout` 四个字段                                                                                                |
| `pkg/resume/service/resume_service.go` | `Inject` 参数与 `LoadResume` 保持原样（无 configMgr 依赖、无样式折叠逻辑）                                                                                                      |
| `pkg/resume/service/system_service.go` | 删除 `GetLayout`、`SaveLayout` 方法（前端不再调用）                                                                                                                      |
| `pkg/user_config/user_config.go`       | 删除 `UserConfig.Layout` 字段与 `GetLayout`/`SetLayout` 方法（config.json 遗留 layout 字段由反序列化自动忽略）                                                                    |
| `pkg/app/app.go`                       | `resumeSvc.Inject(app, resumeStore)`（两处组装保持原样）                                                                                                              |

### 前端（TypeScript/React）

| 文件                                                    | 变更                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/lib/customCss.ts`（新增）                   | `ResumeStyleState`（全部可选，undefined=跟随模板）：`pageMarginY/X`（成对）、`spacingSection/Item/Detail`、`avatarWidth/Height`、`avatarRadius`、`headerLayout`；`buildCustomCss(s)`（按哨兵段生成，空状态→''）；`parseCustomCss(css)`（mm→px 反向解析 + 读 `value:` 注释）；`stripHeaderLayoutCss(css)`（删 header-layout 段）；`resolveCustomCss(resume)` = `resume.custom_css ?? ''`；ITM/DETAIL 选择器常量迁入；UI 显示默认值常量（沿用旧 15/20/12/8/4，仅作滑动条 nil 占位）                                           |
| `frontend/src/lib/layoutPresets.ts`                   | 删 `buildGlobalVarsCss`、`GlobalLayout`、`DEFAULT_GLOBAL_LAYOUT`、ITEM/DETAIL 常量（迁往 customCss.ts）；保留 `GLOBAL_VARS_STYLE_ID`、`HeaderLayout`、`HEADER_LAYOUT_VALUES`、范围常量（MARGIN/SPACING/AVATAR\_RADIUS）、`isDoubleColumnCss`、`detectHeaderLayoutCss`、`headerLayoutOverlayCss`、`injectStyleTag`、`extractTemplateCss`；`injectGlobalVarsCss(html, resume)`：`rule = resolveCustomCss(resume)`，空→原样返回；双栏→`stripHeaderLayoutCss`；再空→原样；否则 `injectStyleTag` |
| `frontend/src/types/resume.ts`                        | `Resume` 增 `custom_css?: string`；`Personal` 删 4 个样式字段（含 `HeaderLayout` import）；`createEmptyResume` version → `'1.1'`                                                                                                                                                                                                                                                                                                                          |
| `frontend/src/stores/resumeStore.ts`                  | 删 layoutStore import；新增 `updateCustomCss(patch)`（`parse(current)→merge→build→updateField('custom_css', next)`）；`measureContentHeight` 改用 `injectGlobalVarsCss(rendered, resume)`；`loadResume` 仅保留 `migratePersonalSummary`（后端已迁移 custom\_css）                                                                                                                                                                                                 |
| `frontend/src/stores/layoutStore.ts`                  | 删除文件                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `frontend/src/hooks/usePreview.ts`                    | 删 layoutStore/prevAvatarRef；新增 `prevCustomCssRef`：`resume.custom_css` 变化→`refreshPreview()`（滑块拖拽即时渲染），否则防抖；`injectGlobalVarsCss(rendered, resume)`；删独立 layout effect                                                                                                                                                                                                                                                                          |
| `frontend/src/components/preview/PreviewPanel.tsx`    | 删 layoutStore；`lastLayoutKeyRef`/`lastAvatarKeyRef` 合并为 `lastStyleKeyRef = String(resume?.custom_css ?? '')`；`isStyleChange`→`updateStyleById(doc, GLOBAL_VARS_STYLE_ID, parts.globalVarsRule)`（空 rule 时清空/移除 style，回到原生）                                                                                                                                                                                                                     |
| `frontend/src/components/editor/PersonalSection.tsx`  | 头像尺寸/圆角/布局显示值读 `parseCustomCss(resume.custom_css)`，写入改 `updateCustomCss`；nil 显示「（跟随模板）」；保留 `avatarRenderedSize` 作 nil 占位、`isDoubleColumn` 禁用布局按钮、`nativeLayout` 默认高亮；布局按钮点击规则沿用（nil 且点击原生→no-op）                                                                                                                                                                                                                                              |
| `frontend/src/components/layout/LayoutPopover.tsx`    | 删 `useLayoutStore`；读 `parseCustomCss(resume.custom_css)`、写 `updateCustomCss`；页边距成对（拖动任一写 pair，另一侧取旧默认 15/20 或现值）；内容间距三滑块独立 nil 语义；nil 显示「跟随模板」                                                                                                                                                                                                                                                                                                |
| `frontend/src/components/export/ExportDialog.tsx`     | `injectGlobalVarsCss(rendered, resume)`；删 layoutStore                                                                                                                                                                                                                                                                                                                                                                                         |
| `frontend/src/components/resume/ResumeListDrawer.tsx` | 批量导出改 `injectGlobalVarsCss(rendered, resume)`；删 `ensureLoaded`/layoutStore                                                                                                                                                                                                                                                                                                                                                                    |
| `frontend/src/routes/EditorPage.tsx`                  | 布局变化重测高度：`useLayoutStore.layout` → `useResumeStore(s => s.resume?.custom_css)` 订阅                                                                                                                                                                                                                                                                                                                                                             |
| `frontend/src/App.tsx`                                | 删除 layoutStore `ensureLoaded` effect 及 import                                                                                                                                                                                                                                                                                                                                                                                                 |

***

## 数据迁移汇总

| 旧数据                                                             | 处理                                                |
| --------------------------------------------------------------- | ------------------------------------------------- |
| `personal.avatar_width/height/avatar_radius/header_layout`（旧数据） | 字段已从 Go struct 移除，反序列化忽略；`custom_css` 为空 → 模板原生外观 |
| 全局 `config.json` `layout`（用户曾自定义）                               | `UserConfig.Layout` 已移除，反序列化忽略；不再应用到任何简历          |
| 新简历（1.1）                                                        | `custom_css` 为空 → 模板原生外观                          |
| `.gosume` 导入（1.0 文件）                                            | `Migrate` 统一 version，样式不迁移 → 模板原生外观               |

***

## 涉及文件总览

后端：`pkg/resume/model/resume.go`、`pkg/resume/model/personal.go`、`pkg/resume/service/system_service.go`、`pkg/user_config/user_config.go`、`pkg/app/app.go`

前端：`lib/customCss.ts`(新)、`lib/layoutPresets.ts`、`types/resume.ts`、`stores/resumeStore.ts`、`stores/layoutStore.ts`(删)、`hooks/usePreview.ts`、`components/preview/PreviewPanel.tsx`、`components/editor/PersonalSection.tsx`、`components/layout/LayoutPopover.tsx`、`components/export/ExportDialog.tsx`、`components/resume/ResumeListDrawer.tsx`、`routes/EditorPage.tsx`、`App.tsx`

***

## 验证

1. `go build ./pkg/...`；前端 `task dev`/vite build 编译通过。
2. 新建简历（custom\_css 空）：预览与模板选择器缩略图一致（原生外观）；`<style id="resume-global-vars">` 不存在。
3. 各控件调整：页边距/间距/头像尺寸/圆角/布局 → `custom_css` 生成对应段、预览即时更新（不白屏）、保存重开保留。
4. 双栏模板：布局按钮禁用；渲染侧剥除 header-layout 段、侧栏完整。
5. 旧数据：加载含旧 personal 样式字段或 config 遗留 layout 的旧简历 → `custom_css` 为空、渲染模板原生外观，无迁移副作用。
6. 批量导出 / `.gosume` 导出导入：PDF/PNG 与单份一致，外观完整还原。
7. 预览增量：仅改样式滑块时只更新 `<style id="resume-global-vars">`；从有值拖回空（原生）时 style 被清空。

