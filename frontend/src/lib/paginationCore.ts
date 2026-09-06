/**
 * Shared pagination core for resume content.
 *
 * Used by both the live preview (paginate.ts) and the export pipeline
 * (export-html.ts) so that "what you see is what you export".
 *
 * DOM contract (Gosume 一期 · 优化版) — MUST stay in sync with
 * `templates/template.html` and `templates/AGENTS.md`:
 *
 *   <body>
 *     <div class="resume-page">        ← one page (size + margin + background)
 *       <div class="resume-container"> ← content wrapper the paginator splits
 *         <header class="r-header">    ← personal info (text/avatar/contact/langs)
 *         <main   class="r-main">      ← sections (flat: section-title + items)
 *       </div>
 *     </div>
 *   </body>
 *
 * Layout mode is driven by the template's CSS, not by guessing:
 *   - Single column: `.resume-container` is `display: block`.
 *     `.r-header` stacks above `.r-main`. The header is placed once on page 1
 *     as a leading block; `.r-main`'s children flow across pages. The `.r-main`
 *     shell is preserved on every page so its own padding/background survives
 *     pagination (e.g. templates that keep their content margin on `.r-main`).
 *   - Double column: `.resume-container` is `display: grid` with two columns
 *     (`grid-template-columns: <sidebar> 1fr`). `.r-header` IS the sidebar
 *     (left or right, full height); its shell is repeated on every page with
 *     content only on page 1, and `.r-main`'s children flow in the main column.
 *
 * IMPORTANT: page padding + background must be captured by the caller via
 * `readPageStyle(doc)` BEFORE the caller repaints body for the preview/print
 * chrome. If captured afterwards, the chrome values leak into the page
 * measurements and the pages end up with the wrong background / padding.
 *
 * M1/M2 细粒度分页：条目放不下当前页剩余空间时，按内部组件（标题行/摘要/bullet 等）
 * 拆分跨页（M1 fill-until-overflow）；段落/单条 bullet 超长时按行断页（M2，R4 孤儿/寡行）。
 * 拆分产物为「头部部分克隆（保留 data-id）+ 续接部分克隆（data-id 替换为 data-cont-of，
 * 避免预览 FLIP 以 data-id 为稳定 key 时两页克隆冲突）」；两类克隆均复用原类名，
 * 模板 CSS 的间距/字体注入规则自动生效。
 */

import { DEFAULT_PAPER, resolvePaper, type PaperSpec } from './paper'
import { splitLinesInPlace } from './paginationLines'

export interface PageStyle {
  padTop: number
  padRight: number
  padBottom: number
  padLeft: number
  pageBg: string
  paper: PaperSpec
}

export type PageMode = 'paged' | 'continuous'

export interface PaginateOptions extends PageStyle {
  pageMarginBottom?: string
  mode?: PageMode
}

export interface PaginateResult {
  wrapper: HTMLElement
  pageCount: number
}

export interface PageCtx {
  doc: Document
  wrapper: HTMLElement
  padTop: number
  padRight: number
  padBottom: number
  padLeft: number
  pageBg: string
  pageMarginBottom: string
  paper: PaperSpec
  double: boolean
  header: HTMLElement | null
  main: HTMLElement | null
}

export interface Cursor {
  page: HTMLElement
  container: HTMLElement
  count: number
}

/** px slack when comparing scrollHeight vs offsetHeight (sub-pixel rounding). */
export const OVERFLOW_TOLERANCE = 2
/**
 * Upper bound on recursion depth when splitting an oversized section.
 * Real template DOM depth is far below this bound; the cap only guards against
 * pathological cycles. An oversized section is split down to its leaf children
 * so nothing is silently dropped — the only kept-whole case is a leaf whose own
 * height exceeds a full page (a single text block that cannot be split further).
 */
export const MAX_SPLIT_DEPTH = 12

/** 块级标签：存在块级子元素的元素是「容器」（可组件级拆分 / 不可行级拆分）。 */
const BLOCK_TAGS = new Set([
  'P', 'UL', 'OL', 'LI', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'TABLE', 'BLOCKQUOTE', 'PRE', 'SECTION', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE',
])

