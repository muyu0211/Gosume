# Gosume 预览渲染优化开发方案（方案 4：增量 DOM diff）

> 文档先行。本方案在动手编码前，先把现状链路、根因、目标架构、改动清单与风险调研清楚。
> 配套：`docs/Gosume一期改造开发方案.md`、`docs/Gosume一期改造bug根因分析.md`
> 状态：**待评审**（方案未落地，等待确认后进入 M1）

---

## 0. 结论摘要（TL;DR）

编辑时预览「闪烁 + 跳变」、主页进入「突现」，根因不在模板或数据层，而在**实时预览管线每次编辑都对 iframe 做全量重写**（`doc.write` 重写 head/CSS，随后分页算法 `body.replaceChildren` 破坏性重建展示 DOM）。

方案 4（增量 DOM diff）落地为**渲染分层 + 内容级 morphdom diff + 静态骨架缓存 + 分页视觉双缓冲**，分三个里程碑推进：

| 里程碑 | 内容 | 收益 | 成本 |
|--------|------|------|------|
| **M1（核心）** | 骨架缓存 + 模板缓存 + 内容 diff | 消除白屏、字体/图片重载、文本未变部分闪烁 | 中 |
| **M2（体验）** | 分页双缓冲 + 滚动保持 + 进入过渡 | 消除分页跳变、主页进入「突现」 | 中 |
| **M3（可选）** | `data-id` + keyed diff + 分页 memo | 列表增删/重排也丝滑 | 高 |

> 关键判断：**diff 只能优化「内容层」，无法消除「分页层」的重建**——分页算法本质是「按测量高度克隆拆分」，必须重算。分页层的闪烁靠 M2 的「双缓冲 + 节流」掩盖，而非 diff 直接解决。这是本方案最重要的边界认知。

---

## 1. 背景与目标

### 1.1 现状问题

1. **编辑时闪烁**：每输入一个字符，整个预览 iframe 文档被 `doc.write` 全量重写，出现白屏，字体/图片重新加载，布局重排。
2. **编辑时跳变**：分页后 `containerHeight` 变化，预览容器高度突变，滚动位置被扰动。
3. **主页进入「突现」**：进入 `/editor` 时 `previewHtml` 为空，先显示占位，等「防抖 300ms + 拉模板 + 渲染 + 分页」全跑完后，简历瞬间整块冒出，无过渡。

### 1.2 目标

- 编辑时预览更新**无白屏、无闪烁**，仅变化的文本节点更新。
- 分页重建对用户**视觉无感**。
- 主页进入编辑器有**平滑过渡**。
- 导出（PDF/PNG）结果与优化前**完全一致**（WYSIWYG 不被破坏）。

### 1.3 非目标

- 不改动导出管线（`exportHtml.ts` 是一次性离屏渲染，无需 diff）。
- 不改动后端 `pkg/render/html.go`（后端渲染只服务 `RenderPreview`，实时预览已走前端）。
- 不重构模板引擎为 React/VDOM（成本过高，收益有限）。

---

## 2. 现状渲染链路（调研）

### 2.1 实时预览（编辑时，逐字符触发）

```
键盘输入
  → resumeStore.updateField(path, value)                     // resumeStore.ts:90
      set({ resume: {...resume}, isDirty: true })            // 每次生成新 resume 引用
  → usePreview 的 useEffect([resume])                        // usePreview.ts:55
      debouncedRefresh()  // 300ms 防抖                       // usePreview.ts:49
  → refreshPreview()                                          // usePreview.ts:17
      ① loadTemplateContent(activeTemplateId)   // 走后端 GetTemplateContent（每次！）
      ② renderTemplate(tmpl, resume)            // 前端自研字符串模板引擎
      ③ injectLayoutCss(rendered, ...)          // 字符串注入布局档位 CSS
      ④ injectAvatarSizeCss(html, ...)          // 字符串注入头像尺寸 CSS
      setPreviewHtml(html)                       // 存 zustand
  → PreviewPanel 的 useEffect([previewHtml])                 // PreviewPanel.tsx:20
      doc.open(); doc.write(previewHtml); doc.close()        // ⚠ 全量重写 iframe
      await waitForDocumentReady(doc)           // 等 fonts.ready + 所有图片 load
      await requestAnimationFrame × 2
      paginateContent(iframe)                   // paginate.ts:26
        → paginateResume(doc, body, {...})      // paginationCore.ts:157
            body.replaceChildren(wrapper)       // ⚠ 破坏性清空 body
            克隆拆分 section 到多个 .resume-page
      setContainerHeight(body.scrollHeight)     // 高度可能突变
```

