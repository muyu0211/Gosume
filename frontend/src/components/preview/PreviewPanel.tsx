import { useRef, useEffect } from 'react'
import { useResumeStore } from '../../stores/resumeStore'
import { useEditorStore } from '../../stores/editorStore'

export function PreviewPanel() {
  const previewHtml = useResumeStore((s) => s.previewHtml)
  const zoom = useEditorStore((s) => s.zoom)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (iframeRef.current && previewHtml) {
      const doc = iframeRef.current.contentDocument
      if (doc) {
        doc.open()
        doc.write(previewHtml)
        doc.close()
      }
    }
  }, [previewHtml])

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
    <div className="h-full flex items-start justify-center py-6">
      <div
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top center',
          width: `${210 * 3.78}px`, // A4 width in px at 96dpi
        }}
        className="bg-white shadow-xl transition-transform"
      >
        <iframe
          ref={iframeRef}
          className="w-full border-none"
          style={{ height: `${297 * 3.78}px` }} // A4 height
          title="简历预览"
          sandbox="allow-same-origin"
        />
        {/* Page indicator */}
        <div className="text-center py-1.5 text-xs text-slate-400 bg-slate-50 border-t border-slate-100">
          1/1 页 · A4 · {Math.round(zoom * 100)}%
        </div>
      </div>
    </div>
  )
}
