import { useState, useCallback, useRef } from 'react'
import { useResumeStore } from '../../stores/resumeStore'
import { useTemplateStore } from '../../stores/templateStore'
import { FileText, Image, FileJson, X, Download, Loader2, Check, AlertCircle } from 'lucide-react'
import { callService } from '../../services/backend'
import { extractErrorMessage } from '../../lib/errorUtils'
import { paginateHTMLString } from '../../lib/exportHtml'
import { renderTemplate } from '../../lib/templateEngine'
import { loadTemplateContent } from '../../services/templateService'
import { injectLayoutCss, injectAvatarSizeCss } from '../../lib/layoutPresets'
import { useLayoutSettingsStore } from '../../stores/layoutSettingsStore'
import { getTemplatePaper, contentHeightRatio, ratioLevel } from '../../lib/contentHeight'
import { Expandable } from '../ui/Expandable'
import { Modal, type ModalHandle } from '../ui/Modal'

const DEFAULT_TEMPLATE_ID = 'a406004d-d3b8-4900-969f-8094f8e85cf0'
/** 一页 PDF 的 PNG 渲染像素密度（固定，不向用户暴露清晰度选项）。 */
const ONE_PAGE_PNG_SCALE = 2.0

interface Props {
  onClose: () => void
}

const formats = [
  { id: 'pdf' as const, label: 'PDF 文档', desc: '适合打印和投递，保留完整排版和超链接', icon: FileText },
  { id: 'png' as const, label: 'PNG 图片', desc: '高清截图，用于在线预览和分享', icon: Image },
  { id: '单页pdf' as const, label: '单页 PDF', desc: '将全部内容压缩为单页，内容超高时字体会缩小', icon: FileText },
  { id: 'gosume' as const, label: '可编辑简历 (.gosume)', desc: '保存为可继续编辑的简历，可暂存备份、发送他人或换设备继续编辑', icon: FileJson },
]

type ExportFormat = (typeof formats)[number]['id']

type ExportStatus = 'idle' | 'exporting' | 'done' | 'error'

export function ExportDialog({ onClose }: Props) {
  const resume = useResumeStore((s) => s.resume)
  const contentHeight = useResumeStore((s) => s.contentHeight)
  const templates = useTemplateStore((s) => s.templates)
  const activeTemplateId = useTemplateStore((s) => s.activeTemplateId)
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf')
  const [scale, setScale] = useState(1.5)
  const [status, setStatus] = useState<ExportStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const modalRef = useRef<ModalHandle>(null)

  const activeTemplate = templates.find((t) => t.id === activeTemplateId)
  // 一页 PDF 的内容高度提示：复用保存后测量的 contentHeight
  const paper = getTemplatePaper(activeTemplate?.paper_size, activeTemplate?.orientations?.[0])
  const heightRatio = contentHeightRatio(contentHeight, paper)
  const heightLevel = heightRatio == null ? null : ratioLevel(heightRatio)
  const heightPercent = heightRatio == null ? null : Math.round(heightRatio * 100)

  const handleExport = useCallback(async () => {
    if (!resume) return
    setStatus('exporting')
    setErrorMsg('')

    try {
      let filePath: string | null = null

      if (selectedFormat === 'gosume') {
        // 中间态导出不经过 HTML 渲染/分页管线：后端直接序列化当前简历
        // 数据为 .gosume 文件（含布局档位剥离），本地瞬时完成。
        filePath = await callService<string>('FileService', 'ExportFile')
      } else {
        // 现场渲染当前 resume（与批量导出、内容高度测量同一渲染链路：
        // renderTemplate → 布局 CSS → 头像尺寸 CSS → 分页），不依赖可能滞后的
        // previewHtml（预览是 300ms 防抖异步），保证导出内容与当前状态严格一致。
        const templateId = resume.meta.template_id || DEFAULT_TEMPLATE_ID
        const tmpl = await loadTemplateContent(templateId)
        const rendered = renderTemplate(tmpl, resume)
        const htmlWithLayout = injectLayoutCss(
          rendered,
          resume.meta?.page_margin,
          resume.meta?.section_spacing,
          useLayoutSettingsStore.getState(),
        )
        const htmlWithAvatar = injectAvatarSizeCss(htmlWithLayout, resume.personal)

        const pageMode = selectedFormat === 'png' || selectedFormat === '单页pdf' ? 'continuous' : 'paged'
        const paginatedHtml = await paginateHTMLString(htmlWithAvatar,pageMode)

        const resumeName = resume.meta.name || ''

        switch (selectedFormat) {
          case 'pdf':
            filePath = await callService<string>('ExportService', 'Export', paginatedHtml, 'pdf', 1.0, resumeName)
            break
          case 'png':
            filePath = await callService<string>('ExportService', 'Export', paginatedHtml, 'png', scale, resumeName)
            break
          case '单页pdf':
            filePath = await callService<string>('ExportService', 'Export', paginatedHtml, 'single_pdf', ONE_PAGE_PNG_SCALE, resumeName)
            break
        }
      }

      if (!filePath) {
        // User cancelled the save dialog — just close silently.
        modalRef.current?.close()
        return
      }

      setStatus('done')
      setTimeout(() => modalRef.current?.close(), 800)
    } catch (err) {
      console.error('Export failed:', err)
      setErrorMsg(extractErrorMessage(err, '导出失败，请重试'))
      setStatus('error')
    }
  }, [resume, selectedFormat, scale])

  return (
    <Modal ref={modalRef} onClose={onClose} width="w-[480px]" cardClassName="overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center">
            <Download className="w-5 h-5 text-primary-600" />
          </div>
          <h2 className="text-lg font-semibold text-surface-800">导出简历</h2>
        </div>
        <button onClick={() => modalRef.current?.close()} className="p-1.5 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-100 transition-colors">
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

          <Expandable show={selectedFormat === 'png'} gapTop={20}>
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
          </Expandable>

          {/* 一页 PDF：内容高度提示（由导出入口的保存动作更新 contentHeight，130% 仅为建议阈值不阻止导出） */}
          <Expandable show={selectedFormat === '单页pdf'} gapTop={20}>
            <div>
              <label className="text-sm font-medium text-surface-600 mb-2 block">内容高度参考</label>
              {heightLevel == null ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-surface-100 text-surface-500 text-sm">
                  保存简历后自动计算内容高度，用于判断一页导出的观感
                </div>
              ) : (
                <div
                  className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
                    heightLevel === 'over'
                      ? 'bg-red-50 border-red-100 text-red-700'
                      : heightLevel === 'ok'
                      ? 'bg-amber-50 border-amber-100 text-amber-700'
                      : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    {heightLevel === 'over'
                      ? `当前内容约为一页的 ${heightPercent}%，超出较多。单页导出会按比例缩小宽度，字体/内容明显变小，建议使用普通 PDF 导出。`
                      : heightLevel === 'ok'
                      ? `当前内容约为一页的 ${heightPercent}%，仅轻微超出，一页导出观感良好，推荐使用。`
                      : `当前内容约为一页的 ${heightPercent}%，一页内完整放下，一页导出不会压缩。`}
                  </span>
                </div>
              )}
            </div>
          </Expandable>

          <Expandable show={status !== 'idle'} gapTop={20}>
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
          </Expandable>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-surface-100">
          <button onClick={() => modalRef.current?.close()} className="btn-secondary" disabled={status === 'exporting'}>
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
            {status === 'exporting' ? '导出中...' : status === 'done' ? '已完成' : selectedFormat === 'gosume' ? '导出可编辑简历' : `导出${selectedFormat.toUpperCase()}`}
          </button>
        </div>
    </Modal>
  )
}