### 2.2 导出（一次性，与预览互不影响）

```
exportHtml.ts → paginateHTMLString(previewHtml)
  → 离屏 iframe → doc.write → waitForDocumentReady → paginateInIframe → cleanAndSerialize
```

导出走**独立的离屏 iframe**，与实时预览 DOM 完全隔离，故本方案的 diff 改动**不触碰导出**。

### 2.3 模板渲染产物（DOM 契约）

`renderTemplate` 输出未分页的完整 HTML，结构固定（`templates/template.html`）：

```
<body>
  <div class="resume-page">
    <div class="resume-container">
      <header class="r-header">…</header>
      <main class="r-main"> …section-title / experience-item / education-item… </main>
    </div>
  </div>
</body>
```

分页后结构变为：

```
<body>
  <div class="resume-pages-wrapper">
    <div class="resume-page">…(第 1 页，克隆拆分)…</div>
    <div class="resume-page">…(第 2 页)…</div>
  </div>
</body>
```

**关键**：分页前后 DOM 结构不同——分页前是「单页完整内容」，分页后是「多页克隆拆分」。这决定了 diff 不能直接作用在展示层上（详见 §4.4）。

---

## 3. 问题根因

| 编号 | 根因 | 位置 | 后果 |
|------|------|------|------|
| R1 | `doc.open/write/close` 全量重写 iframe（含 head/CSS） | `PreviewPanel.tsx:33-35` | 白屏闪烁、字体图片重载、滚动归零 |
| R2 | `paginateResume` 用 `body.replaceChildren` 破坏性重建展示 DOM | `paginationCore.ts:175` | 分页跳变 |
| R3 | 编辑期间每次重新 `loadTemplateContent` 走后端 | `usePreview.ts:25` | 额外延迟，放大 R1 的白屏空窗 |
| R4 | 模板渲染不输出稳定 `data-id`，列表项无 key | `templates/template.html` | diff 无法稳定识别列表项，增删/重排会退化 |
| R5 | 渲染是字符串级，无结构化 DOM 可 diff | `templateEngine.ts:19` | 需引入 DOMParser 转换层 |
| R6 | 进入编辑器时 `previewHtml` 为空 → 占位 → 突然冒出 | `EditorPage.tsx` + `usePreview` | 主页进入「突现」 |

---

## 4. 方案设计

### 4.1 总体思路：渲染分层

把「一份完整 HTML 字符串」拆成三个可独立更新的层：

| 层 | 内容 | 变化时机 | 更新方式 |
|----|------|---------|---------|
| **骨架层 Shell** | `<head>` + CSS + 空内容容器 | 仅切换模板 | 全量 `doc.write`（低频） |
| **内容层 Content** | `.resume-container` 内的未分页内容 | 每次编辑 | **morphdom diff**（高频增量） |
| **展示层 Pages** | 分页后的多页 DOM | 内容变化后 | 重建 + 双缓冲切换 |

- **骨架层**只在切模板时重建，编辑期间 head/CSS 完全不动 → 消除白屏 + 字体/图片重载。
- **内容层**是 diff 对象，编辑时用 morphdom 把新渲染内容增量合并进去。
- **展示层**是分页派生结果，内容层变化后重分页，但用双缓冲掩盖重建。

### 4.2 技术选型

| 候选 | 体积 | key 支持 | 结论 |
|------|------|---------|------|
| **morphdom** | ~3KB | 无（按 index 匹配） | ✅ **首选** |
| idiomorph | ~5KB | 无（morphdom fork，更多 hook） | 备选 |
| 自研 keyed diff | 0 依赖 | 有 | M3 演进 |

**选 morphdom 的理由**：

- 简历编辑的**高频操作是改文本**（改姓名、改公司、改 summary 文字），morphdom 按 index + textNode 级 diff 完美覆盖。
- 列表**增删/重排是低频**；morphdom 退化时因 item 结构相同、靠 textNode diff 复用元素，代价可控。
- 体积小、成熟、API 简单（`morphdom(fromEl, toEl)`）。

**风险与演进**：morphdom 对「列表中间插入一条」会从插入点开始错位。若后续实测体感不佳，演进到自研 keyed diff（需先做 `data-id` 准备工作，见 §4.5、M3）。

### 4.3 目标架构