/**
 * 语义整体组件：即使含块级子元素也整体保留（不组件级拆分、不按行拆分）。
 * 仅登记「结构上无法自动识别、但必须保持完整」的语义行——
 *   标题行（exp-header / edu-header）、技能指示（skill-item / skill-dots）、
 *   模块标题（section-title，叶子但不得按行断）。
 * 其余组件一律按结构规则通用化：叶子（无块级子元素）→ 原子/可拆行；
 * 含块级子元素且非本集合 → 按子组件拆分。新增模板组件无需再改此表，
 * 除非它是「一行式语义单元（标题行/指示器等）且内部含块级子元素」。
 */
const KEEP_WHOLE = new Set(['section-title', 'exp-header', 'edu-header', 'skill-item', 'skill-dots'])

/** 是否含块级子元素（决定组件级可拆 / 行级可拆的通用结构规则）。 */
function hasBlockChild(el: HTMLElement): boolean {
  for (const c of Array.from(el.children)) {
    if (BLOCK_TAGS.has(c.tagName)) return true
  }
  return false
}

/** 是否为标题标签（h1-h6）：标题保持整体，不得按行断。 */
function isHeadingTag(el: HTMLElement): boolean {
  const t = el.tagName
  return t.length === 2 && t[0] === 'H' && t[1] >= '1' && t[1] <= '6'
}

/**
 * Reads the original `.resume-page` element's padding + background.
 * Must be called BEFORE the caller mutates body styles.
 */
export function readPageStyle(doc: Document): PageStyle | null {
  const el = doc.querySelector('.resume-page') as HTMLElement | null
  if (!el) return null
  const s = doc.defaultView!.getComputedStyle(el)
  return {
    padTop: parseFloat(s.paddingTop) || 0,
    padRight: parseFloat(s.paddingRight) || 0,
    padBottom: parseFloat(s.paddingBottom) || 0,
    padLeft: parseFloat(s.paddingLeft) || 0,
    pageBg: s.backgroundColor || '#ffffff',
    paper: resolvePaper(el.dataset.paperSize, el.dataset.orientation),
  }
}

/**
 * Waits until fonts and images in `doc` are ready so pagination measures the
 * final layout instead of a half-loaded one (avatars, custom fonts). Never
 * rejects — a hung image only delays up to its timeout.
 */
export async function waitForDocumentReady(doc: Document): Promise<void> {
  try {
    await doc.fonts.ready
  } catch {
    /* fonts.ready unsupported in some environments */
  }

  const images = Array.from(doc.images) as HTMLImageElement[]
  if (images.length === 0) return
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve()
            return
          }
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
          setTimeout(done, 3000)
        }),
    ),
  )
}

/**
 * Splits the `.resume-container` content into A4 pages using the provided
 * `PageStyle` for each page's padding + background.
 * Returns the wrapper holding all pages and the page count.
 */
