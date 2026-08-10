/**
 * Shared pagination logic for resume preview iframes.
 * Used by both the WelcomePage (template card previews) and the
 * EditorPage (PreviewPanel) to ensure consistent rendering.
 *
 * The heavy lifting lives in pagination-core.ts; this module only sets up the
 * preview-specific body chrome (grey backdrop, page gaps) and reports the
 * resulting page count back to the iframe sizer.
 */

import { paginateResume, readPageStyle } from './pagination-core'

export const MM_TO_PX = 96 / 25.4
export const A4_W = Math.round(210 * MM_TO_PX)
export const A4_H = Math.round(297 * MM_TO_PX)
export const PAGE_GAP = 16

/**
 * Paginates the content inside a resume iframe into separate A4 pages.
 * Returns the number of pages created.
 */
export function paginateContent(iframe: HTMLIFrameElement): number {
  const doc = iframe.contentDocument
  if (!doc) return 1

  // Snapshot the original .resume-page padding + background BEFORE we
  // repaint body for the preview chrome — otherwise pagination reads the
  // chrome values and pages end up grey with zero horizontal padding.
  const pageStyle = readPageStyle(doc)
  if (!pageStyle) return 1

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
  return pageCount
}