```
iframe 内：
  body
    ├─ #r-source (隐藏源容器，display:none / 移出视野)
    │    └─ .resume-page > .resume-container > (.r-header + .r-main)   ← 内容层，diff 对象
    └─ .resume-pages-wrapper (展示层，双缓冲)                          ← 分页结果
         ├─ .resume-page × N (离屏/在屏交替)
         └─ .resume-page × N
```

**编辑流程（M1+M2 落地后）**：

```
键盘输入 → updateField
  → usePreview: 缓存模板 → renderContent(resume, template)  // 只渲染内容片段
  → DOMParser 解析出「新内容 DOM」
  → morphdom(iframe 内 #r-source 的内容, 新内容 DOM)         // 增量更新，无白屏
  → （节流）重新分页：清空展示层 → 从 #r-source 克隆拆分到离屏 buffer
  → 原子切换 buffer 可见性 + 恢复滚动位置                     // 视觉无感
```

### 4.4 分页策略（本方案的关键难点）

`paginateResume` 是破坏性重建，**diff 无法直接优化它**。策略是「分离源 DOM 与展示 DOM + 双缓冲」：

1. **源 DOM（`#r-source`）**：始终是「未分页的完整内容」，结构稳定，是 morphdom diff 的稳定对象。
2. **展示 DOM（`.resume-pages-wrapper`）**：从源 DOM 克隆拆分派生。
3. **重分页时机**：内容 diff 完成后，用「内容签名」（各 section 文本的哈希 + 结构指纹）判断是否需要重分页；签名未变则跳过（例如改的是不影响高度的字段）。
4. **双缓冲掩盖**：分页是**同步**操作（毫秒级，克隆 + `offsetHeight` 强制回流测量），重建本身不产生「异步白屏」；用两个 buffer 交替渲染 + 一次性切换，避免用户看到「拆到一半」的中间态。
5. **节流**：分页比内容 diff 重，可把重分页放到 `requestIdleCallback` 或更长防抖（如 150ms），内容 diff 保持 300ms 防抖即时响应。

### 4.5 必要的数据准备：`data-id`

当前 `template.html` 的列表项（`.experience-item`、`.education-item`、`.award-item`、`.skill-category`、`.custom-item`、`.r-lang`）**不输出唯一标识**，而数据模型里每条都有 `id`（见 `resumeStore` 各 `addXxx` 的 `generateId()`）。

**本期（M1）**先给这些 item 补 `data-id="{{.ID}}"`（模板引擎 `toGoShape` 已把 `id` 转成 `ID`，`{{.ID}}` 可直接取）。作用：

- 为未来 keyed diff / 分页 memo 提供稳定锚点；
- 让分页 memo 的「内容签名」可以按 item 维度计算，而不是整页文本哈希。

> 注意：`data-id` 是**新增属性**，不改变现有 CSS 选择器（选择器按 class 匹配），导出 HTML 会多带一个属性，对 PDF/PNG 渲染无副作用。需在 `unified_template_test.go` 补对应断言（见 §5 后端条目）。

### 4.6 CSS 注入的改造

`injectLayoutCss` / `injectAvatarSizeCss` 目前是「字符串注入到 HTML 再 `doc.write`」。diff 方案下，骨架层（head + CSS）不再每次重写，这两处注入需改为**直接操作 iframe 内 `<style>` 节点**：

- 布局档位 CSS 注入 → 更新 iframe 内一个固定 `<style id="layout-inject">` 的 `textContent`。
- 头像尺寸 CSS 注入 → 同上（固定 `<style id="avatar-inject">`）。
- 档位/头像尺寸变化频率远低于内容编辑，这两个 `<style>` 的更新不需要 diff。

---

## 5. 涉及改动清单（文件级）

### 5.1 新增文件

| 文件 | 职责 |
|------|------|
| `frontend/src/lib/previewShell.ts` | 从 `TemplateSet` 构造骨架 HTML（head+CSS+空容器）与内容 HTML（`.resume-container` 内部）的拆分逻辑 |
| `frontend/src/lib/morphPreview.ts` | 封装 `morphdom` 调用、DOMParser 解析、跨 document 转换、`#r-source` 与展示层管理 |
| `frontend/src/lib/paginationMemo.ts` | 内容签名计算 + 分页结果缓存/判断（M2/M3 使用） |

### 5.2 修改文件

