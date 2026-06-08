import { useRef, useEffect, useState } from 'react'
import { useResumeStore } from '../../stores/resumeStore'
import { useEditorStore } from '../../stores/editorStore'

const MM_TO_PX = 96 / 25.4
const A4_W = Math.round(210 * MM_TO_PX)
const A4_H = Math.round(297 * MM_TO_PX)
const PAGE_GAP = 16

function paginateContent(iframe: HTMLIFrameElement): number {
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

  // Constrain page to A4 height so overflow is properly detected.
  // Template CSS uses min-height which allows the page to grow, masking overflow.
  originalPage.style.height = '297mm'
  originalPage.style.overflow = 'hidden'
  void originalPage.offsetHeight

  if (originalPage.scrollHeight <= originalPage.offsetHeight + 2) {
    originalPage.style.height = ''
    originalPage.style.overflow = ''
    return 1
  }

  originalPage.style.height = ''
  originalPage.style.overflow = ''

  const container = originalPage.querySelector('.resume-container') as HTMLElement | null
  if (!container) return 1

  const sections = Array.from(container.children)
  sections.forEach((s) => s.remove())

  body.className = ''
  body.style.background = '#e5e7eb'
  body.style.margin = '0'
  body.style.padding = `${PAGE_GAP}px 0`

  const wrapper = doc.createElement('div')
  wrapper.className = 'resume-pages-wrapper'

  let currentPage = makePage(doc, padTop, padRight, padBottom, padLeft)
  let currentContainer = currentPage.querySelector('.resume-container')!
  let count = 1

  for (const section of sections) {
    const clone = section.cloneNode(true) as HTMLElement
    currentContainer.appendChild(clone)
    void currentPage.offsetHeight

    if (currentPage.scrollHeight > currentPage.offsetHeight + 2) {
      currentContainer.removeChild(clone)
      wrapper.appendChild(currentPage)

      currentPage = makePage(doc, padTop, padRight, padBottom, padLeft)
      currentContainer = currentPage.querySelector('.resume-container')!
      currentContainer.appendChild(clone)
      count++
    }
  }

  if (currentContainer.children.length > 0) {
    wrapper.appendChild(currentPage)
  }

  // Replace body children with the paginated wrapper.
  // Must NOT use replaceWith on body itself — that would detach body
  // and cause scrollHeight to return 0, making the iframe invisible.
  body.replaceChildren(wrapper)
  iframe.style.height = `${body.scrollHeight}px`

  return count
}

function makePage(
  doc: Document,
  padTop: number,
  padRight: number,
  padBottom: number,
  padLeft: number,
): HTMLElement {
  const page = doc.createElement('div')
  page.className = 'resume-page'
  page.style.cssText = `
    width: 210mm;
    height: 297mm;
    padding: ${padTop}px ${padRight}px ${padBottom}px ${padLeft}px;
    overflow: hidden;
    background: #fff;
    margin: 0 auto ${PAGE_GAP}px;
    box-sizing: border-box;
  `
  const container = doc.createElement('div')
  container.className = 'resume-container'
  container.style.maxWidth = '100%'
  page.appendChild(container)
  return page
}

export function PreviewPanel() {
  const previewHtml = useResumeStore((s) => s.previewHtml)
  const zoom = useEditorStore((s) => s.zoom)
  const setZoom = useEditorStore((s) => s.setZoom)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const wheelCleanupRef = useRef<(() => void) | null>(null)
  const [pageCount, setPageCount] = useState(1)
  const [containerHeight, setContainerHeight] = useState(A4_H)

  // Load preview HTML into iframe, paginate, and inject Ctrl+wheel listener
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || !previewHtml) return

    // Clean up previous wheel listener from old iframe document
    if (wheelCleanupRef.current) {
      wheelCleanupRef.current()
      wheelCleanupRef.current = null
    }

    setPageCount(1)
    setContainerHeight(A4_H)

    const doc = iframe.contentDocument
    if (!doc) return

    doc.open()
    doc.write(previewHtml)
    doc.close()

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const pages = paginateContent(iframe)
        setPageCount(pages)
        const h = doc.body?.scrollHeight || A4_H
        setContainerHeight(h)

        // Inject wheel listener into iframe document for Ctrl+scroll zoom.
        // Events inside the iframe do not bubble to the parent document,
        // so we must listen directly on the iframe's contentDocument.
        const onWheel = (e: WheelEvent) => {
          if (e.ctrlKey) {
            e.preventDefault()
            const delta = e.deltaY > 0 ? -0.05 : 0.05
            setZoom(useEditorStore.getState().zoom + delta)
          }
        }
        doc.addEventListener('wheel', onWheel, { passive: false })
        wheelCleanupRef.current = () => doc.removeEventListener('wheel', onWheel)
      })
    })

    return () => {
      if (wheelCleanupRef.current) {
        wheelCleanupRef.current()
        wheelCleanupRef.current = null
      }
    }
  }, [previewHtml, setZoom])

  // Listen for zoom events from toolbar/keyboard shortcuts
  useEffect(() => {
    const handleZoomIn = () => useEditorStore.getState().setZoom(useEditorStore.getState().zoom + 0.1)
    const handleZoomOut = () => useEditorStore.getState().setZoom(useEditorStore.getState().zoom - 0.1)
    const handleZoomReset = () => useEditorStore.getState().setZoom(1.0)

    document.addEventListener('zoom:in', handleZoomIn)
    document.addEventListener('zoom:out', handleZoomOut)
    document.addEventListener('zoom:reset', handleZoomReset)
    return () => {
      document.removeEventListener('zoom:in', handleZoomIn)
      document.removeEventListener('zoom:out', handleZoomOut)
      document.removeEventListener('zoom:reset', handleZoomReset)
    }
  }, [])

  const effectiveScale = zoom

  if (!previewHtml) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-slate-400">
          <div className="w-16 h-20 mx-auto mb-3 rounded border-2 border-slate-300 bg-white" />
          <p className="text-sm">简历预览将在此显示</p>
          <p className="text-xs mt-1">请在左侧填写信息</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden flex items-start justify-center py-6">
      <div
        style={{
          width: `${A4_W * effectiveScale}px`,
          height: `${containerHeight * effectiveScale}px`,
        }}
      >
        <div
          style={{
            transform: `scale(${effectiveScale})`,
            transformOrigin: 'top left',
            width: `${A4_W}px`,
          }}
        >
          <iframe
            ref={iframeRef}
            className="w-full border-none"
            style={{ height: `${containerHeight}px`, overflow: 'hidden' }}
            title="简历预览"
            sandbox="allow-same-origin"
          />
          <div className="text-center py-1.5 text-xs text-slate-400 bg-slate-50 border-t border-slate-100">
            共 {pageCount} 页 · A4 · {Math.round(effectiveScale * 100)}%
          </div>
        </div>
      </div>
    </div>
  )
}