export function paginateResume(
  doc: Document,
  body: HTMLElement,
  options: PaginateOptions,
  sourceEl?: HTMLElement,
  targetEl?: HTMLElement,
): PaginateResult {
  const pageMarginBottom = options.pageMarginBottom ?? '0'
  const empty: PaginateResult = { wrapper: doc.createElement('div'), pageCount: 1 }

  // 源/目标分离：实时预览从「隐藏源容器」读内容、把分页结果写进「展示层」，
  // 从而在分页后仍能对源容器做增量 diff（方案 4）。默认 body（导出路径不变）。
  const source = sourceEl ?? body
  const target = targetEl ?? body

  const container = source.querySelector('.resume-container') as HTMLElement | null
  if (!container) return empty

  const double = isDoubleColumn(doc, container)
  const header = container.querySelector('.r-header') as HTMLElement | null
  const main = container.querySelector('.r-main') as HTMLElement | null
  const mainSections = main ? (Array.from(main.children) as HTMLElement[]) : []

  const wrapper = doc.createElement('div')
  wrapper.className = 'resume-pages-wrapper'
  target.replaceChildren(wrapper)

  const ctx: PageCtx = {
    doc,
    wrapper,
    padTop: options.padTop,
    padRight: options.padRight,
    padBottom: options.padBottom,
    padLeft: options.padLeft,
    pageBg: options.pageBg,
    pageMarginBottom,
    paper: options.paper ?? DEFAULT_PAPER,
    double,
    header,
    main,
  }

  if (options.mode === 'continuous') {
    paginateContinuous(ctx, header, main, mainSections)
    return { wrapper, pageCount: 1 }
  }

  const cursor: Cursor = { page: makePage(ctx), container: null as unknown as HTMLElement, count: 1 }
  wrapper.appendChild(cursor.page)

  const c = cursor.page.querySelector('.resume-container') as HTMLElement
  // Page 1 carries the header (personal info). In double mode it is the full
  // sidebar content; in single mode it is the leading block.
  if (header) c.appendChild(header.cloneNode(true))
  // The .r-main shell carries the flowing sections on every page — this preserves
  // its own padding/background on continuation pages too, instead of flattening
  // the sections onto the bare container.
  cursor.container = appendMainShell(c, main)
  placeSections(ctx, cursor, mainSections)

  return { wrapper, pageCount: cursor.count }
}

function isDoubleColumn(doc: Document, container: HTMLElement): boolean {
  const s = doc.defaultView!.getComputedStyle(container)
  if (s.display !== 'grid') return false

  // A single-column template may still use `display: grid` for its header area,
  // so `display === 'grid'` alone over-detects. The reliable signal for a
  // double-column layout is that `.r-header` (the sidebar) sits side-by-side
  // with `.r-main` and vertically overlaps it.
  const header = container.querySelector('.r-header') as HTMLElement | null
  const main = container.querySelector('.r-main') as HTMLElement | null
  if (header && main) {
    const hr = header.getBoundingClientRect()
    const mr = main.getBoundingClientRect()
    const sideBySide = hr.right <= mr.left + 1 || mr.right <= hr.left + 1
    const verticallyOverlapping = hr.bottom > mr.top + 1 && mr.bottom > hr.top + 1
    return sideBySide && verticallyOverlapping
  }

  // Fallback: no header/main present — fall back to a single-row grid area.
  const areas = s.gridTemplateAreas
  if (areas && areas !== 'none') {
    return areas.split('"').filter((seg) => seg.trim().length > 0).length === 1
  }
  return false
}

/**
 * Creates (and appends) the `.r-main` shell for a page and returns it as the
 * flow target. Falls back to the container itself when the template has no
 * `.r-main` (defensive).
 */
function appendMainShell(container: HTMLElement, main: HTMLElement | null): HTMLElement {
  if (!main) return container
  const shell = main.cloneNode(false) as HTMLElement
  container.appendChild(shell)
  return shell
}

// ── 分页放置（M1 组件级 + M2 行级细粒度分页）──────────────────────────────
// 流水线：placeSections（标题链 + 逐条目放置）
//   → placeSection（整块优先 / 按子组件填充 / 行级拆分 / 原子块移页）
//   → fillChildren（fill-until-overflow）
//   → splitBlockInPlace（容器按子项拆） / splitLinesInPlace（文本块按行拆）
// 拆分产物：头部部分克隆（保留 data-id）+ 续接部分克隆（data-cont-of）。

/**
 * Places the flat list of `.r-main` children in order. Module headings (`.section-title`)
 * flow independently from the entries that follow: they are kept with the entry only when
 * they would otherwise be clipped by a full page.
 *
 * R1（标题保持，已收紧救援）：标题放不下「标题 + 整条条目」时走慢路径——先把标题放在
 * 当前页，条目再按组件填满当前页；仅当标题本身放不下当前页（页面已满，会被裁剪）时，
 * 才随条目头部一起移到续页。若页面还有空位，标题留在页底填满页面——模块标题与条目标题
 * 允许跨页分离（用户期望），不强制粘滞。
 * 连续标题（空模块，如自定义模块无条目）作为「标题链」整体参与 R1，避免链中
 * 标题孤立在页底。
 */
