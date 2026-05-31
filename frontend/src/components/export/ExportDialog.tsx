import { useState, useCallback } from 'react'
import { useResumeStore } from '../../stores/resumeStore'
import { FileText, FileEdit, Image, X, Download, Loader2, Check, AlertCircle } from 'lucide-react'
import { callService } from '../../services/backend'

interface Props {
  onClose: () => void
}

const formats = [
  { id: 'pdf' as const, label: 'PDF 文档', desc: '适合打印和投递，保留完整排版和超链接', icon: FileText },
  { id: 'docx' as const, label: 'Word 文档', desc: '可编辑的 .docx 文件，便于他人修改', icon: FileEdit },
  { id: 'png' as const, label: 'PNG 图片', desc: '高清截图，用于在线预览和分享', icon: Image },
]

type ExportStatus = 'idle' | 'exporting' | 'done' | 'error'

export function ExportDialog({ onClose }: Props) {
  const resume = useResumeStore((s) => s.resume)
  const previewHtml = useResumeStore((s) => s.previewHtml)
  const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'docx' | 'png'>('pdf')
  const [scale, setScale] = useState(1.5)
  const [status, setStatus] = useState<ExportStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleExport = useCallback(async () => {
    if (!resume) return
    setStatus('exporting')
    setErrorMsg('')

    try {
      // Try Go backend export service
      const resumeJSON = JSON.stringify(resume)
      let result: string | null = null

      switch (selectedFormat) {
        case 'pdf':
          result = await callService<string>('ExportService', 'ExportPDF', resumeJSON, scale, '')
          break
        case 'docx':
          result = await callService<string>('ExportService', 'ExportDOCX', resumeJSON)
          break
        case 'png':
          result = await callService<string>('ExportService', 'ExportPNG', resumeJSON, scale)
          break
      }

      if (result) {
        setStatus('done')
        setTimeout(() => onClose(), 800)
        return
      }

      // Fallback: use browser print for PDF
      if (selectedFormat === 'pdf' && previewHtml) {
        printPreview(previewHtml)
        setStatus('done')
        setTimeout(() => onClose(), 500)
        return
      }

      // Fallback: download HTML for other formats
      downloadAsHtml(previewHtml || '', resume.personal.full_name || 'resume')
      setStatus('done')
      setTimeout(() => onClose(), 500)
    } catch (err) {
      console.error('Export failed:', err)
      setErrorMsg(err instanceof Error ? err.message : '导出失败，请重试')
      setStatus('error')
    }
  }, [resume, previewHtml, selectedFormat, scale, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-slate-800">导出简历</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Format Selection */}
          <div>
            <label className="text-sm font-medium text-slate-600 mb-2 block">选择格式</label>
            <div className="space-y-2">
              {formats.map(({ id, label, desc, icon: Icon }) => (
                <label
                  key={id}
                  className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedFormat === id
                      ? 'border-primary-500 bg-primary-50/50'
                      : 'border-slate-200 hover:border-slate-300'
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
                  <Icon className={`w-5 h-5 mt-0.5 ${selectedFormat === id ? 'text-primary-600' : 'text-slate-400'}`} />
                  <div>
                    <p className="text-sm font-medium text-slate-700">{label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Scale option (PNG only) */}
          {selectedFormat === 'png' && (
            <div>
              <label className="text-sm font-medium text-slate-600 mb-2 block">清晰度</label>
              <div className="flex gap-2">
                {[
                  { value: 1, label: '1×' },
                  { value: 1.5, label: '1.5×' },
                  { value: 2, label: '2×' },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setScale(value)}
                    className={`px-4 py-2 text-sm rounded-lg border-2 transition-all ${
                      scale === value
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* DOCX notice */}
          {selectedFormat === 'docx' && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-sm text-amber-700">
                DOCX 导出需要 Go 后端支持。如果未启动完整应用，建议先使用 PDF 格式导出。
              </p>
            </div>
          )}

          {/* Status */}
          {status === 'exporting' && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
              <span className="text-sm text-blue-700">正在导出 {selectedFormat.toUpperCase()}...</span>
            </div>
          )}

          {status === 'done' && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
              <Check className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-700">导出完成！</span>
            </div>
          )}

          {status === 'error' && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-700">{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200">
          <button onClick={onClose} className="btn-secondary" disabled={status === 'exporting'}>
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

function printPreview(html: string) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('请允许弹出窗口以打印简历')
    return
  }
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => printWindow.print(), 300)
}

function downloadAsHtml(html: string, name: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}_简历.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
