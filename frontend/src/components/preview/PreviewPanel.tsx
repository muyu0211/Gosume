import { useRef, useEffect, useState } from 'react'
import { useResumeStore } from '../../stores/resumeStore'
import { useEditorStore } from '../../stores/editorStore'
import { useTemplateStore } from '../../stores/templateStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { paginateContent } from '../../lib/paginate'
import { DEFAULT_PAPER, type PaperSpec } from '../../lib/paper'
import { waitForDocumentReady } from '../../lib/paginationCore'
import {
  injectMorphdom,
  morphSourceContent,
  parsePreviewHtml,
  setupSourceShell,
  updateStyleById,
  SOURCE_ID,
  PAGES_ID,
} from '../../lib/morphPreview'
import { LAYOUT_STYLE_ID, AVATAR_STYLE_ID } from '../../lib/layoutPresets'

export function PreviewPanel() {
  const previewHtml = useResumeStore((s) => s.previewHtml)
  const zoom = useEditorStore((s) => s.zoom)
  const setZoom = useEditorStore((s) => s.setZoom)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const wheelCleanupRef = useRef<(() => void) | null>(null)
  // 三个独立签名，区分「切模板（全量重写）」「切布局档位（只改 style）」
  // 「改头像尺寸（只改 style）」「纯内容编辑（diff）」四种更新路径。
  const lastTemplateIdRef = useRef<string | null>(null)
  const lastLayoutKeyRef = useRef<string | null>(null)
  const lastAvatarKeyRef = useRef<string | null>(null)
  const [pageCount, setPageCount] = useState(1)
  const [paper, setPaper] = useState<PaperSpec>(DEFAULT_PAPER)
  const [containerHeight, setContainerHeight] = useState(DEFAULT_PAPER.pxH)

  // Load preview HTML into iframe (full on head change, diff on content edit), paginate, and inject Ctrl+wheel listener
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

    // 四种更新路径：切模板（全量重写）、全局布局变化（只改 style）、改头像尺寸（只改 style）、
    // 纯内容编辑（diff）。head/CSS 只在切模板时重写，布局/头像走 style 增量更新。
    const resume = useResumeStore.getState().resume
    const templateId = useTemplateStore.getState().activeTemplateId
    const l = useLayoutStore.getState().layout
    const layoutKey = [l.pageMarginY, l.pageMarginX, l.spacingSection, l.spacingItem, l.spacingDetail].join('|')
    const avatarKey = [String(resume?.personal?.avatar_width ?? ''), String(resume?.personal?.avatar_height ?? '')].join('|')

    const isTemplateChange = lastTemplateIdRef.current !== templateId
    const isLayoutChange = lastLayoutKeyRef.current !== layoutKey
    const isAvatarChange = lastAvatarKeyRef.current !== avatarKey

    if (isTemplateChange) {
      // 全量：重写 iframe 文档（含 head/CSS），改造成「源容器 + 展示层」，注入 morphdom
      doc.open()
      doc.write(previewHtml)
      doc.close()
      setupSourceShell(iframe)
      injectMorphdom(iframe)
      lastTemplateIdRef.current = templateId
      lastLayoutKeyRef.current = layoutKey
      lastAvatarKeyRef.current = avatarKey
    } else {
      // 增量：内容始终 diff（未变时 morphdom 为 no-op）；布局档位 / 头像尺寸变化时
      // 只更新对应 <style>，不重写 head/CSS，避免调档位时的白屏跳变。
      const parts = parsePreviewHtml(previewHtml)
      morphSourceContent(iframe, parts.contentHtml)
      if (isLayoutChange) {
        updateStyleById(doc, LAYOUT_STYLE_ID, parts.layoutRule)
        lastLayoutKeyRef.current = layoutKey
      }
      if (isAvatarChange) {
        updateStyleById(doc, AVATAR_STYLE_ID, parts.avatarRule)
        lastAvatarKeyRef.current = avatarKey
      }
    }

    let cancelled = false
    ;(async () => {
      // Wait for fonts/images, then one more frame to settle layout.
      await waitForDocumentReady(doc)
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      if (cancelled) return

      // 分页：从隐藏源容器派生到展示层（源容器保留，供下一次 diff）
      // 记录滚动位置，分页重建（iframe 高度可能变化）后恢复，避免视觉跳变。
      const scrollEl = scrollRef.current
      const prevScrollTop = scrollEl?.scrollTop ?? 0
      const source = doc.getElementById(SOURCE_ID)
      const pages = doc.getElementById(PAGES_ID)
      const result = paginateContent(iframe, {
        sourceEl: source ?? undefined,
        targetEl: pages ?? undefined,
      })
      if (scrollEl) scrollEl.scrollTop = prevScrollTop
      setPageCount(result.pageCount)
      setPaper(result.paper)
      const h = doc.body?.scrollHeight || result.paper.pxH
      setContainerHeight(h)

      // 测量头像实际渲染尺寸，回传 store 供编辑器 slider 初始值使用：
      // 无 avatar_width/height 时反映模板默认渲染值，避免硬编码 100px。
      // 值比较后再写入，避免每次编辑分页都触发编辑器的同步 effect。
      const avatarImg = doc.querySelector('.r-avatar img') as HTMLImageElement | null
      const measured = avatarImg && avatarImg.offsetWidth > 0
        ? { width: avatarImg.offsetWidth, height: avatarImg.offsetHeight }
        : null
      const prevSize = useResumeStore.getState().avatarRenderedSize
      if ((measured?.width ?? 0) !== (prevSize?.width ?? 0) || (measured?.height ?? 0) !== (prevSize?.height ?? 0)) {
        useResumeStore.getState().setAvatarRenderedSize(measured)
      }

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
        className="animate-preview-enter"
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
