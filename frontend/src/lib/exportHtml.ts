/**
 * Export HTML pipeline — produces paginated, print-ready HTML for PDF/PNG export.
 *
 * Single-path architecture:
 *   paginateHTMLString() → pagination-core (paginateResume) → cleanAndSerialize()
 *
 * Rendered HTML is loaded into a hidden iframe, split into A4 .resume-page divs
 * (210mm × 297mm) by the shared pagination core, and serialized for the backend
 * export service.
 *
 * Both individual export (ExportDialog) and batch export (ResumeListDrawer) use
 * the same frontend template engine (renderTemplate) followed by this pipeline.
 *
 * Output:
 *   - Original <head> styles preserved (template CSS, fonts)
 *   - Content split into A4 .resume-page divs
 *   - page-break-after: always between pages (except last)
 *   - Clean body styling (no scroll/padding from the preview chrome)
 */

import { paginateResume, readPageStyle, waitForDocumentReady, type PageStyle, type PageMode } from './paginationCore'
import { DEFAULT_PAPER } from './paper'

// ── Serialization ────────────────────────────────────────────────────────────

/**
 * Re-parses the document through DOMParser to get a safe copy, then normalizes
 * body styles and applies print page-break rules.
 *
 * The DOMParser round-trip ensures mutations never affect the visible preview.
 */
function cleanAndSerialize(doc: Document): string {
  const html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML
  const tmp = new DOMParser().parseFromString(html, 'text/html')

  // Reset body to clean print defaults — the preview adds padding/overflow
  // for the editor chrome, which would leak into the export.
  tmp.body.style.cssText = 'margin:0;padding:0;background:#ffffff'

  tmp.querySelectorAll('.resume-page').forEach((page, i, arr) => {
    const el = page as HTMLElement
    el.style.marginBottom = '0'
    el.style.pageBreakAfter = i < arr.length - 1 ? 'always' : 'auto'
  })

  return '<!DOCTYPE html>\n' + tmp.documentElement.outerHTML
}

// ── Off-screen pagination ───────────────────────────────────────────────────

/**
 * Loads raw template-rendered HTML into a hidden iframe, paginates it, and
 * returns the complete print-ready HTML. Never touches the visible preview.
 */
export async function paginateHTMLString(previewHtml: string, mode: PageMode = 'paged'): Promise<string> {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${DEFAULT_PAPER.mmW}mm;height:${DEFAULT_PAPER.mmH}mm;`
  iframe.sandbox.add('allow-same-origin')
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  if (!doc) {
    document.body.removeChild(iframe)
    throw new Error('无法创建导出文档')
  }

  try {
    doc.open()
    doc.write(previewHtml)
    doc.close()

    // Wait for fonts + images so pagination measures the final layout, then
    // yield one more frame to let the browser settle before splitting.
    await waitForDocumentReady(doc)
    await nextFrame()

    paginateInIframe(doc, mode)
    return cleanAndSerialize(doc)
  } finally {
    document.body.removeChild(iframe)
  }
}

/** Resolves after two animation frames so the browser settles layout. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

// ── Pagination entry for export ─────────────────────────────────────────────

/**
 * Resets the iframe body to clean print defaults and delegates to the shared
 * pagination core. Page-break rules are applied later by cleanAndSerialize.
 */
function paginateInIframe(doc: Document, mode: PageMode): void {
  // Snapshot padding + background before repainting body for the print chrome,
  // so pages get the template's values (not the print repaint's).
  const pageStyle = readPageStyle(doc)

  const body = doc.body
  body.className = ''
  body.style.margin = '0'
  body.style.padding = '0'
  body.style.background = '#ffffff'

  const fallback: PageStyle = { padTop: 0, padRight: 0, padBottom: 0, padLeft: 0, pageBg: '#ffffff', paper: DEFAULT_PAPER }
  paginateResume(doc, body, { ...(pageStyle ?? fallback), pageMarginBottom: '0', mode })
}
