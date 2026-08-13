/**
 * Shared pagination core for resume content.
 *
 * Used by both the live preview (paginate.ts) and the export pipeline
 * (export-html.ts) so that "what you see is what you export".
 *
 * The algorithm takes the first `.resume-page` in the document, then splits
 * the content into fixed-height A4 pages (210mm × 297mm) by cloning DOM
 * nodes and measuring overflow against the live layout.
 *
 * Three layout modes (highest priority first):
 *
 *  1. Config-driven nested row (`<meta name="gosume-pagination">`):
 *     For templates whose two-column layout lives INSIDE a child of
 *     `.resume-container` (e.g. gradient's `.main-grid`). The configured
 *     container is split into a repeating sidebar + a flowing main column;
 *     siblings before/after it flow vertically as usual. This keeps the
 *     sidebar on every page without splitting the column pair apart.
 *
 *  2. Top-level row (`.resume-container` itself is flex row):
 *     The first child is a sidebar cloned onto every page; the second child's
 *     descendants flow across pages.
 *
 *  3. Vertical (default): sections stack top-to-bottom. When a section does
 *     not fit, it moves to a fresh page. If a section still overflows a page
 *     on its own, the algorithm falls back to splitting it by its own children
 *     (up to MAX_SPLIT_DEPTH levels) so "giant" sections no longer leave the
 *     first page mostly blank or get silently truncated by `overflow: hidden`.
 *
 * IMPORTANT: page padding + background must be captured by the caller via
 * `readPageStyle(doc)` BEFORE the caller repaints body for the preview/print
 * chrome. If captured afterwards, the chrome values (grey backdrop, gap
 * padding) leak into the page measurements and the rendered pages end up
 * with the wrong background and zero horizontal padding.
 */

export interface PageStyle {
  padTop: number
  padRight: number
  padBottom: number
  padLeft: number
  pageBg: string
}

export interface PaginateOptions extends PageStyle {
  /**
   * CSS `margin-bottom` applied to each `.resume-page`.
   * Preview uses a gap so pages are visually separated; export uses `0`
   * because page-breaks handle separation in print.
   */
  pageMarginBottom?: string
}

export interface PaginateResult {
  wrapper: HTMLElement
  pageCount: number
}

/** Pagination config read from `<meta name="gosume-pagination">`. */
interface PaginationConfig {
  mode?: 'row'
  container?: string
  sidebar?: string
  flow?: string
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
  rowCfg: PaginationConfig | null
}

interface Cursor {
  page: HTMLElement
  container: HTMLElement
  count: number
}

/** px slack when comparing scrollHeight vs offsetHeight (sub-pixel rounding). */
const OVERFLOW_TOLERANCE = 2
/** How deep `placeSection` may recurse when splitting an oversized section. */
const MAX_SPLIT_DEPTH = 2
/** <meta> tag name carrying the optional pagination config. */
const PAGINATION_META = 'gosume-pagination'
/** Attribute used to tag row scaffolding so it can be rolled back/cleaned. */
const ROW_PART_ATTR = 'data-row-part'

/**
 * Reads the original `.resume-page` element's padding + background.
 * Must be called BEFORE the caller mutates body styles (e.g. to install the
 * preview chrome or the print repaint), otherwise the returned values reflect
 * the chrome instead of the template.
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
 * Splits the first `.resume-page`'s `.resume-container` content into A4 pages
 * using the provided `PageStyle` for each page's padding + background.
 * Returns the wrapper holding all pages and the page count.
 */
