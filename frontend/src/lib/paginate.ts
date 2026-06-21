/**
 * Shared pagination logic for resume preview iframes.
 * Used by both the WelcomePage (template card previews) and the
 * EditorPage (PreviewPanel) to ensure consistent rendering.
 */

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

  const body = doc.body
  const originalPage = doc.querySelector('.resume-page') as HTMLElement | null
  if (!originalPage) return 1

  const style = doc.defaultView!.getComputedStyle(originalPage)
  const padTop = parseFloat(style.paddingTop) || 0
  const padRight = parseFloat(style.paddingRight) || 0
  const padBottom = parseFloat(style.paddingBottom) || 0
  const padLeft = parseFloat(style.paddingLeft) || 0
  const pageBg = style.backgroundColor || '#ffffff'

  const container = originalPage.querySelector('.resume-container') as HTMLElement | null
  if (!container) return 1

  // Detect if the container uses a horizontal flex layout.
  // Children in such layouts sit side-by-side and must stay together
  // — splitting them across pages produces a broken appearance.
  const containerStyle = doc.defaultView!.getComputedStyle(container)
  const isRowLayout =
    containerStyle.display === 'flex' && containerStyle.flexDirection === 'row'

  const sections = Array.from(container.children) as HTMLElement[]
  if (sections.length === 0) return 1

  body.className = ''
  body.style.background = '#e5e7eb'
  body.style.margin = '0'
  body.style.padding = `${PAGE_GAP}px 0`
  body.style.overflowX = 'hidden'

  const wrapper = doc.createElement('div')
  wrapper.className = 'resume-pages-wrapper'
  body.replaceChildren(wrapper)

  // Row layouts: first child is typically a fixed sidebar, second contains
  // flowing content. Repeat the sidebar on each page while splitting the
  // flowing content's children across pages.
  if (isRowLayout) {
    return paginateRowLayout(doc, body, iframe, wrapper, sections, padTop, padRight, padBottom, padLeft, pageBg)
  }

  // Vertical-flow pagination
  return paginateVertical(doc, body, iframe, wrapper, sections, padTop, padRight, padBottom, padLeft, pageBg)
}

function paginateRowLayout(
  doc: Document,
  body: HTMLElement,
  iframe: HTMLIFrameElement,
  wrapper: HTMLElement,
  sections: HTMLElement[],
  padTop: number,
  padRight: number,
  padBottom: number,
  padLeft: number,
  pageBg: string,
): number {
  const sidebar = sections[0]
  const flowing = sections.length >= 2 ? sections[1] : null
  const extra = sections.slice(2)

  const flowItems: HTMLElement[] = []
  if (flowing) {
    flowItems.push(...(Array.from(flowing.children) as HTMLElement[]))
  }
  for (const sec of extra) {
    flowItems.push(sec)
  }

  let currentPage = makePage(doc, padTop, padRight, padBottom, padLeft, pageBg)
  wrapper.appendChild(currentPage)
  let currentContainer = currentPage.querySelector('.resume-container')!
  currentContainer.appendChild(sidebar.cloneNode(true))
  const flowingShell = flowing
    ? (flowing.cloneNode(false) as HTMLElement)
    : null
  if (flowingShell) currentContainer.appendChild(flowingShell)
  let target = flowingShell || currentContainer

  let count = 1

  for (const item of flowItems) {
    const clone = item.cloneNode(true) as HTMLElement
    target.appendChild(clone)
    void currentPage.offsetHeight

    if (currentPage.scrollHeight > currentPage.offsetHeight + 2) {
      target.removeChild(clone)

      currentPage = makePage(doc, padTop, padRight, padBottom, padLeft, pageBg)
      wrapper.appendChild(currentPage)
      currentContainer = currentPage.querySelector('.resume-container')!
      currentContainer.appendChild(sidebar.cloneNode(true))
      const newShell = flowing
        ? (flowing.cloneNode(false) as HTMLElement)
        : null
      if (newShell) currentContainer.appendChild(newShell)
      target = newShell || currentContainer
      target.appendChild(clone)
      count++
    }
  }

  void body.offsetHeight
  iframe.style.height = `${body.scrollHeight}px`
  return count
}

function paginateVertical(
  doc: Document,
  body: HTMLElement,
  iframe: HTMLIFrameElement,
  wrapper: HTMLElement,
  sections: HTMLElement[],
  padTop: number,
  padRight: number,
  padBottom: number,
  padLeft: number,
  pageBg: string,
): number {
  let currentPage = makePage(doc, padTop, padRight, padBottom, padLeft, pageBg)
  wrapper.appendChild(currentPage)
  let currentContainer = currentPage.querySelector('.resume-container')!
  let count = 1

  for (const section of sections) {
    const clone = section.cloneNode(true) as HTMLElement
    currentContainer.appendChild(clone)
    void currentPage.offsetHeight

    if (currentPage.scrollHeight > currentPage.offsetHeight + 2) {
      currentContainer.removeChild(clone)

      currentPage = makePage(doc, padTop, padRight, padBottom, padLeft, pageBg)
      wrapper.appendChild(currentPage)
      currentContainer = currentPage.querySelector('.resume-container')!
      currentContainer.appendChild(clone)
      count++
    }
  }

  void body.offsetHeight
  iframe.style.height = `${body.scrollHeight}px`
  return count
}

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
  page.style.cssText = `
    width: 210mm;
    height: 297mm;
    padding: ${padTop}px ${padRight}px ${padBottom}px ${padLeft}px;
    overflow: hidden;
    background: ${backgroundColor};
    margin: 0 auto ${PAGE_GAP}px;
    box-sizing: border-box;
  `
  const container = doc.createElement('div')
  container.className = 'resume-container'
  container.style.maxWidth = '100%'
  page.appendChild(container)
  return page
}