function placeSections(ctx: PageCtx, cursor: Cursor, sections: HTMLElement[]): void {
  // 挂起的标题链（连续 .section-title；空模块会产生长度 >1 的链）
  let pendingTitles: HTMLElement[] = []

  // 放置「标题链 + 条目」：标题链与条目头部同页（R1），整链放置避免孤标题
  const placeWithSection = (section: HTMLElement): void => {
    if (pendingTitles.length === 0) {
      placeSection(ctx, cursor, section, 0)
      return
    }
    const titles = pendingTitles
    pendingTitles = []
    // 快路径：标题链 + 整条条目放得下 → 整段放置
    if (blockFits(ctx, cursor, [...titles, section])) {
      for (const t of titles) placeBlock(cursor, t)
      placeSection(ctx, cursor, section, 0)
      return
    }
    // 慢路径：先放标题链，条目按组件填充；标题链若成为页底孤儿且页面已满则随条目头部下移。
    // 孤儿判定：标题链是所在页容器的最后一个子元素（其后无任何内容）。
    // 救援条件收紧：仅当标题链「本身放不下当前页（会把页面撑满/被裁剪）」时才移入续页；
    // 若页面还有空位，标题链留在页底填满页面——模块标题与条目标题允许跨页分离，不粘滞。
    const titleClones = titles.map((t) => placeBlock(cursor, t))
    const titleContainer = cursor.container
    const titlePage = cursor.page
    const contContainer = placeSection(ctx, cursor, section, 0)
    const orphaned = titleContainer.lastChild === titleClones[titleClones.length - 1]
    if (orphaned && contContainer && overflows(titlePage)) {
      for (const c of titleClones) titleContainer.removeChild(c)
      for (let j = 0; j < titleClones.length; j++) {
        contContainer.insertBefore(titleClones[j], contContainer.childNodes[j])
      }
    }
  }

  for (const section of sections) {
    if (isSectionTitle(section)) {
      pendingTitles.push(section)
      continue
    }
    placeWithSection(section)
  }
  // 末尾悬空标题链（文档末尾的空模块标题）：无后续内容可孤立，平铺放置
  for (const t of pendingTitles) placeBlock(cursor, t)
}

// ── 分类判定与放置工具 ─────────────────────────────────────────────────────

/** True when the element is a module heading (`.section-title`). */
function isSectionTitle(el: HTMLElement): boolean {
  return el.classList.contains('section-title')
}

/** Places a leaf block (a short heading) directly into the flow target and
 *  returns the appended clone（调用方可用它判断标题是否成为页底孤儿）。 */
function placeBlock(cursor: Cursor, block: HTMLElement): HTMLElement {
  const clone = block.cloneNode(true) as HTMLElement
  cursor.container.appendChild(clone)
  return clone
}

/**
 * Probes whether `blocks` (cloned and appended in order) fit the current page
 * without overflowing. Always restores the flow target afterwards.
 */
function blockFits(ctx: PageCtx, cursor: Cursor, blocks: HTMLElement[]): boolean {
  const clones = blocks.map((b) => b.cloneNode(true) as HTMLElement)
  for (const c of clones) cursor.container.appendChild(c)
  void cursor.page.offsetHeight
  const fits = !overflows(cursor.page)
  for (const c of clones) cursor.container.removeChild(c)
  return fits
}

/**
 * M1 可拆判断（通用结构规则）：含块级子元素、未达深度上限、且非「语义整体」的
 * 容器，允许按子节点拆分（条目/列表/技能区/总结容器等）。叶子一律不可组件级拆分。
 */
function canSplit(el: HTMLElement, depth: number): boolean {
  if (depth >= MAX_SPLIT_DEPTH) return false
  if (!hasBlockChild(el)) return false
  for (const cls of Array.from(el.classList)) {
    if (KEEP_WHOLE.has(cls)) return false
  }
  return true
}