export function paginateResume(
  doc: Document,
  body: HTMLElement,
  options: PaginateOptions,
): PaginateResult {
  const pageMarginBottom = options.pageMarginBottom ?? '0'
  const empty: PaginateResult = { wrapper: doc.createElement('div'), pageCount: 1 }

  // `body` IS the `.resume-page` in every template. Look up the content
  // container directly from body rather than `doc.querySelector('.resume-page')`
  // — callers clear body's className before calling us (to drop template-only
  // body styles), which would make that selector return null and silently skip
  // pagination, leaving the grey chrome background + unpaged content in place.
  const container = body.querySelector('.resume-container') as HTMLElement | null
  if (!container) return empty

  const containerStyle = doc.defaultView!.getComputedStyle(container)
  const isTopLevelRow =
    containerStyle.display === 'flex' && containerStyle.flexDirection === 'row'

  const sections = Array.from(container.children) as HTMLElement[]
  if (sections.length === 0) return empty

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
    rowCfg: readPaginationConfig(doc),
  }

  const cursor: Cursor = {
    page: makePage(ctx),
    container: null as unknown as HTMLElement,
    count: 1,
  }
  cursor.container = cursor.page.querySelector('.resume-container')!
  wrapper.appendChild(cursor.page)

  if (isTopLevelRow) {
    paginateRow(ctx, cursor, sections)
  } else {
    for (const section of sections) {
      placeSection(ctx, cursor, section, 0)
    }
  }

  // Strip the internal scaffolding attribute so it never leaks into exports.
  wrapper
    .querySelectorAll(`[${ROW_PART_ATTR}]`)
    .forEach((el) => el.removeAttribute(ROW_PART_ATTR))

  return { wrapper, pageCount: cursor.count }
}

// ── Config ──────────────────────────────────────────────────────────────────

function readPaginationConfig(doc: Document): PaginationConfig | null {
  const meta = doc.querySelector(`meta[name="${PAGINATION_META}"]`) as HTMLMetaElement | null
  if (!meta || !meta.content) return null
  try {
    const cfg = JSON.parse(meta.content) as PaginationConfig
    if (cfg.mode === 'row' && cfg.container && cfg.sidebar && cfg.flow) return cfg
    return null
  } catch {
    return null
  }
}

// ── Section placement (vertical + child-splitting fallback) ──────────────────

/**
 * Places `section` into the current page.
 *
 * - Top-level sections that match the configured row container are handled by
 *   `placeRowContainer` instead.
 * - Otherwise the section is stacked vertically. If it overflows:
 *     1. when the current page already has content → start a fresh page;
 *     2. if it still overflows a page on its own → split it by its own
 *        children (recursively, up to MAX_SPLIT_DEPTH);
 *     3. leaf nodes that exceed a full page are kept whole so at least their
 *        visible portion renders instead of being dropped silently.
 */
function placeSection(
  ctx: PageCtx,
  cursor: Cursor,
  section: HTMLElement,
  depth: number,
): void {
  if (depth === 0 && isConfiguredRowContainer(ctx, section)) {
    placeRowContainer(ctx, cursor, section)
    return
  }

  const clone = section.cloneNode(true) as HTMLElement
  cursor.container.appendChild(clone)
  void cursor.page.offsetHeight

  if (!overflows(cursor.page)) return // fits on the current page

  // Doesn't fit — pull it back.
  cursor.container.removeChild(clone)
  const currentEmpty = cursor.container.children.length === 0

  if (!currentEmpty) {
    // The current page has other content; retry on a brand-new page.
    newPage(ctx, cursor)
    cursor.container.appendChild(clone)
    void cursor.page.offsetHeight
    if (!overflows(cursor.page)) return // fits on the fresh page
    cursor.container.removeChild(clone)
  }

  // The page is empty and the section still overflows it alone — split it.
  if (depth < MAX_SPLIT_DEPTH && section.children.length > 0) {
    for (const child of Array.from(section.children) as HTMLElement[]) {
      placeSection(ctx, cursor, child, depth + 1)
    }
  } else {
    // Leaf node that exceeds a full page — keep it whole. The visible part
    // renders; the rest is clipped by the page's `overflow: hidden`, but no
    // content is dropped from the DOM and subsequent sections still paginate.
    cursor.container.appendChild(clone)
  }
}

// ── Config-driven nested row (sidebar on first page, full-width continuation) ─

