/**
 * Export HTML pipeline — produces paginated, print-ready HTML for PDF/PNG export.
 *
 * Architecture (two paths, identical output):
 *
 *   Path A — extract from the visible preview iframe (fast, no re-render):
 *     generateExportHTML() → extractPreviewHTML() → cleanAndSerialize()
 *     Used by individual export when the preview is already in the DOM.
 *
 *   Path B — paginate raw HTML in a hidden iframe (off-screen):
 *     paginateHTMLString() → paginateInIframe() → cleanAndSerialize()
 *     Used by batch export (each resume is rendered on demand) and as a
 *     fallback when the preview iframe isn't available.
 *
 * Both paths produce a complete HTML document with:
 *   - Original <head> styles preserved (template CSS, fonts)
 *   - Content split into A4 .resume-page divs (210mm × 297mm)
 *   - page-break-after: always between pages (except last)
 *   - Clean body styling (no scroll/padding from the preview chrome)
 */

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

// ── Path A: extract from visible preview ────────────────────────────────────

function extractPreviewHTML(): string | null {
  const iframe = document.querySelector('iframe[title="简历预览"]') as HTMLIFrameElement | null
  if (!iframe?.contentDocument) return null

  const doc = iframe.contentDocument
  const wrapper = doc.querySelector('.resume-pages-wrapper')
  if (!wrapper || wrapper.querySelectorAll('.resume-page').length === 0) return null

  return cleanAndSerialize(doc)
}

/**
 * Primary entry point for individual export.
 * Tries to extract already-paginated HTML from the visible preview iframe;
 * falls back to off-screen pagination if the preview is unavailable.
 */
export function generateExportHTML(previewHtml: string): Promise<string> {
  const extracted = extractPreviewHTML()
  if (extracted) return Promise.resolve(extracted)
  return paginateHTMLString(previewHtml)
}

// ── Path B: off-screen pagination ───────────────────────────────────────────

/**
 * Loads raw template-rendered HTML into a hidden iframe, paginates it, and
 * returns the complete print-ready HTML. Never touches the visible preview.
 */
export function paginateHTMLString(previewHtml: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;'
    iframe.sandbox.add('allow-same-origin')
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument
    if (!doc) {
      document.body.removeChild(iframe)
      reject(new Error('无法创建导出文档'))
      return
    }

    doc.open()
    doc.write(previewHtml)
    doc.close()

    // Wait two frames for layout to settle before paginating.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          paginateInIframe(doc)
          const result = cleanAndSerialize(doc)
          document.body.removeChild(iframe)
          resolve(result)
        } catch (err) {
          document.body.removeChild(iframe)
          reject(err)
        }
      })
    })
  })
}

// ── Pagination algorithm ────────────────────────────────────────────────────

function makePage(
  doc: Document,
  padTop: number,
  padRight: number,
  padBottom: number,
  padLeft: number,
  backgroundColor: string,
): HTMLElement {
  const page = doc.createElement('div')
  page.className = 'resume-page'
  page.style.cssText = `width: 210mm;height: 297mm;padding: ${padTop}px ${padRight}px ${padBottom}px ${padLeft}px;overflow: hidden;background: ${backgroundColor};margin: 0 auto;box-sizing: border-box;`
  const container = doc.createElement('div')
  container.className = 'resume-container'
  container.style.maxWidth = '100%'
  page.appendChild(container)
  return page
}

/**
 * Splits resume content into fixed-height A4 pages by cloning DOM nodes and
 * measuring overflow. Handles both layouts:
 *   - Stacked:  each top-level section is placed consecutively.
 *   - Row-based: sidebar is repeated on every page; main content flows across pages.
 */
function paginateInIframe(doc: Document): void {
  const body = doc.body
  const originalPage = doc.querySelector('.resume-page') as HTMLElement | null
  if (!originalPage) return

  const style = doc.defaultView!.getComputedStyle(originalPage)
  const padTop = parseFloat(style.paddingTop) || 0
  const padRight = parseFloat(style.paddingRight) || 0
  const padBottom = parseFloat(style.paddingBottom) || 0
  const padLeft = parseFloat(style.paddingLeft) || 0
  const pageBg = style.backgroundColor || '#ffffff'

  const container = originalPage.querySelector('.resume-container') as HTMLElement | null
  if (!container) return

  const containerStyle = doc.defaultView!.getComputedStyle(container)
  const isRowLayout =
    containerStyle.display === 'flex' && containerStyle.flexDirection === 'row'

  const sections = Array.from(container.children) as HTMLElement[]
  if (sections.length === 0) return

  // Reset body to clean slate for the paginated output.
  body.className = ''
  body.style.margin = '0'
  body.style.padding = '0'
  body.style.background = '#ffffff'

  const wrapper = doc.createElement('div')
  wrapper.className = 'resume-pages-wrapper'
  body.replaceChildren(wrapper)

  if (isRowLayout) {
    // Row layout: sidebar (first child) is cloned onto every page.
    // The second child is the main flow container; subsequent sections are
    // appended to it. When a page overflows, a new page is created with a
    // fresh sidebar clone and flow continues.
    const sidebar = sections[0]
    const flowing = sections.length >= 2 ? sections[1] : null
    const extra = sections.slice(2)

    const flowItems: HTMLElement[] = []
    if (flowing) {
      flowItems.push(...(Array.from(flowing.children) as HTMLElement[]))
    }
    for (const sec of extra) flowItems.push(sec)

    let cur = makePage(doc, padTop, padRight, padBottom, padLeft, pageBg)
    wrapper.appendChild(cur)
    let curContainer = cur.querySelector('.resume-container')!
    curContainer.appendChild(sidebar.cloneNode(true))
    const flowingShell = flowing ? (flowing.cloneNode(false) as HTMLElement) : null
    if (flowingShell) curContainer.appendChild(flowingShell)
    let target = flowingShell || curContainer

    for (const item of flowItems) {
      const clone = item.cloneNode(true) as HTMLElement
      target.appendChild(clone)
      void cur.offsetHeight // force reflow before measuring overflow

      if (cur.scrollHeight > cur.offsetHeight + 2) {
        target.removeChild(clone)

        cur = makePage(doc, padTop, padRight, padBottom, padLeft, pageBg)
        wrapper.appendChild(cur)
        curContainer = cur.querySelector('.resume-container')!
        curContainer.appendChild(sidebar.cloneNode(true))
        const newShell = flowing ? (flowing.cloneNode(false) as HTMLElement) : null
        if (newShell) curContainer.appendChild(newShell)
        target = newShell || curContainer
        target.appendChild(clone)
      }
    }
  } else {
    // Stacked layout: place sections one by one. If a section causes overflow,
    // start a new page for it.
    let cur = makePage(doc, padTop, padRight, padBottom, padLeft, pageBg)
    wrapper.appendChild(cur)
    let currentContainer = cur.querySelector('.resume-container')!

    for (const section of sections) {
      const clone = section.cloneNode(true) as HTMLElement
      currentContainer.appendChild(clone)
      void cur.offsetHeight

      if (cur.scrollHeight > cur.offsetHeight + 2) {
        currentContainer.removeChild(clone)

        cur = makePage(doc, padTop, padRight, padBottom, padLeft, pageBg)
        wrapper.appendChild(cur)
        currentContainer = cur.querySelector('.resume-container')!
        currentContainer.appendChild(clone)
      }
    }
  }

  const pages = wrapper.querySelectorAll('.resume-page')
  if (pages.length > 0) {
    ;(pages[pages.length - 1] as HTMLElement).style.pageBreakAfter = 'auto'
  }
}