/**
 * M2 行级拆分判断（通用结构规则）：叶子文本块（无块级子元素、有文本内容、
 * 非标题/语义整体）即可按行拆分——不再依赖模板类名名单，新增段落类组件自动生效。
 * 存在块级子元素的容器（如 exp-summary 内含多个 `<p>`/`<ul>`）交给组件级拆分。
 */
function canSplitLines(el: HTMLElement, depth: number): boolean {
  if (depth >= MAX_SPLIT_DEPTH) return false
  if (!(el.textContent ?? '').trim()) return false
  if (isHeadingTag(el)) return false
  if (hasBlockChild(el)) return false
  for (const cls of Array.from(el.classList)) {
    if (KEEP_WHOLE.has(cls)) return false
  }
  return true
}

// ── 部分克隆与收尾 ─────────────────────────────────────────────────────────

/**
 * 构建部分克隆：
 * - 头部部分克隆（isContinuation=false）：保留原属性（含 data-id），用于留在当前页的部分；
 * - 续接部分克隆（isContinuation=true）：去掉 data-id、改为 data-cont-of 标记，
 *   避免与头部部分克隆产生重复 FLIP key（PreviewPanel 以 data-id 为稳定 key；
 *   若原节点已是续接克隆，保留其 data-cont-of）。
 */
function makePartialClone(original: HTMLElement, children: HTMLElement[], isContinuation: boolean): HTMLElement {
  const clone = original.cloneNode(false) as HTMLElement
  if (isContinuation) {
    const id = clone.getAttribute('data-id') ?? clone.getAttribute('data-cont-of')
    if (id) {
      clone.removeAttribute('data-id')
      clone.setAttribute('data-cont-of', id)
    }
  }
  for (const c of children) clone.appendChild(c.cloneNode(true))
  return clone
}

interface FillResult {
  /** 未放在当前页、需要续页的子组件列表（原始引用 / 部分克隆）。 */
  tail: HTMLElement[]
  /** 当前页是否放置了本块的内容（false 表示头部为空壳被移除）。 */
  headPlaced: boolean
}

/**
 * 收尾：头部为空壳（本块在当前页一个组件都没放下）时从页面移除。
 * 返回续页列表与「头部是否放置了内容」。
 * 注意：不做「标题行保持」（R2 已移除）——条目标题行放得下就留在当前页，
 * 即使其后内容续到下一页也不回拉，避免「模块标题 + 条目标题行」整段粘滞到下一页。
 */
function finishFill(cursor: Cursor, head: HTMLElement, tail: HTMLElement[]): FillResult {
  const headPlaced = head.children.length > 0
  if (!headPlaced) cursor.container.removeChild(head)
  return { tail, headPlaced }
}

// ── 核心拆分流水线（fill-until-overflow）───────────────────────────────────

/**
 * 用 `block` 的子组件尽量填满当前页剩余空间（fill-until-overflow）：
 * 逐个放入子组件，放满为止；放不下的子组件若自身可拆（如列表按 li）则原地拆，
 * 其余子组件整体进入续页列表。返回续页列表与「是否放置了头部」。
 */
function fillChildren(ctx: PageCtx, cursor: Cursor, block: HTMLElement, depth: number): FillResult {
  const children = Array.from(block.children) as HTMLElement[]
  const head = block.cloneNode(false) as HTMLElement
  cursor.container.appendChild(head)
  void cursor.page.offsetHeight

  // 收尾统一：空壳清理（headPlaced 判定）在 finishFill 内完成
  const finishWith = (tail: HTMLElement[]): FillResult => finishFill(cursor, head, tail)

  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    const c = child.cloneNode(true) as HTMLElement
    if (tryAppend(head, c, cursor.page)) continue

    head.removeChild(c)

    // 子组件本身可拆（如列表按 li）→ 原地拆，其续接部分与后续兄弟一起续页；
    // 拆分失败（放不下）→ 视为原子整体续页
    if (canSplit(child, depth + 1)) {
      const childTails = splitBlockInPlace(ctx, cursor, child, head, depth + 1)
      return finishWith(childTails ? [...childTails, ...children.slice(i + 1)] : children.slice(i))
    }

    // M2 行级拆分：段落 / 单条 bullet 按行断页
    if (canSplitLines(child, depth + 1)) {
      const lineTail = splitLinesInPlace(ctx, cursor, child, head, depth + 1)
      return finishWith(lineTail ? [lineTail, ...children.slice(i + 1)] : children.slice(i))
    }

    // 原子子组件 → 整体续页
    return finishWith(children.slice(i))
  }

  return { tail: [], headPlaced: true }
}