/**
 * Handles a two-column container nested inside `.resume-container`
 * (e.g. gradient's `.main-grid`).
 *
 * The sidebar is cloned onto the FIRST row page only (alongside any preceding
 * sections already placed there). The main column's children then flow across
 * pages; continuation pages use full-width flow content (no sidebar clone) so
 * the short sidebar isn't duplicated and the continuation page stays compact.
 * If the very first flow item doesn't fit alongside the preceding content +
 * sidebar, the row scaffolding is rolled back and restarted on a fresh page so
 * no empty flow shell is left behind on the partial page.
 */
function placeRowContainer(
  ctx: PageCtx,
  cursor: Cursor,
  rowContainer: HTMLElement,
): void {
  const cfg = ctx.rowCfg!
  const sidebar = rowContainer.querySelector(cfg.sidebar!) as HTMLElement | null
  const flow = rowContainer.querySelector(cfg.flow!) as HTMLElement | null
  if (!sidebar || !flow) {
    // Misconfigured — fall back to ordinary vertical placement.
    placeSectionFallback(ctx, cursor, rowContainer)
    return
  }

  const flowItems = Array.from(flow.children) as HTMLElement[]
  if (flowItems.length === 0) return

  let target = beginRow(ctx, cursor, rowContainer, sidebar, flow, true)
  let rowStarted = false

  for (const item of flowItems) {
    const clone = item.cloneNode(true) as HTMLElement
    target.appendChild(clone)
    void cursor.page.offsetHeight

    if (!overflows(cursor.page)) {
      rowStarted = true
      continue
    }

    // Doesn't fit — pull it back and move to a fresh page.
    target.removeChild(clone)
    if (!rowStarted) {
      // First item didn't fit alongside preceding content + sidebar.
      // Tear down the empty scaffolding on this page before moving on.
      rollbackRow(cursor)
    }
    newPage(ctx, cursor)
    // Include the sidebar only on the first row page (when rowStarted is
    // still false).  Continuation pages get a full-width flow shell so the
    // short sidebar isn't duplicated and the page stays compact.
    target = beginRow(ctx, cursor, rowContainer, sidebar, flow, !rowStarted)

    // Guard: if the sidebar alone overflows the fresh page, the row strategy
    // is unworkable for this content — fall back to placing the whole block.
    void cursor.page.offsetHeight
    if (overflows(cursor.page)) {
      rollbackRow(cursor)
      placeSectionFallback(ctx, cursor, rowContainer)
      return
    }

    target.appendChild(clone)
    void cursor.page.offsetHeight
    // If the item still overflows even alone (sidebar + item > page), keep it
    // in place — it will be clipped, but we must not loop forever trying to
    // fit an un-fittable item onto successive pages.
    rowStarted = true
  }
}

/** Vertical placement without row detection — used when row config is invalid. */
function placeSectionFallback(ctx: PageCtx, cursor: Cursor, section: HTMLElement): void {
  const clone = section.cloneNode(true) as HTMLElement
  cursor.container.appendChild(clone)
  void cursor.page.offsetHeight
  if (!overflows(cursor.page)) return
  cursor.container.removeChild(clone)
  if (cursor.container.children.length > 0) newPage(ctx, cursor)
  cursor.container.appendChild(clone)
}

function isConfiguredRowContainer(ctx: PageCtx, section: HTMLElement): boolean {
  const cfg = ctx.rowCfg
  return !!(cfg && cfg.mode === 'row' && cfg.container && section.matches(cfg.container))
}

/**
 * Builds the two-column scaffolding on the current page: a clone of the row
 * container (empty, preserving its flex layout) holding a sidebar clone and an
 * empty flow shell. Returns the flow shell so callers can append flow items.
 *
 * When `includeSidebar` is false (continuation pages), only the flow shell is
 * created — the flow shell (e.g. `.col-main` with `flex: 1.6`) becomes
 * full-width as the sole flex child, so page 2+ uses the entire content width
 * without duplicating the short sidebar.
 *
 * The row container clone is essential — `.resume-container` is usually a
 * block, so placing the sidebar and flow shell directly inside it would stack
 * them vertically. Cloning the original `.main-grid` (which is `display: flex`)
 * keeps the columns side-by-side exactly as designed.
 */