| 文件 | 改动 |
|------|------|
| `frontend/src/components/preview/PreviewPanel.tsx` | 重构 iframe 生命周期：首次全量写骨架；后续走 morph diff；分页双缓冲 + 滚动保持 |
| `frontend/src/hooks/usePreview.ts` | 模板内容缓存（切模板才失效）；拆分「渲染内容」与「骨架」；输出内容 DOM 而非整串 |
| `frontend/src/services/templateService.ts` | 增加模板内容内存缓存层（可选，`loadTemplateContent` 结果缓存） |
| `frontend/src/lib/layoutPresets.ts` | `injectLayoutCss`/`injectAvatarSizeCss` 改为返回「可写入 `<style>` 的规则字符串」，或新增直接更新 iframe `<style>` 的辅助函数 |
| `frontend/src/routes/EditorPage.tsx` | 进入过渡：用 `isPreviewLoading` 控制预览 opacity 淡入（配合 M2） |
| `frontend/src/lib/paginationCore.ts` | 暴露「分页输入可为指定源容器」的能力（当前写死 `body.querySelector('.resume-container')`），支持从 `#r-source` 派生而非操作展示层 |
| `templates/template.html` | 列表 item 补 `data-id="{{.ID}}"` |
| `frontend/package.json` | 新增依赖 `morphdom` |

### 5.3 后端（最小改动，仅测试）

| 文件 | 改动 |
|------|------|
| `pkg/render/unified_template_test.go` | 补充 `data-id` 输出的断言，确保前后端渲染语义仍一致（后端 `HTMLRenderer` 也会输出 `data-id`，需验证 Go template 的 `.ID` 字段名匹配） |

> ⚠ **后端字段名核对**：前端 `toGoShape` 用 `snakeToPascal` 把 `id` → `ID`。后端 Go 结构体字段名需确认是 `ID`（`model/resume.go`）。若后端字段是 `Id`/`ID` 不一致，`{{.ID}}` 在 Go template 里会取空，需统一（这属于 M1 前必须核对的项，见 §7-问题清单 Q3）。

### 5.4 不改动

- `frontend/src/lib/exportHtml.ts`（导出独立离屏 iframe，与实时预览隔离）
- `pkg/export/*`、`pkg/render/html.go`（后端渲染不动）
- `frontend/src/lib/templateEngine.ts` 的模板语法（仅新增拆分入口，语法不变）

---

## 6. 关键难点与风险

| 难点 | 说明 | 应对 |
|------|------|------|
| **分页破坏性重建** | `paginateResume` 是 diff 无法触及的硬约束 | 分离源/展示 DOM，双缓冲 + 签名判断跳过重分页 |
| **跨 document 的 morphdom** | iframe 内 DOM 与主文档 DOMParser 产物不在同一 document | 需验证 morphdom 跨 document 行为；必要时在 iframe document 内解析（`iframe.contentDocument` 的 `DOMParser`/`createElement`） |
| **sandbox 限制** | iframe `sandbox="allow-same-origin"`（`PreviewPanel.tsx:149`） | 已允许同源，可读写 `contentDocument`，无需改 |
| **无 key 的列表 diff 退化** | morphdom 按 index 匹配，插入/删除会错位 | 先接受（低频），M3 用 `data-id` + keyed diff 根治 |
| **字符串级渲染** | 需引入 DOMParser 转换，多一层开销 | 仅解析内容片段（非整页），开销可控；性能见 §8 |
| **两次强制回流** | diff 一次布局 + 分页多次 `offsetHeight` 测量 | 用「内容签名」跳过无意义重分页；分页节流 |
| **`waitForDocumentReady` 语义变化** | diff 后未变元素已加载，但新增图片/字体仍需等待 | 保留等待逻辑，但只对「新增/变化的图片」等待，未变的不再重等 |

---

## 7. 可能存在的问题（调研结论，需在 M1 前核对）

> 这些是调研阶段识别出的、需在编码前/中验证的不确定点，逐条给出核对动作。

- **Q1 — morphdom 是否支持跨 document？**
  `morphdom(fromEl, toEl)` 内部用 `fromEl.ownerDocument.createElement` 创建节点。若 `toEl` 来自 `document.implementation.createHTMLDocument` 或主文档 DOMParser，需要 `document.importNode` 或让两个节点同 document。
  **动作**：在 `PreviewPanel` 内用 `iframe.contentDocument.createElement('template')` 包裹渲染产物再解析，保证新 DOM 与目标同 document，规避跨文档问题。

