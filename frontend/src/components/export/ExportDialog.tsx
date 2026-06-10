import { useState, useCallback, useEffect, useRef } from 'react'
import { useResumeStore } from '../../stores/resumeStore'
import { FileText, Image, X, Download, Loader2, Check, AlertCircle } from 'lucide-react'
import { callService } from '../../services/backend'

interface Props {
  onClose: () => void
}

const formats = [
  { id: 'pdf' as const, label: 'PDF 文档', desc: '适合打印和投递，保留完整排版和超链接', icon: FileText },
  { id: 'png' as const, label: 'PNG 图片', desc: '高清截图，用于在线预览和分享', icon: Image },
]

type ExportStatus = 'idle' | 'exporting' | 'done' | 'error'
type Phase = 'entering' | 'open' | 'exiting'

export function ExportDialog({ onClose }: Props) {
  const resume = useResumeStore((s) => s.resume)
  const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'png'>('pdf')
  const [scale, setScale] = useState(1.5)
  const [status, setStatus] = useState<ExportStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [phase, setPhase] = useState<Phase>('entering')
  const closingTimeout = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase('open'))
    })
    return () => {
      if (closingTimeout.current) clearTimeout(closingTimeout.current)
    }
  }, [])

  const handleClose = useCallback(() => {
    setPhase('exiting')
  }, [])

  const handleTransitionEnd = () => {
    if (phase === 'exiting') {
      onClose()
    }
  }

  const handleExport = useCallback(async () => {
    if (!resume) return
    setStatus('exporting')
    setErrorMsg('')

    try {
      const resumeJSON = JSON.stringify(resume)
      let filePath: string | null = null

      switch (selectedFormat) {
        case 'pdf':
          filePath = await callService<string>('ExportService', 'ExportPDF', resumeJSON, 1.0, '')
          break
        case 'png':
          filePath = await callService<string>('ExportService', 'ExportPNG', resumeJSON, scale)
          break
      }

      if (!filePath) {
        // User cancelled the save dialog — just close silently.
        handleClose()
        return
      }

      setStatus('done')
      closingTimeout.current = setTimeout(() => handleClose(), 800)
    } catch (err) {
      console.error('Export failed:', err)
      setErrorMsg(err instanceof Error ? err.message : '导出失败，请重试')
      setStatus('error')
    }
  }, [resume, selectedFormat, scale, handleClose])

  const isActive = phase === 'open' || phase === 'entering'

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-200 ${
        isActive ? 'bg-black/25 backdrop-blur-sm' : 'bg-transparent backdrop-blur-none'
      }`}
      onClick={handleClose}
    >
      <div
        onTransitionEnd={handleTransitionEnd}
        onClick={(e) => e.stopPropagation()}
        className={`bg-white rounded-2xl shadow-xl w-[480px] max-h-[90vh] overflow-auto transition-all duration-200 ${
          phase === 'entering'
            ? 'opacity-0 scale-96 translate-y-2'
            : phase === 'open'
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-96 translate-y-2'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center">
              <Download className="w-5 h-5 text-primary-600" />
            </div>
            <h2 className="text-lg font-semibold text-surface-800">导出简历</h2>
          </div>
          <button onClick={handleClose} className="p-1.5 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div>
            <label className="text-sm font-medium text-surface-600 mb-3 block">选择格式</label>
            <div className="space-y-2">
              {formats.map(({ id, label, desc, icon: Icon }) => (
                <label
                  key={id}
                  className={`flex items-start gap-3.5 p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-150 ${
                    selectedFormat === id
                      ? 'border-primary-400 bg-primary-50/40'
                      : 'border-surface-200 hover:border-surface-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="format"
                    value={id}
                    checked={selectedFormat === id}
                    onChange={() => { setSelectedFormat(id); setStatus('idle'); setErrorMsg('') }}
                    className="mt-0.5 accent-primary-600"
                  />
                  <Icon className={`w-5 h-5 mt-0.5 ${selectedFormat === id ? 'text-primary-500' : 'text-surface-400'}`} />
                  <div>
                    <p className="text-sm font-medium text-surface-700">{label}</p>
                    <p className="text-xs text-surface-400 mt-0.5">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {selectedFormat === 'png' && (
            <div>
              <label className="text-sm font-medium text-surface-600 mb-3 block">清晰度</label>
              <div className="flex gap-2">
                {[
                  { value: 1, label: '1x' },
                  { value: 1.5, label: '1.5x' },
                  { value: 2, label: '2x' },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setScale(value)}
                    className={`px-4 py-2 text-sm rounded-lg border-2 transition-all duration-150 ${
                      scale === value
                        ? 'border-primary-400 bg-primary-50 text-primary-700 font-medium'
                        : 'border-surface-200 text-surface-600 hover:border-surface-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {status === 'exporting' && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-blue-50 border border-blue-100">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
              <span className="text-sm text-blue-700">正在导出 {selectedFormat.toUpperCase()}...</span>
            </div>
          )}

          {status === 'done' && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-emerald-50 border border-emerald-100">
              <Check className="w-4 h-4 text-emerald-600" />
              <span className="text-sm text-emerald-700">导出完成！</span>
            </div>
          )}

          {status === 'error' && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-red-50 border border-red-100">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-700">{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-surface-100">
          <button onClick={handleClose} className="btn-secondary" disabled={status === 'exporting'}>
            取消
          </button>
          <button
            onClick={handleExport}
            disabled={status === 'exporting' || status === 'done'}
            className="btn-primary gap-2"
          >
            {status === 'exporting' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : status === 'done' ? (
              <Check className="w-4 h-4" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {status === 'exporting' ? '导出中...' : status === 'done' ? '已完成' : `导出 ${selectedFormat.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}