function beginRow(
  ctx: PageCtx,
  cursor: Cursor,
  rowContainer: HTMLElement,
  sidebar: HTMLElement,
  flow: HTMLElement,
  includeSidebar: boolean,
): HTMLElement {
  // Match the original row container's child order so flex `row` keeps the
  // same visual layout (e.g. gradient: .col-main first → main column on the
  // left, .col-side second → sidebar on the right with its border-left).
  const rowShell = rowContainer.cloneNode(false) as HTMLElement
  rowShell.setAttribute(ROW_PART_ATTR, 'row')
  cursor.container.appendChild(rowShell)
  const shell = flow.cloneNode(false) as HTMLElement
  shell.setAttribute(ROW_PART_ATTR, 'flow')
  rowShell.appendChild(shell)
  if (includeSidebar) {
    const sb = sidebar.cloneNode(true) as HTMLElement
    sb.setAttribute(ROW_PART_ATTR, 'sidebar')
    rowShell.appendChild(sb)
  }
  return shell
}

/** Removes the (empty) row scaffolding from the current page. */
function rollbackRow(cursor: Cursor): void {
  cursor.container
    .querySelectorAll(`[${ROW_PART_ATTR}]`)
    .forEach((el) => el.remove())
}

// ── Top-level row layout (sidebar repeats on every page) ────────────────────

/**
 * Row layout where `.resume-container` itself is a flex row: the first child
 * is a fixed sidebar and the second child is a flow shell whose descendants
 * are placed one-by-one. Extra top-level sections append to the flow.
 *
 * On the FIRST page the sidebar is cloned in full (with all its content).
 * On CONTINUATION pages only the sidebar SHELL is cloned — same element, same
 * classes/styles (so the dark background column still renders and the visual
 * layout stays identical), but its children are stripped. This keeps every
 * page a two-column page (no jarring switch to single-column) without
 * duplicating the sidebar's personal-info content on later pages.
 */
function paginateRow(ctx: PageCtx, cursor: Cursor, sections: HTMLElement[]): void {
  const sidebar = sections[0]
  const flowing = sections.length >= 2 ? sections[1] : null
  const extra = sections.slice(2)

  const flowItems: HTMLElement[] = []
  if (flowing) flowItems.push(...(Array.from(flowing.children) as HTMLElement[]))
  for (const sec of extra) flowItems.push(sec)

  cursor.container.appendChild(sidebar.cloneNode(true))
  const flowingShell = flowing ? (flowing.cloneNode(false) as HTMLElement) : null
  if (flowingShell) cursor.container.appendChild(flowingShell)
  let target: HTMLElement = flowingShell || cursor.container

  for (const item of flowItems) {
    const clone = item.cloneNode(true) as HTMLElement
    target.appendChild(clone)
    void cursor.page.offsetHeight

    if (overflows(cursor.page)) {
      target.removeChild(clone)

      newPage(ctx, cursor)
      // Continuation page: clone the sidebar SHELL only (preserves the column's
      // background/width/layout) but drop its children so the sidebar content
      // (avatar, contact info, languages…) isn't duplicated on later pages.
      const sidebarShell = sidebar.cloneNode(false) as HTMLElement
      cursor.container.appendChild(sidebarShell)
      const newShell = flowing ? (flowing.cloneNode(false) as HTMLElement) : null
      if (newShell) cursor.container.appendChild(newShell)
      target = newShell || cursor.container
      target.appendChild(clone)
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function newPage(ctx: PageCtx, cursor: Cursor): void {
  cursor.page = makePage(ctx)
  ctx.wrapper.appendChild(cursor.page)
  cursor.container = cursor.page.querySelector('.resume-container')!
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