- **Q2 — `doc.fonts.ready` 在 iframe 中的表现。**
  骨架层常驻后，字体首次加载即完成，后续 diff 不触发重载，`fonts.ready` 立即 resolve。但**切模板**后需重新等待（新 CSS 可能引入新字体）。
  **动作**：把 `waitForDocumentReady` 拆成「骨架首载」（切模板）与「内容 diff」（编辑）两个路径，仅前者等待字体。

- **Q3 — 后端 Go 结构体 `ID` 字段名，`{{.ID}}` 是否两端都能取到。**
  前端 `toGoShape` 已把 `id`→`ID`；后端 `model.Resume` 的字段若是 `Id`（非 `ID`），`template.html` 的 `{{.ID}}` 在后端 `html/template` 下会解析失败或取空，且 Go 的 `html/template` 对未定义字段会**报错**（不同于前端静默返回空）。
  **动作**：M1 前先 `grep` `pkg/model/*.go` 核对字段名，统一为 `ID`，并同步 `unified_template_test.go` 断言。

- **Q4 — 分页签名（memo）的误判风险。**
  用「文本哈希」做签名：改了文字但高度不变（如替换同长度字符）→ 会误判为「需重分页」（安全但多余）；改了字号/间距档位但文本没变 → 文本签名不变会漏判（危险）。
  **动作**：签名必须纳入「布局档位 key + 头像尺寸 + 模板 id」，不能只看文本（见 §4.6 的注入路径）。

- **Q5 — `paginateResume` 写死 `body.querySelector('.resume-container')`。**
  分页输入当前硬编码为 body 下的 `.resume-container`。分离源/展示层后，分页需从 `#r-source` 的 `.resume-container` 读取，而非 body。
  **动作**：给 `paginateResume`/`paginateContent` 增加「源容器」参数（默认回退 body，保证导出路径兼容）。

- **Q6 — 缩放（`transform: scale`）与双缓冲的坐标。**
  预览外层用 `transform: scale(zoom)` 包裹 iframe（`PreviewPanel.tsx:139`），双缓冲切换在缩放态下需保证尺寸/坐标一致。
  **动作**：双缓冲两个 buffer 用同一尺寸 + 同一 `transform-origin`，切换只改 `visibility`/`display`，不动 transform。

- **Q7 — morphdom 对 `DocumentFragment` 会折叠为 `firstElementChild`（实现中踩到的坑）。**
  用 `<template>.content`（DocumentFragment）作为 morphdom 的 `toNode` 时，morphdom 内部 `toNode = toNode.firstElementChild`，只 diff 第一个子元素（`header`），`main` 被丢弃——导致预览只更新 header、章节全部消失。
  **动作（已落地）**：改用 `doc.createElement('div')` 包裹新内容（`wrapper.innerHTML = contentHtml`），再 `morphdom(sourceContainer, wrapper, { childrenOnly: true })`。探针实测：`name`/`school`/`company` 全部正确更新，`data-id` 与 `header/main` 结构完整保留。

---

## 7.1 实现结果（M0/M1/M2 已完成）

- **M0 核对结论**：Q1 确认 morphdom 用模块级全局 `document`、必须注入 iframe（`sandbox="allow-same-origin"` 下 `contentWindow.eval` 实测可用，无需放宽 `allow-scripts`）；Q3 确认后端字段名为 `ID`；Q5 已加 `sourceEl`/`targetEl` 参数；Q2/Q4/Q6 按方案处理。
- **M1 落地**：`paginationCore.ts`/`paginate.ts` 源/展示分离；`morphPreview.ts`（extractContentHtml / injectMorphdom / morphSourceContent / setupSourceShell）；`PreviewPanel.tsx` 全量/增量双路径（headKey 判全量）；`usePreview.ts` 模板缓存；`template.html` 补 `data-id`；`unified_template_test.go` 补 `data-id` 断言。
- **M2 落地**：滚动保持（分页前后记录/恢复 `scrollTop`）+ 进入淡入（`animate-preview-enter`）+ **布局/头像档位增量更新**（见下）。
- **M2.5（§4.6 落地，修复调档位跳变）**：页边距/间距/头像尺寸本质是纯 CSS 变化，不该走全量 `doc.write`。`layoutPresets.ts` 抽出 `buildLayoutCss`/`buildAvatarCss`，注入规则改为独立的 `<style id="layout-inject">`/`<style id="avatar-inject">`；`PreviewPanel.tsx` 用三个独立签名（模板/布局/头像）区分四种更新路径——切模板全量、切布局档位/头像尺寸只 `updateStyleById` + 重分页、纯编辑 diff。rod 探针实测 style 更新后 padding 立即生效。
- **未实现（判断为过度设计，暂缓）**：分页双缓冲（分页是同步 `replaceChildren`，无中间态，双缓冲无收益）、分页签名 memo（收益有限，待有真实性能诉求再补）、keyed diff（M3，依赖 `data-id` 已就绪）。
- **验证**：`go test ./pkg/...` 全绿（含 data-id 断言）；前端 `vite build` 成功（1871 模块）；`go build` 成功；rod 端到端探针验证 sandbox eval + morphdom diff + style 增量更新均正确。

