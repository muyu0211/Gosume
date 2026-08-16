/**
 * Shared pagination logic for resume preview iframes.
 * Used by both the WelcomePage (template card previews) and the
 * EditorPage (PreviewPanel) to ensure consistent rendering.
 *
 * The heavy lifting lives in pagination-core.ts; this module only sets up the
 * preview-specific body chrome (grey backdrop, page gaps) and reports the
 * resulting page count back to the iframe sizer.
 */

import { paginateResume, readPageStyle } from './paginationCore'
import { DEFAULT_PAPER, type PaperSpec } from './paper'

export const PAGE_GAP = 16

export interface PaginateContentResult {
  pageCount: number
  /** Resolved paper spec the preview is laid out at (drives chrome width). */
  paper: PaperSpec
}

/**
 * Paginates the content inside a resume iframe into separate pages.
 * Returns the number of pages created plus the resolved paper spec.
 */
export function paginateContent(iframe: HTMLIFrameElement): PaginateContentResult {
  const doc = iframe.contentDocument
  if (!doc) return { pageCount: 1, paper: DEFAULT_PAPER }

  // Snapshot the original .resume-page padding + background BEFORE we
  // repaint body for the preview chrome — otherwise pagination reads the
  // chrome values and pages end up grey with zero horizontal padding.
  const pageStyle = readPageStyle(doc)
  if (!pageStyle) return { pageCount: 1, paper: DEFAULT_PAPER }

  const body = doc.body
  body.className = ''
  body.style.background = '#e5e7eb'
  body.style.margin = '0'
  body.style.padding = `${PAGE_GAP}px 0`
  body.style.overflowX = 'hidden'

  const { pageCount } = paginateResume(doc, body, {
    ...pageStyle,
    pageMarginBottom: `${PAGE_GAP}px`,
  })

  void body.offsetHeight
  iframe.style.height = `${body.scrollHeight}px`
  return { pageCount, paper: pageStyle.paper }
}
