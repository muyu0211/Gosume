import { useEffect, useState, useRef, useCallback } from 'react'
import { X, FileText, Clock, ChevronRight, Inbox, Trash2, AlertTriangle, CheckSquare, Square, Download, Loader2, Image } from 'lucide-react'
import { useResumeStore } from '../../stores/resumeStore'
import { callService } from '../../services/backend'
import { paginateHTMLString } from '../../lib/exportHtml'
import { renderTemplate } from '../../lib/templateEngine'
import { loadTemplateContent } from '../../services/templateService'
import { injectLayoutCss, injectAvatarSizeCss } from '../../lib/layoutPresets'
import { useLayoutSettingsStore } from '../../stores/layoutSettingsStore'
import type { ResumeListItem, Resume } from '../../types/resume'

interface Props {
  open: boolean
  onClose: () => void
  onOpenResume: (id: string) => void
}

type Phase = 'closed' | 'entering' | 'open' | 'exiting'

export function ResumeListDrawer({ open, onClose, onOpenResume }: Props) {
  const resumeList = useResumeStore((s) => s.resumeList)
  const setResumeList = useResumeStore((s) => s.setResumeList)
  const deleteResume = useResumeStore((s) => s.deleteResume)
  const [phase, setPhase] = useState<Phase>('closed')
  const hasOpened = useRef(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [showBatchConfirm, setShowBatchConfirm] = useState(false)

  // Batch export
  const [showBatchExport, setShowBatchExport] = useState(false)
  const [batchExportFormat, setBatchExportFormat] = useState<'pdf' | 'png'>('pdf')
  const [batchExportScale, setBatchExportScale] = useState(1.5)
  const [batchExporting, setBatchExporting] = useState(false)
  const [batchExportDone, setBatchExportDone] = useState(false)

  useEffect(() => {
    if (open) {
      hasOpened.current = true
      setPhase('entering')
      setSelectedIds(new Set())
      refreshList()
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase('open'))
      })
    } else if (hasOpened.current) {
      setPhase('exiting')
    }
  }, [open])

  const handleTransitionEnd = () => {
    if (phase === 'exiting') {
      setPhase('closed')
    }
  }

  const refreshList = async () => {
    try {
      const list = await callService<ResumeListItem[]>('ResumeService', 'ListResumes')
      if (list) setResumeList(list)
    } catch { /* keep current list */ }
  }

  // --- Single delete ---
  const handleDeleteClick = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setConfirmDeleteId(id)
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDeleteId) return
    setDeletingId(confirmDeleteId)
    try {
      await deleteResume(confirmDeleteId)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(confirmDeleteId)
        return next
      })
    } catch { /* fall through */ }
    setDeletingId(null)
    setConfirmDeleteId(null)
    await refreshList()
  }, [confirmDeleteId, deleteResume])

  const handleCancelDelete = useCallback(() => {
    setConfirmDeleteId(null)
  }, [])

  // --- Batch selection ---
  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === resumeList.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(resumeList.map((r) => r.id)))
    }
  }, [selectedIds.size, resumeList])

  // --- Batch delete ---
  const handleBatchDeleteClick = useCallback(() => {
    setShowBatchConfirm(true)
  }, [])

  const handleBatchConfirmDelete = useCallback(async () => {
    setBatchDeleting(true)
    const ids = Array.from(selectedIds)
    for (const id of ids) {
      try {
        await deleteResume(id)
      } catch { /* continue */ }
    }
    setBatchDeleting(false)
    setShowBatchConfirm(false)
    setSelectedIds(new Set())
    await refreshList()
  }, [selectedIds, deleteResume])

  const handleCancelBatchDelete = useCallback(() => {
    setShowBatchConfirm(false)
  }, [])

  // --- Batch export ---
  const handleBatchExportClick = useCallback(() => {
    setBatchExportDone(false)
    setShowBatchExport(true)
  }, [])

  const handleBatchExport = useCallback(async () => {
    if (batchExportDone) {
      setShowBatchExport(false)
      setSelectedIds(new Set())
      return
    }
    setBatchExporting(true)
    try {
      // Layout tiers are user-customizable (config.json); make sure they
      // are loaded before resolving resume.meta keys during export.
      await useLayoutSettingsStore.getState().ensureLoaded()
      const { margins, spacings } = useLayoutSettingsStore.getState()

      const ids = Array.from(selectedIds)
      const items: { name: string; html: string }[] = []

      for (const id of ids) {
        const resume = await callService<Resume>('ResumeService', 'GetResumeByID', id)
        if (!resume) continue

        const name = resume.personal.full_name || resume.meta.name || '未命名简历'
        const templateId = resume.meta.template_id || 'a406004d-d3b8-4900-969f-8094f8e85cf0'
        const tmpl = await loadTemplateContent(templateId)
        const rendered = renderTemplate(tmpl, resume)
        // Inject layout overrides (margin + section spacing tier keys) so
        // batch export honors resume.meta.page_margin / section_spacing
        const htmlWithLayout = injectLayoutCss(
          rendered,
          resume.meta?.page_margin,
          resume.meta?.section_spacing,
          { margins, spacings },
        )
        // Apply user-controlled avatar display size (consistent with preview).
        const htmlWithAvatar = injectAvatarSizeCss(htmlWithLayout, resume.personal)
        const paginatedHtml = await paginateHTMLString(htmlWithAvatar, batchExportFormat === 'png' ? 'continuous' : 'paged')
        items.push({ name, html: paginatedHtml })
      }

      if (items.length === 0) {
        setBatchExporting(false)
        return
      }

      // PDF must use scale=1.0 — larger scales make each .resume-page overflow A4, producing blank pages after every content page.
      const exportScale = batchExportFormat === 'pdf' ? 1.0 : batchExportScale
      await callService<string[]>('ExportService', 'ExportBatchHTML', JSON.stringify(items), batchExportFormat, exportScale)
    } catch { /* user cancelled or error */ }
    setBatchExporting(false)
    setBatchExportDone(true)
  }, [selectedIds, batchExportFormat, batchExportScale, batchExportDone])

  const handleCancelBatchExport = useCallback(() => {
    if (!batchExporting) {
      setShowBatchExport(false)
    }
  }, [batchExporting])

  // --- Derived ---
  const targetItem = confirmDeleteId
    ? resumeList.find((r) => r.id === confirmDeleteId)
    : null
  const allSelected = resumeList.length > 0 && selectedIds.size === resumeList.length
  const batchCount = selectedIds.size

  if (phase === 'closed') return null

  const isActive = phase === 'open' || phase === 'entering'

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end transition-all duration-300 ${
        isActive
          ? 'bg-black/30 backdrop-blur-sm'
          : 'bg-transparent backdrop-blur-none'
      }`}
      onClick={onClose}
    >
      {/* Drawer panel */}
      <div
        onTransitionEnd={handleTransitionEnd}
        onClick={(e) => e.stopPropagation()}
        className={`w-[420px] max-w-[90vw] h-full bg-white shadow-2xl flex flex-col transition-all duration-300 ${
          phase === 'entering'
            ? 'translate-x-full'
            : phase === 'open'
            ? 'translate-x-0'
            : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200 shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-surface-800">全部简历</h2>
            <span className="text-xs text-surface-400 bg-surface-100 px-2 py-0.5 rounded-full">
              {resumeList.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {resumeList.length > 0 && (
              <button
                onClick={handleSelectAll}
                className="px-2.5 py-1.5 text-xs font-medium text-surface-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
              >
                {allSelected ? '取消全选' : '全选'}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto">
          {resumeList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-surface-400 gap-3">
              <Inbox className="w-12 h-12" />
              <p className="text-sm">暂无保存的简历</p>
              <p className="text-xs">创建新简历后将在此显示</p>
            </div>
          ) : (
            <div className="py-2">
              {resumeList.map((item) => {
                const isSelected = selectedIds.has(item.id)
                return (
                  <div
                    key={item.id}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-50 transition-colors text-left group cursor-pointer"
                    onClick={() => onOpenResume(item.id)}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={(e) => toggleSelect(item.id, e)}
                      className={`shrink-0 p-0.5 rounded transition-all duration-200 ${
                        isSelected
                          ? 'text-primary-600'
                          : 'text-surface-300 opacity-0 group-hover:opacity-100'
                      }`}
                      title={isSelected ? '取消选择' : '选择'}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>

                    <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center shrink-0 group-hover:bg-primary-100 transition-colors">
                      <FileText className="w-4 h-4 text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-700 truncate">
                        {item.name || '未命名简历'}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-3 h-3 text-surface-400" />
                        <span className="text-xs text-surface-400">
                          {new Date(item.updated_at).toLocaleString('zh-CN')}
                        </span>
                      </div>
                    </div>
                    {/* Single delete */}
                    <button
                      onClick={(e) => handleDeleteClick(e, item.id)}
                      className="p-1.5 text-surface-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200"
                      title="删除简历"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-surface-300 group-hover:text-primary-500 transition-colors" />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer / Batch bar */}
        <div className="shrink-0 border-t border-surface-200">
          {/* Batch action bar — slides up when items are selected */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-out ${
              batchCount > 0 ? 'max-h-14 opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="flex items-center justify-between px-4 py-2.5 bg-primary-50 border-b border-primary-100">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSelectAll}
                  className="text-xs font-medium text-primary-700 hover:text-primary-900 transition-colors"
                >
                  {allSelected ? '取消全选' : '全选'}
                </button>
                <span className="text-xs text-primary-600">
                  已选 <span className="font-semibold">{batchCount}</span> 份
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBatchExportClick}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  批量导出
                </button>
                <button
                  onClick={handleBatchDeleteClick}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  批量删除
                </button>
              </div>
            </div>
          </div>

          {/* Regular footer */}
          <div className="px-5 py-3">
            <p className="text-xs text-surface-400 text-center">
              共 {resumeList.length} 份简历
            </p>
          </div>
        </div>
      </div>

      {/* Single-delete confirmation dialog */}
      {confirmDeleteId && (
        <div
          className="absolute inset-0 bg-black/20 flex items-center justify-center animate-dialog-overlay-enter"
          onClick={handleCancelDelete}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl shadow-2xl p-6 w-[360px] max-w-[90vw] animate-dialog-enter"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-surface-800">确认删除</h3>
                <p className="text-sm text-surface-500 mt-1">
                  确定要删除「{targetItem?.name || '未命名简历'}」吗？此操作不可撤销。
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 mt-6">
              <button
                onClick={handleCancelDelete}
                disabled={!!deletingId}
                className="px-4 py-2 text-sm font-medium text-surface-600 bg-surface-100 hover:bg-surface-200 rounded-lg transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={!!deletingId}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {deletingId ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    删除中...
                  </>
                ) : (
                  '确认删除'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch-delete confirmation dialog */}
      {showBatchConfirm && (
        <div
          className="absolute inset-0 bg-black/20 flex items-center justify-center animate-dialog-overlay-enter"
          onClick={handleCancelBatchDelete}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl shadow-2xl p-6 w-[380px] max-w-[90vw] animate-dialog-enter"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-surface-800">批量删除确认</h3>
                <p className="text-sm text-surface-500 mt-1">
                  确定要删除选中的 <span className="font-semibold text-red-600">{batchCount}</span> 份简历吗？此操作不可撤销。
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 mt-6">
              <button
                onClick={handleCancelBatchDelete}
                disabled={batchDeleting}
                className="px-4 py-2 text-sm font-medium text-surface-600 bg-surface-100 hover:bg-surface-200 rounded-lg transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleBatchConfirmDelete}
                disabled={batchDeleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {batchDeleting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    删除中...
                  </>
                ) : (
                  `删除 ${batchCount} 份`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch-export dialog */}
      {showBatchExport && (
        <div
          className="absolute inset-0 bg-black/20 flex items-center justify-center animate-dialog-overlay-enter"
          onClick={handleCancelBatchExport}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl shadow-2xl p-6 w-[400px] max-w-[90vw] animate-dialog-enter"
          >
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                <Download className="w-5 h-5 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-surface-800">批量导出</h3>
                <p className="text-sm text-surface-500 mt-1">
                  将选中的 <span className="font-semibold text-primary-600">{batchCount}</span> 份简历导出，
                  首次选择保存位置后，其余将自动保存至同一目录。
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Format selection */}
              <div>
                <label className="text-sm font-medium text-surface-600 mb-2 block">选择格式</label>
                <div className="flex gap-2">
                  {[
                    { id: 'pdf' as const, label: 'PDF', icon: FileText },
                    { id: 'png' as const, label: 'PNG', icon: Image },
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setBatchExportFormat(id)}
                      disabled={batchExporting}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm rounded-lg border-2 transition-all duration-150 disabled:opacity-50 ${
                        batchExportFormat === id
                          ? 'border-primary-400 bg-primary-50 text-primary-700 font-medium'
                          : 'border-surface-200 text-surface-600 hover:border-surface-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {batchExportFormat === 'png' && (
                <div>
                  <label className="text-sm font-medium text-surface-600 mb-2 block">清晰度</label>
                  <div className="flex gap-2">
                    {[
                      { value: 1, label: '1x' },
                      { value: 1.5, label: '1.5x' },
                      { value: 2, label: '2x' },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => setBatchExportScale(value)}
                        disabled={batchExporting}
                        className={`px-4 py-2 text-sm rounded-lg border-2 transition-all duration-150 disabled:opacity-50 ${
                          batchExportScale === value
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
            </div>

            <div className="flex justify-end gap-2.5 mt-6">
              <button
                onClick={handleCancelBatchExport}
                disabled={batchExporting}
                className="px-4 py-2 text-sm font-medium text-surface-600 bg-surface-100 hover:bg-surface-200 rounded-lg transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleBatchExport}
                disabled={batchExporting}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {batchExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    导出中...
                  </>
                ) : batchExportDone ? (
                  '完成'
                ) : (
                  `导出 ${batchExportFormat.toUpperCase()}`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
