/**
 * Shared pagination core for resume content.
 *
 * Used by both the live preview (paginate.ts) and the export pipeline
 * (export-html.ts) so that "what you see is what you export".
 *
 * DOM contract (Gosume 一期 · 优化版) — MUST stay in sync with
 * `templates/unified.html` and `templates/AGENTS.md`:
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

export interface PageStyle {
  padTop: number
  padRight: number
  padBottom: number
  padLeft: number
  pageBg: string
}

export interface PaginateOptions extends PageStyle {
  /** CSS `margin-bottom` applied to each `.resume-page`. */
  pageMarginBottom?: string
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
/** How deep `placeSection` may recurse when splitting an oversized section. */
const MAX_SPLIT_DEPTH = 2

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
  }
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
): PaginateResult {
  const pageMarginBottom = options.pageMarginBottom ?? '0'
  const empty: PaginateResult = { wrapper: doc.createElement('div'), pageCount: 1 }

  const container = body.querySelector('.resume-container') as HTMLElement | null
  if (!container) return empty

  const double = isDoubleColumn(doc, container)
  const header = container.querySelector('.r-header') as HTMLElement | null
  const main = container.querySelector('.r-main') as HTMLElement | null
  const mainSections = main ? (Array.from(main.children) as HTMLElement[]) : []

  const wrapper = doc.createElement('div')
  wrapper.className = 'resume-pages-wrapper'
  body.replaceChildren(wrapper)

  const ctx: PageCtx = {
    doc,
    wrapper,
    padTop: options.padTop,
    padRight: options.padRight,
    padBottom: options.padBottom,
    padLeft: options.padLeft,
    pageBg: options.pageBg,
    pageMarginBottom,
    double,
    header,
    main,
  }

  const cursor: Cursor = { page: makePage(ctx), container: null as unknown as HTMLElement, count: 1 }
  wrapper.appendChild(cursor.page)

  const c = cursor.page.querySelector('.resume-container')!
  // Page 1 carries the header (personal info). In double mode it is the full
  // sidebar content; in single mode it is the leading block.
  if (header) c.appendChild(header.cloneNode(true))
  // The .r-main shell carries the flowing sections on every page — this preserves
  // its own padding/background on continuation pages too, instead of flattening
  // the sections onto the bare container.
  cursor.container = appendMainShell(c, main)
  for (const section of mainSections) placeSection(ctx, cursor, section, 0)

  return { wrapper, pageCount: cursor.count }
}

function isDoubleColumn(doc: Document, container: HTMLElement): boolean {
  return doc.defaultView!.getComputedStyle(container).display === 'grid'
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
 * Places `section` into the current page's flow target. If it overflows the
 * page: start a fresh page; if it still overflows alone, split it by its own
 * children (up to MAX_SPLIT_DEPTH). Leaf nodes that exceed a full page are kept
 * whole so their visible portion renders rather than being dropped.
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
    for (const child of Array.from(section.children) as HTMLElement[]) {
      placeSection(ctx, cursor, child, depth + 1)
    }
  } else {
    cursor.container.appendChild(clone)
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function newPage(ctx: PageCtx, cursor: Cursor): void {
  cursor.page = makePage(ctx)
  ctx.wrapper.appendChild(cursor.page)
  const c = cursor.page.querySelector('.resume-container')!
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
  page.style.cssText = `width: 210mm;height: 297mm;padding: ${ctx.padTop}px ${ctx.padRight}px ${ctx.padBottom}px ${ctx.padLeft}px;overflow: hidden;background: ${ctx.pageBg};margin: 0 auto ${ctx.pageMarginBottom};box-sizing: border-box;`
  const container = ctx.doc.createElement('div')
  container.className = 'resume-container'
  container.style.maxWidth = '100%'
  page.appendChild(container)
  return page
}