/**
 * 在当前位置拆分 `child`：把尽量多的子组件放进 `headParent` 内的部分克隆，
 * 返回续接部分克隆列表（null 表示放弃拆分，`child` 整体续页）。
 * 列表（highlights/ul 等）严格按 `<li>` 粒度拆分，不做「最小项」限制——
 * 续页只剩 1 个矮项也照常拆分，避免整段下移 / 回退拆分点造成当前页欠填充、
 * 多项亮点粘滞在下一页。M2：放不下的子项若是文本块（如超长 `<li>`），
 * 改为行级拆分留部分在当前页。
 */
function splitBlockInPlace(
  ctx: PageCtx,
  cursor: Cursor,
  child: HTMLElement,
  headParent: HTMLElement,
  depth: number,
): HTMLElement[] | null {
  const head = child.cloneNode(false) as HTMLElement
  headParent.appendChild(head)
  void cursor.page.offsetHeight

  const kids = Array.from(child.children) as HTMLElement[]
  let placed = 0
  for (; placed < kids.length; placed++) {
    const c = kids[placed].cloneNode(true) as HTMLElement
    if (tryAppend(head, c, cursor.page)) continue

    head.removeChild(c)
    // M2：放不下的子项若是文本块，尝试行级拆分（部分留在当前页）
    if (canSplitLines(kids[placed], depth)) {
      const lineTail = splitLinesInPlace(ctx, cursor, kids[placed], head, depth + 1)
      if (lineTail) return [lineTail, ...kids.slice(placed + 1)]
    }
    break
  }

  if (placed === 0) {
    headParent.removeChild(head)
    return null
  }

  const tailKids = kids.slice(placed)
  if (tailKids.length === 0) {
    headParent.removeChild(head)
    return null
  }

  return [makePartialClone(child, tailKids, true)]
}

/**
 * 放置 `section` 到当前页流目标（M1 组件级 fill-until-overflow + M2 行级拆分）：
 * - 整块放得下 → 直接放置（快路径）；
 * - 放不下且可拆 → 用子组件填满当前页，续接部分换页递归；
 * - 放不下且为文本块 → 行级拆分（M2），头部留在当前页；
 * - 原子/深度上限 → 整体移到新页。
 *
 * 返回值：null = 头部落在当前页；非 null = 头部落在返回的续页容器
 * （当前页无该块内容，供 R1 标题孤儿判定）。
 */
