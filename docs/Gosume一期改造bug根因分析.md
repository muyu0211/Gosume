# Gosume 一期改造 · Bug 根因分析

> 配套：`docs/Gosume一期改造bug单.md`、`docs/Gosume一期改造PRD.md`、`docs/Gosume一期改造开发方案.md`
> 状态：根因已定位；**修复已按 §8 落地**（见下方"修复记录"）。

---

## 0. 结论摘要（TL;DR）

这批渲染类 bug 并非互相孤立，而是**同一条渲染管线对 DOM 结构的硬编码契约被本次改造打破**后，连锁反应出的多个表象；另有一个独立的头像位置契约变更。

**两个根因：**

| 编号 | 根因 | 直接导致的 bug |
|------|------|----------------|
| **RC1** | 统一 HTML 去掉了 `.resume-container` 包裹层，但分页子系统（预览 + 导出）硬编码依赖 `body.resume-page > .resume-container > [sidebar + sections]` 这一旧 DOM 契约。分页算法找不到 `.resume-container` 提前返回，同时 `paginateContent` 又清空了 `body.className`，把 `.resume-page` 上的 grid / 页边距 / 白底一并抹掉。 | 一.1 分页不生效、一.2 页边距失效、一.3 双栏塌成单栏+灰底、一.1 导出生硬截断、二.1 主页面与编辑页不一致 |
| **RC2** | 统一骨架把头像从旧模板 header 右侧（`header-avatar`）挪到了 `.r-aside` 左侧；单栏模板的 aside 被铺成"左侧横向信息带"，头像随之"被拉到左侧、与邮箱手机挤在一起"。 | 三.1 图像位置错误 |

> 一句话：**改的是"数据/逻辑层（HTML 结构）"，但没同步改造依赖旧结构的"渲染层（分页算法 + 预览外壳）"，两者对 DOM 的约定不一致了。**

---

## 1. 三条渲染路径与它们对 DOM 契约的依赖

当前有**三条**渲染路径，它们对"HTML 结构长什么样"的假设并不相同——这正是"主页面正常、编辑页崩坏"的根源。

| 路径 | 入口 | 是否走分页算法 | 是否清空 `body.className` |
|------|------|----------------|---------------------------|
| 编辑页预览 | `components/preview/PreviewPanel.tsx` → `lib/paginate.ts::paginateContent` | ✅ 是 | ✅ 是 |
| 导出 PDF/PNG | `lib/exportHtml.ts::paginateHTMLString` → `paginationCore::paginateResume` | ✅ 是 | ✅ 是（`paginateInIframe`） |
| 主页面模板卡片 | `routes/WelcomePage.tsx::TemplateCard` → `<iframe srcDoc>` | ❌ 否 | ❌ 否 |

- **编辑页预览 / 导出**：都会调用 `paginateContent`/`paginateResume`，而这条管线假设了一个固定的 DOM 结构（见 §2）。
- **主页面卡片**：直接把渲染结果塞进 `iframe srcDoc`，**不**分页、**不**清 class，因此完整保留了统一 HTML 的 `.resume-page` grid / 白底 / 默认页边距，看起来"和改造前一致"。

这就是 bug 二.1"主页面小屏渲染正常、编辑页崩坏"的原因——两条路径行为本来就不同，本次改造只破坏了"会分页"的那两条。

---

## 2. RC1：`.resume-container` 契约断裂（核心根因）

### 2.1 分页算法对旧结构的硬编码依赖

`frontend/src/lib/paginationCore.ts` 是整个分页的核心，它写死了以下 DOM 契约：

```
body.resume-page
└── .resume-container            ← 内容包裹层（分页算法从这里取"待切分的 sections"）
    ├── sidebar（双栏时第一个子节点，要求 .resume-container 是 flex row）
    └── main-content / 各 section（垂直堆叠时逐个切页）
```

关键代码：

