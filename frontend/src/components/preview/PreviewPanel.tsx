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

  const wrapper = doc.createElement('div')
  wrapper.className = 'resume-pages-wrapper'
  body.replaceChildren(wrapper)

  // Row layouts: first child is typically a fixed sidebar, second contains
  // flowing content. Repeat the sidebar on each page while splitting the
  // flowing content's children across pages.
  if (isRowLayout) {
    const sidebar = sections[0]
    const flowing = sections.length >= 2 ? sections[1] : null
    const extra = sections.slice(2)

    // Build the list of items to flow across pages:
    // everything inside the flowing container, plus any extra top-level sections
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

  // Vertical-flow pagination
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

export function PreviewPanel() {
  const previewHtml = useResumeStore((s) => s.previewHtml)
  const zoom = useEditorStore((s) => s.zoom)
  const setZoom = useEditorStore((s) => s.setZoom)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
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
            const container = scrollRef.current
            const oldZoom = useEditorStore.getState().zoom
            const delta = e.deltaY > 0 ? -0.05 : 0.05
            const newZoom = Math.max(0.5, Math.min(2.0, oldZoom + delta))
            if (newZoom === oldZoom || !container) {
              if (!container) setZoom(newZoom)
              return
            }

            const rect = container.getBoundingClientRect()
            const cx = e.clientX
            const cy = e.clientY

            // Content point in logical (1x) coordinates under the cursor
            const logicalX = (container.scrollLeft + cx - rect.left) / oldZoom
            const logicalY = (container.scrollTop + cy - rect.top) / oldZoom

            setZoom(newZoom)

            // After React commits the zoom change, adjust scroll to keep
            // the same content point under the cursor
            requestAnimationFrame(() => {
              container.scrollLeft = logicalX * newZoom - (cx - rect.left)
              container.scrollTop = logicalY * newZoom - (cy - rect.top)
            })
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
        <div className="text-center text-surface-400">
          <div className="w-16 h-20 mx-auto mb-3 rounded border-2 border-surface-300 bg-white" />
          <p className="text-sm">简历预览将在此显示</p>
          <p className="text-xs mt-1">请在左侧填写信息</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto overflow-x-hidden">
      <div
        style={{
          width: `${A4_W * effectiveScale}px`,
          margin: '24px auto',
        }}
      >
        <div
          style={{
            transform: `scale(${effectiveScale})`,
            transformOrigin: 'top left',
            width: `${A4_W}px`,
            marginBottom: '8px',
          }}
        >
          <iframe
            ref={iframeRef}
            className="w-full border-none"
            style={{ height: `${containerHeight}px`, overflow: 'hidden' }}
            title="简历预览"
            sandbox="allow-same-origin"
          />
        </div>
        <div className="text-center py-1.5 text-xs text-surface-400 bg-surface-50 border-t border-surface-100">
          共 {pageCount} 页 · A4 · {Math.round(effectiveScale * 100)}%
        </div>
      </div>
    </div>
  )
}