function placeSection(ctx: PageCtx, cursor: Cursor, section: HTMLElement, depth: number): HTMLElement | null {
  const clone = section.cloneNode(true) as HTMLElement
  if (tryAppend(cursor.container, clone, cursor.page)) return null

  cursor.container.removeChild(clone)

  if (canSplit(section, depth)) {
    const fill = fillChildren(ctx, cursor, section, depth)
    if (fill.tail.length === 0) return null

    newPage(ctx, cursor)
    const contContainer = cursor.container
    placeSection(ctx, cursor, makePartialClone(section, fill.tail, true), depth + 1)
    return fill.headPlaced ? null : contContainer
  }

  // M2 行级拆分：顶层文本块（如 .summary）按行断页，头部留在当前页
  if (canSplitLines(section, depth)) {
    const lineTail = splitLinesInPlace(ctx, cursor, section, cursor.container, depth)
    if (lineTail) {
      newPage(ctx, cursor)
      placeSection(ctx, cursor, lineTail, depth + 1)
      return null
    }
    // 拆分失败（R4 孤儿/寡行等）→ 按原子块处理（整块移页，下方分支）
  }

  // 原子块 / 深度上限：整块移到新页；仍溢出则整体保留（R5，裁剪显示）。
  // 主栏为空 ≠ 页面为空：单栏第 1 页的 .r-header 位于主栏上方，会挤占可用高度——
  // 一个「能放下空白整页、却放不下第 1 页」的原子块应换页放置，避免被裁剪丢内容。
  let contContainer: HTMLElement | null = null
  if (!pageIsBlank(ctx, cursor)) {
    newPage(ctx, cursor)
    contContainer = cursor.container
  }
  cursor.container.appendChild(clone)
  void cursor.page.offsetHeight
  return contContainer
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function newPage(ctx: PageCtx, cursor: Cursor): void {
  cursor.page = makePage(ctx)
  ctx.wrapper.appendChild(cursor.page)
  const c = cursor.page.querySelector('.resume-container') as HTMLElement
  if (ctx.double && ctx.header) c.appendChild(ctx.header.cloneNode(false))
  cursor.container = appendMainShell(c, ctx.main)
  cursor.count++
}

function overflows(page: HTMLElement): boolean {
  return page.scrollHeight > page.offsetHeight + OVERFLOW_TOLERANCE
}

/** 把 `el` 追加进 `parent` 并强制回流，返回页面是否放得下（不负责移除）。 */
function tryAppend(parent: HTMLElement, el: HTMLElement, page: HTMLElement): boolean {
  parent.appendChild(el)
  void page.offsetHeight
  return !overflows(page)
}

/** 页面是否可视为空白：主栏无内容，且不是「单栏第 1 页」（其 .r-header 在主栏上方，会挤占高度）。 */
function pageIsBlank(ctx: PageCtx, cursor: Cursor): boolean {
  return cursor.container.children.length === 0 && !(cursor.count === 1 && !ctx.double && !!ctx.header)
}

function makePage(ctx: PageCtx): HTMLElement {
  const page = ctx.doc.createElement('div')
  page.className = 'resume-page'
  page.style.cssText = `width: ${ctx.paper.mmW}mm;height: ${ctx.paper.mmH}mm;padding: ${ctx.padTop}px ${ctx.padRight}px ${ctx.padBottom}px ${ctx.padLeft}px;overflow: hidden;background: ${ctx.pageBg};margin: 0 auto ${ctx.pageMarginBottom};box-sizing: border-box;`
  const container = ctx.doc.createElement('div')
  container.className = 'resume-container'
  container.style.maxWidth = '100%'
  page.appendChild(container)
  return page
}

/**
 * Builds a single seamless page holding all content, sized to its own height
 * (used by PNG export). Top/bottom page margins are applied once to the wrapper;
 * left/right margins stay on the page so text wraps at the correct width. No
 * fixed height, no overflow clipping, no page breaks.
 */
function paginateContinuous(
  ctx: PageCtx,
  header: HTMLElement | null,
  main: HTMLElement | null,
  mainSections: HTMLElement[],
): void {
  ctx.wrapper.style.background = ctx.pageBg
  ctx.wrapper.style.paddingTop = `${ctx.padTop}px`
  ctx.wrapper.style.paddingBottom = `${ctx.padBottom}px`
  ctx.wrapper.setAttribute('data-pad-top', String(ctx.padTop))
  ctx.wrapper.setAttribute('data-pad-bottom', String(ctx.padBottom))

  const page = ctx.doc.createElement('div')
  page.className = 'resume-page'
  page.style.cssText = `width: ${ctx.paper.mmW}mm;min-height: 0;padding: 0 ${ctx.padRight}px 0 ${ctx.padLeft}px;overflow: visible;background: ${ctx.pageBg};margin: 0 auto;box-sizing: border-box;`
  const container = ctx.doc.createElement('div')
  container.className = 'resume-container'
  container.style.maxWidth = '100%'
  container.style.minHeight = '0'
  page.appendChild(container)
  ctx.wrapper.appendChild(page)

  if (header) container.appendChild(header.cloneNode(true))
  const target = appendMainShell(container, main)
  for (const section of mainSections) target.appendChild(section.cloneNode(true))
}