---

## 8. 测试与验证方案

### 8.1 单元测试

| 对象 | 断言 |
|------|------|
| `previewShell.ts` | 骨架/内容拆分后，内容片段与 `renderTemplate` 原输出的 `.resume-container` 内部一致；骨架含完整 head/CSS |
| `morphPreview.ts` | 给定旧/新内容 DOM，morphdom 后「未变文本节点保持引用不变、变化文本节点被更新」 |
| `paginationMemo.ts` | 同内容返回同一签名；改文本/改档位签名变化 |

### 8.2 集成/回归（手动 + 自动化）

- **功能回归**：分页页数正确、双栏模板侧栏重复空壳正确、页边距/间距档位生效、头像尺寸生效、缩放正常。
- **WYSIWYG**：编辑页实时预览与「导出 PDF/PNG」结果一致（导出走独立管线，需回归验证未被间接影响）。
- **性能**：用 `MutationObserver` 统计一次编辑触发的 DOM 变更节点数（目标：仅变化的文本节点，不再整树重建）；用 Performance 记录「输入 → 预览可见更新」耗时（目标 < 100ms，现状数百 ms）。
- **边界**：跨页内容（长 summary 溢出）、列表中间插入/删除/拖拽排序、切模板、切布局档位、空 resume（无 `.resume-container` 的兜底）。

### 8.3 验收标准

1. 编辑任一字段，预览**无白屏闪烁**，光标所在输入框不失焦。
2. 列表增删/排序，非受影响的 item **不重建**（DOM 节点引用不变）。
3. 分页重建（页数变化时）**视觉无跳变**，滚动位置保持。
4. 主页进入编辑器，预览**淡入过渡**，非突现。
5. 导出 PDF/PNG 与优化前**像素级一致**（同模板同数据对照）。

---

## 9. 里程碑与落地顺序

| 里程碑 | 交付 | 依赖 | 验收 |
|--------|------|------|------|
| **M0 前置核对** | 核对 Q1-Q6，尤其 Q3 后端字段名；确认 morphdom 跨 document 方案 | 无 | 核对清单关闭 |
| **M1 内容 diff** | 骨架缓存 + 模板缓存 + 内容 morph diff + `data-id` | M0 | 编辑无白屏、未变节点不重建 |
| **M2 分页体验** | 分页双缓冲 + 滚动保持 + 进入淡入 + 分页签名节流 | M1 | 分页无跳变、进入平滑 |
| **M3 keyed diff（可选）** | `data-id` 驱动的 keyed diff + 分页 memo 增量 | M2 | 列表增删/排序也丝滑 |

---

## 10. 参考资料（代码位置索引）

| 主题 | 位置 |
|------|------|
| 实时预览入口 | `frontend/src/components/preview/PreviewPanel.tsx` |
| 预览数据流 | `frontend/src/hooks/usePreview.ts` |
| 前端模板引擎 | `frontend/src/lib/templateEngine.ts` |
| 分页核心（破坏性重建） | `frontend/src/lib/paginationCore.ts`（`paginateResume` L157、`body.replaceChildren` L175） |
| 分页外壳 | `frontend/src/lib/paginate.ts` |
| 布局/头像 CSS 注入 | `frontend/src/lib/layoutPresets.ts` |
| 导出管线（不改动） | `frontend/src/lib/exportHtml.ts` |
| 统一 HTML 模板 | `templates/template.html` |
| 模板契约 | `templates/AGENTS.md` |
| 后端渲染（不改动，仅测试） | `pkg/render/html.go`、`pkg/render/unified_template_test.go` |
| 状态管理 | `frontend/src/stores/resumeStore.ts`、`frontend/src/stores/editorStore.ts` |
| 进入动画 | `frontend/src/components/ui/AnimatedPage.tsx`、`globals.css` 的 `animate-page-enter` |
