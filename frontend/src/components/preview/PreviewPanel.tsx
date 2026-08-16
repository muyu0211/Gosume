import { useRef, useEffect, useState } from 'react'
import { useResumeStore } from '../../stores/resumeStore'
import { useEditorStore } from '../../stores/editorStore'
import { paginateContent } from '../../lib/paginate'
import { DEFAULT_PAPER, type PaperSpec } from '../../lib/paper'
import { waitForDocumentReady } from '../../lib/paginationCore'

export function PreviewPanel() {
  const previewHtml = useResumeStore((s) => s.previewHtml)
  const zoom = useEditorStore((s) => s.zoom)
  const setZoom = useEditorStore((s) => s.setZoom)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const wheelCleanupRef = useRef<(() => void) | null>(null)
  const [pageCount, setPageCount] = useState(1)
  const [paper, setPaper] = useState<PaperSpec>(DEFAULT_PAPER)
  const [containerHeight, setContainerHeight] = useState(DEFAULT_PAPER.pxH)

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

    let cancelled = false
    ;(async () => {
      // Wait for fonts/images, then one more frame to settle layout.
      await waitForDocumentReady(doc)
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      if (cancelled) return

      const result = paginateContent(iframe)
      setPageCount(result.pageCount)
      setPaper(result.paper)
      const h = doc.body?.scrollHeight || result.paper.pxH
      setContainerHeight(h)

      // 测量头像在简历中的实际渲染尺寸（分页后取第一个 .r-avatar img），
      const avatarImg = doc.querySelector('.r-avatar img') as HTMLImageElement | null
      const aw = avatarImg?.offsetWidth ?? 0
      const ah = avatarImg?.offsetHeight ?? 0
      useResumeStore.getState().setAvatarRenderedSize(
        aw > 0 && ah > 0 ? { width: aw, height: ah } : null,
      )

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
    })()

    return () => {
      cancelled = true
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
    <div ref={scrollRef} className="h-full overflow-y-auto overflow-x-hidden mr-1">
      <div
        style={{
          width: `${paper.pxW * effectiveScale}px`,
          margin: '24px auto',
        }}
      >
        {/* 占位容器：按缩放后的实际高度占位，裁掉 transform 的布局溢出，
            让状态栏紧贴缩放后的简历末尾，而不是原始高度下方。 */}
        <div style={{ height: `${containerHeight * effectiveScale}px`, overflow: 'hidden' }}>
          <div
            style={{
              transform: `scale(${effectiveScale})`,
              transformOrigin: 'top left',
              width: `${paper.pxW}px`,
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
        </div>
        <div className="mt-2 text-center py-1.5 text-xs text-surface-400 bg-surface-50 border-t border-surface-100">
          共 {pageCount} 页 · {paper.name} · {Math.round(effectiveScale * 100)}%
        </div>
      </div>
    </div>
  )
}