```ts
// paginationCore.ts:131
const container = body.querySelector('.resume-container') as HTMLElement | null
if (!container) return empty          // ← 找不到 .resume-container 就直接返回 { pageCount: 1 }

// paginationCore.ts:135
const isTopLevelRow =
  containerStyle.display === 'flex' && containerStyle.flexDirection === 'row'

// paginationCore.ts:453  makePage：重建的页面壳也是 .resume-page > .resume-container
page.className = 'resume-page'
...
container.className = 'resume-container'
```

也就是说，分页算法只认两种布局：
1. **顶层 flex-row**：`.resume-container` 自身是 `display:flex; flex-direction:row`（旧 split / creative 的双栏）；
2. **垂直堆叠**：`.resume-container` 是普通块，子节点是各 section，逐个试放、放不下换页。

### 2.2 本次改造改掉了什么

统一 HTML（`templates/unified.html`）的骨架是：

```html
<body class="resume-page">
  <header class="r-header">…</header>
  <aside  class="r-aside">…</aside>
  <main   class="r-main">…各 section…</main>
</body>
```

- **没有 `.resume-container`**；
- 双栏不是 `.resume-container` 的 flex-row，而是 `.resume-page` 上的 **CSS Grid**（`display:grid; grid-template-areas: "aside header" "aside main"`）；
- section 不再是 `.resume-container` 的直接子节点，而是包在 `.r-main` 里。

16 套 `styles.css` 也随之删掉了 `.resume-container` 的样式。于是 `body.querySelector('.resume-container')` 返回 `null`。

### 2.3 触发链（一个断点，四个表象）

以编辑页预览为例，`paginate.ts::paginateContent` 的执行顺序是：

```ts
const pageStyle = readPageStyle(doc)        // 读 .resume-page 的 padding + 背景
const body = doc.body
body.className = ''                          // ① 清空 body 的 class（去掉 resume-page）
body.style.background = '#e5e7eb'            // ② 灰色预览外壳
body.style.padding = `${PAGE_GAP}px 0`
...
paginateResume(doc, body, {...pageStyle})    // ③ 找不到 .resume-container → 提前返回 pageCount=1
```

三个动作叠在一起，产生连锁后果：

| 动作 | 后果 | 对应 bug |
|------|------|----------|
| ③ `querySelector('.resume-container')` 返回 null → `paginateResume` 提前 `return empty`（`pageCount:1`），**不切页、不改 DOM** | 分页完全失效，所有内容留在"1 页" | 一.1（编辑页分页不生效） |
| ① `body.className=''` 清掉了 `.resume-page` | `.resume-page` 上定义的 `display:grid`（双栏）、`padding: var(--resume-padding,…)`（页边距）、`background:#fff`、`width:210mm; min-height:297mm` **全部丢失** | 一.3（双栏塌成单栏）、一.2（页边距失效） |
| ② 灰色 `#e5e7eb` 覆盖在 body 上，而白底原本靠 `.resume-page` 提供 | 白底没了，露出灰色预览外壳 | 一.3（页面为灰色） |

**为什么"页边距调整失效"**：页边距是通过 `injectLayoutCss` 写入 `:root { --resume-padding: … }`，再由 `.resume-page { padding: var(--resume-padding, 默认) }` 消费的。`body.className=''` 把 `.resume-page` 这条 padding 规则删了，变量注入得再准也没人消费 → 单栏模板页边距归零、贴边。
（双栏模板 aside/header/main 各自仍有 padding，所以"还能看到边距"，但整体布局已塌成单栏、且分页失效，"调整"也就失去了可观测意义——详见 §5 待确认点。）

### 2.4 导出"生硬截断"的原因（bug 一.1 后半段）

导出走同一条 `paginateResume`：

```ts
// exportHtml.ts::paginateInIframe
const pageStyle = readPageStyle(doc)
body.className = ''                            // 同样清 class
paginateResume(doc, body, {...pageStyle, pageMarginBottom:'0'})  // 同样找不到 .resume-container
```

