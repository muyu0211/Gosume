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
 */

import { DEFAULT_PAPER, resolvePaper, type PaperSpec } from './paper'

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
  /** CSS `margin-bottom` applied to each `.resume-page`. */
  pageMarginBottom?: string
  /**
   * 'paged' (default) splits content into fixed-size pages; 'continuous'
   * produces a single seamless page sized to its content, used for PNG export.
   */
  mode?: PageMode
}

export interface PaginateResult {
  wrapper: HTMLElement
  pageCount: number
}

interface PageCtx {
  doc: Document
  wrapper: HTMLElement
  padTop: number
  padRight: number
  padBottom: number
  padLeft: number
  pageBg: string
  pageMarginBottom: string
  /** Paper spec the generated pages are sized to. */
  paper: PaperSpec
  /** true when the template is double-column (grid layout). */
  double: boolean
  /** Reference to the original `.r-header` (personal info block; persistent
   *  sidebar in double mode, one-time leading block in single mode). */
  header: HTMLElement | null
  /** Reference to the original `.r-main` (the flow wrapper). */
  main: HTMLElement | null
}

interface Cursor {
  page: HTMLElement
  /** The element that receives flowing section clones (`.resume-container`
   *  in single mode, `.r-main` shell in double mode). */
  container: HTMLElement
  count: number
}

/** px slack when comparing scrollHeight vs offsetHeight (sub-pixel rounding). */
const OVERFLOW_TOLERANCE = 2
/**
 * Upper bound on recursion depth when splitting an oversized section.
 * Real template DOM depth is far below this bound; the cap only guards against
 * pathological cycles. An oversized section is split down to its leaf children
 * so nothing is silently dropped — the only kept-whole case is a leaf whose own
 * height exceeds a full page (a single text block that cannot be split further).
 */
const MAX_SPLIT_DEPTH = 12

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

// ── Section placement ───────────────────────────────────────────────────────

/**
 * Places the flat list of `.r-main` children in order, keeping each
 * `.section-title` on the same page as the first entry that follows it, so a
 * module heading never ends up orphaned at the bottom of a page.
 */
function placeSections(ctx: PageCtx, cursor: Cursor, sections: HTMLElement[]): void {
  let pendingTitle: HTMLElement | null = null

  for (const section of sections) {
    if (isSectionTitle(section)) {
      if (pendingTitle) placeBlock(cursor, pendingTitle)
      pendingTitle = section
      continue
    }

    if (pendingTitle) {
      const title = pendingTitle
      pendingTitle = null
      // Keep the title on the same page as the first piece of the entry that
      // follows it. Probe "title + first piece" together; if they don't fit the
      // current page, move both to a fresh page. The entry's remaining pieces
      // are then flowed via placeChildren, so only the tail may spill over.
      const first = firstPiece(section)
      if (blockFits(ctx, cursor, [title, first])) {
        placeBlock(cursor, title)
        placeChildren(ctx, cursor, section, 0)
      } else {
        newPage(ctx, cursor)
        placeBlock(cursor, title)
        placeChildren(ctx, cursor, section, 0)
      }
      continue
    }

    placeSection(ctx, cursor, section, 0)
  }

  if (pendingTitle) placeBlock(cursor, pendingTitle)
}

/** True when the element is a module heading (`.section-title`). */
function isSectionTitle(el: HTMLElement): boolean {
  return el.classList.contains('section-title')
}

/** Places a leaf block (a short heading) directly into the flow target. */
function placeBlock(cursor: Cursor, block: HTMLElement): void {
  cursor.container.appendChild(block.cloneNode(true))
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

/** Returns the first element child of a section, or the section itself if it
 *  is a leaf. Used to keep a heading attached to the start of an entry. */
function firstPiece(section: HTMLElement): HTMLElement {
  const first = section.firstElementChild as HTMLElement | null
  return first ?? section
}

/**
 * Flows a section's children individually so an oversized section can break
 * across pages at its child boundaries. A leaf section falls back to placing
 * the whole block (kept whole if it still overflows).
 */
function placeChildren(ctx: PageCtx, cursor: Cursor, section: HTMLElement, depth: number): void {
  const children = Array.from(section.children) as HTMLElement[]
  if (children.length === 0) {
    placeSection(ctx, cursor, section, depth)
    return
  }
  for (const child of children) placeSection(ctx, cursor, child, depth + 1)
}

/**
 * Places `section` into the current page's flow target. If it overflows the
 * page: start a fresh page; if it still overflows alone, split it by its own
 * children (down to leaves). A leaf that exceeds a full page is kept whole so
 * its visible portion renders rather than being dropped.
 */
function placeSection(ctx: PageCtx, cursor: Cursor, section: HTMLElement, depth: number): void {
  const clone = section.cloneNode(true) as HTMLElement
  cursor.container.appendChild(clone)
  void cursor.page.offsetHeight

  if (!overflows(cursor.page)) return

  cursor.container.removeChild(clone)
  const currentEmpty = cursor.container.children.length === 0

  if (!currentEmpty) {
    newPage(ctx, cursor)
    cursor.container.appendChild(clone)
    void cursor.page.offsetHeight
    if (!overflows(cursor.page)) return
    cursor.container.removeChild(clone)
  }

  if (depth < MAX_SPLIT_DEPTH && section.children.length > 0) {
    placeChildren(ctx, cursor, section, depth)
  } else {
    cursor.container.appendChild(clone)
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function newPage(ctx: PageCtx, cursor: Cursor): void {
  cursor.page = makePage(ctx)
  ctx.wrapper.appendChild(cursor.page)
  const c = cursor.page.querySelector('.resume-container') as HTMLElement
  // Continuation pages: double-column repeats the sidebar SHELL (same column
  // width/background, empty content) so the main column stays aligned;
  // single-column starts directly at the main shell. Both get a fresh empty
  // main shell.
  if (ctx.double && ctx.header) c.appendChild(ctx.header.cloneNode(false))
  cursor.container = appendMainShell(c, ctx.main)
  cursor.count++
}

function overflows(page: HTMLElement): boolean {
  return page.scrollHeight > page.offsetHeight + OVERFLOW_TOLERANCE
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