`paginateResume` 提前返回后，`cleanAndSerialize` 里 `querySelectorAll('.resume-page')` 也匹配不到任何页面 → **gosume 自己的分页/分页符一个都没生成**。最终交给无头浏览器（rod/Chromium）的是一份连续单栏文档，**分页由 Chromium 的原生打印机制兜底**（按 A4 硬切）。这正是 bug 单作者自己的推测——"可能是 pdf 的行为，而不是 gosume 的分页算法"。

---

## 3. RC2：头像位置契约变更（bug 三.1）

旧单栏模板（modern / gradient / swiss / terminal / leaf / classic 等）的头像在 header **右侧**：

```html
<div class="header">                 <!-- flex, space-between -->
  <div class="header-left">姓名/职位…</div>
  {{if .Avatar}}<div class="header-avatar">…</div>{{end}}   <!-- 右侧 -->
</div>
```

统一骨架把头像放进 `.r-aside`，单栏 CSS 把 aside 铺成**标题下方的横向信息带**（头像在带的最左、后面跟着邮箱/手机/语言）：

```html
<header class="r-header">姓名/职位…</header>
<aside class="r-aside">
  {{if .Avatar}}<div class="r-avatar">…</div>{{end}}   <!-- 左侧 -->
  <div class="r-contact">邮箱/手机…</div>
  <div class="r-langs">语言…</div>
</aside>
```

于是头像"被拉到左侧、与邮箱手机挤在一块"。这是统一骨架的**布局契约**改动（头像载体从 header 右 → aside 左），与分页无关，是独立的第二根因。

---

## 4. 隐藏风险：分页算法只懂两种布局，grid 是"第三种"

即使简单地把 `.resume-container` 加回来，也不能真正修复双栏分页——因为：

- 旧双栏靠 `.resume-container` 的 `flex-row` 被识别（`isTopLevelRow`）；
- 新双栏是 `.resume-page` 上的 `grid`，`r-aside`/`r-header`/`r-main` 三个语义区，section 埋在 `.r-main` 里；
- 分页算法对"grid 布局 + 侧栏通高 + 主区流动"这种结构**没有对应模式**。

所以正确的修复方向不是"补一个 `.resume-container` 了事"，而是要让**分页算法与新的统一骨架重新对齐契约**（要么教算法识别 grid 语义区，要么给统一骨架补回算法能识别的结构 + 分页 meta 配置）。这决定了修复的复杂度，也解释了为什么这批 bug 不能逐个打补丁、必须整体回归渲染管线。

---

## 5. Bug ↔ 根因 映射表

| bug | 表象 | 根因 | 说明 |
|-----|------|------|------|
| 一.1 | 编辑页分页不生效、内容挤一页 | RC1 | `paginateResume` 找不到 `.resume-container` 提前返回 `pageCount=1` |
| 一.1（导出） | PDF 分页生硬、直接截断 | RC1 | gosume 分页未运行，Chromium 原生打印分页兜底 |
| 一.2 | 页边距调整失效、贴边 | RC1 | `body.className=''` 删掉 `.resume-page{padding}`，`--resume-padding` 无人消费 |
| 一.3 | 双栏在编辑页塌成单栏、页面灰色 | RC1 | `body.className=''` 删掉 `.resume-page{display:grid;background:#fff}` |
| 二.1 | 主页面小屏渲染正常、与编辑页不一致 | RC1 的对照面 | 主页面卡片走 `iframe srcDoc`，不分页、不清 class，故未受影响 |
| 三.1 | 头像从右→左、与联系方式挤一块 | RC2 | 统一骨架头像载体从 header 右 → aside 左 |

---

## 6. 修复方向（仅列方向，待下一步方案）

1. **重建"统一骨架 ↔ 分页算法"的 DOM 契约**：让分页算法能识别新骨架的双栏（grid）与单栏（垂直 section）两种形态——优先方案是给统一 HTML 引入算法可消费的结构（例如恢复一个包裹层，或加 `<meta name="gosume-pagination">` 配置把 `r-aside` 标为 sidebar、`r-main` 标为 flow），并让分页核心支持 grid 布局模式。
2. **修正页边距消费方式**：让 `--resume-padding` 在"分页后生成的 `.resume-page` 壳"上仍能正确落位（分页重建页面壳时，padding 目前是从 `readPageStyle` 抓的快照，需与新的网格布局语义对齐）。
3. **头像位置契约对齐**：把头像在单栏模板中的位置改回"右上/右侧"，或调整 aside 在单栏下的布局，使头像不落在联系方式左侧（需产品确认期望位置）。
4. **回归验证**：修复后需对 16 套模板在三条路径（编辑页 / 主页面卡片 / 导出）各做一次对照，尤其双栏模板的跨页表现与页边距档位。

---

## 7. 待进一步确认/验证的点

- **一.2 中"双栏模板页边距调整不了"的精确机制**：当前分析确定单栏"页边距归零"是 `body.className` 被清所致；双栏的"存在边距但调不了"是否另有变量注入顺序/选择器优先级问题，需在修复时用双栏模板实际验证一次，避免漏掉次级问题。
- **头像最终期望位置**：是恢复到旧版"右侧"，还是接受新的"左侧/信息带"布局，属于产品决策，需确认后再定 RC2 的修法。
- **`.resume-page` 作为 `<body>` 这一约定本身**：预览外壳需要"清 body class 来装灰色分页壳"，而统一 HTML 又把页面样式全压在 body 上，二者天然冲突。修复时应考虑是否把"页面样式"从 body 下沉到一个内层 `.resume-page`/包裹层，从根上解除这一冲突（这也影响 RC1 的最终解法）。

---

## 8. 修复记录（已落地，产品拍板：最优解法 + 头像右置）

按产品确认的两点执行，采用"重建显式 DOM 契约 + 分页算法认识新语义区 + 头像右置"的整体方案（非逐条打补丁）：

1. **恢复显式 DOM 契约**：统一 HTML 改为
   `body(中性) > .resume-page(单页单元) > .resume-container(内容包裹层) > [.r-header, .r-aside, .r-main]`。
   - 页面尺寸/页边距/白底下沉到内层 `.resume-page`，body 不再承载页面样式 → 预览外壳"清 body class 装灰壳"不再破坏页面（解除 §7 待确认点①）。
   - 恢复 `.resume-container`，分页算法重新找到内容包裹层。
2. **分页算法认识新语义区**（`paginationCore.ts` 重写）：按 `.resume-container` 的 computed `display==grid` 区分双栏/单栏；
   - 双栏：`.r-aside` 为持久侧栏（续页重复壳）、`.r-header` 仅首页、`.r-main` 章节流动；
   - 单栏：header/aside 为普通前置块、`.r-main` 章节垂直流动。
   复用 `makePage/overflows/placeSection/newPage`（`newPage` 支持双栏重建侧栏壳 + main 壳）。
3. **头像右置**（RC2）：头像从 `.r-aside` 移到 `.r-header` 右侧（左文字右照片），16 套模板 CSS 同步适配。
4. **16 套 `styles.css` 重写**适配新契约：双栏（split/creative）用 grid，其余 14 套单栏用 block + header 姓名左头像右 + aside 横向信息带。

**验证**：`go build ./pkg/...` + `go test ./pkg/...` 全绿（渲染测试断言已随契约更新）；前端 `vite build` 通过。
**待人工 QA**：分页的视觉行为（跨页、双栏侧栏续页、页边距档位）需在应用内跑一次 `task dev` 逐套预览确认——本会话无法运行 GUI，此项未自动化覆盖。
