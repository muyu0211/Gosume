import { useCallback, useEffect, useState } from 'react'
import { Events } from '@wailsio/runtime'
import { useResumeStore } from '../stores/resumeStore'
import { callService, isWails } from '../services/backend'
import { paginateHTMLString } from '../lib/exportHtml'
import { renderResumeHtml } from '../lib/templateEngine'
import { injectGlobalVarsCss } from '../lib/layoutPresets'
import { FALLBACK_TEMPLATE_ID } from '../lib/resumePreview'
import { loadTemplateContent } from '../services/templateService'
import { useT } from '../lib/i18n'
import type { Resume, ResumeListItem } from '../types/resume'

export type BatchExportFormat = 'pdf' | 'png'

/**
 * 简历列表的批量能力（多选 / 批量删除 / 批量导出）与单份删除。
 *
 * 原为 `components/resume/ResumeListDrawer` 内联实现，首页改版后抽成 hook，
 * 由【我的简历】一级页面直接消费（抽屉已随改版下线）。
 */
export function useResumeBatch(items: ResumeListItem[]) {
  const t = useT()
  const setResumeList = useResumeStore((s) => s.setResumeList)
  const deleteResume = useResumeStore((s) => s.deleteResume)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // --- 单份删除 ---
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // --- 批量删除 ---
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false)
  const [batchDeleting, setBatchDeleting] = useState(false)

  // --- 批量导出 ---
  const [exportOpen, setExportOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<BatchExportFormat>('pdf')
  const [exportScale, setExportScale] = useState(1.5)
  const [exporting, setExporting] = useState(false)
  const [exportDone, setExportDone] = useState(false)
  /** 用户在原生保存对话框点了「取消」：后端发 export:canceled，导出被中止。 */
  const [exportCanceled, setExportCanceled] = useState(false)
  /** 批量导出进度 0-100；null 表示尚未开始。由后端 export:progress 事件驱动。 */
  const [exportProgress, setExportProgress] = useState<number | null>(null)

  // 监听后端导出进度事件（单份导出也会发该事件，但只在批量导出模态中展示）。
  useEffect(() => {
    if (!isWails()) return
    const offProgress = Events.On('export:progress', (ev) => {
      const p = typeof ev.data === 'number' ? ev.data : Number(ev.data)
      if (Number.isFinite(p)) setExportProgress(Math.max(0, Math.min(100, Math.round(p))))
    })
    // 取消保存：与「正常导出完成」区分，避免模态显示「导出完成」的错配文案
    const offCanceled = Events.On('export:canceled', () => setExportCanceled(true))
    return () => {
      offProgress()
      offCanceled()
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const list = await callService<ResumeListItem[]>('ResumeService', 'ListResumes')
      if (list) setResumeList(list)
    } catch { /* 保留当前列表 */ }
  }, [setResumeList])

  // --- 选择 ---
  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((r) => r.id)),
    )
  }, [items])

  const clear = useCallback(() => setSelectedIds(new Set()), [])

  // --- 单份删除 ---
  const askDelete = useCallback((id: string) => setConfirmDeleteId(id), [])
  const cancelDelete = useCallback(() => setConfirmDeleteId(null), [])
  const confirmDelete = useCallback(async () => {
    if (!confirmDeleteId) return
    setDeletingId(confirmDeleteId)
    try {
      await deleteResume(confirmDeleteId)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(confirmDeleteId)
        return next
      })
    } catch { /* 失败不阻断，列表以刷新结果为准 */ }
    setDeletingId(null)
    setConfirmDeleteId(null)
    await refresh()
  }, [confirmDeleteId, deleteResume, refresh])

  // --- 批量删除 ---
  const askBatchDelete = useCallback(() => setBatchConfirmOpen(true), [])
  const cancelBatchDelete = useCallback(() => setBatchConfirmOpen(false), [])
  const confirmBatchDelete = useCallback(async () => {
    setBatchDeleting(true)
    for (const id of Array.from(selectedIds)) {
      try {
        await deleteResume(id)
      } catch { /* 继续处理其余项 */ }
    }
    setBatchDeleting(false)
    setBatchConfirmOpen(false)
    setSelectedIds(new Set())
    await refresh()
  }, [deleteResume, refresh, selectedIds])

  // --- 批量导出 ---
  const askExport = useCallback(() => {
    setExportDone(false)
    setExportCanceled(false)
    setExportProgress(null)
    setExportOpen(true)
  }, [])

  const cancelExport = useCallback(() => {
    if (!exporting) {
      setExportOpen(false)
      setExportProgress(null)
    }
  }, [exporting])

  const runExport = useCallback(async () => {
    if (exportDone) {
      setExportOpen(false)
      setSelectedIds(new Set())
      return
    }
    setExporting(true)
    setExportProgress(0)
    try {
      const ids = Array.from(selectedIds)
      const exportItems: { name: string; html: string }[] = []

      for (const id of ids) {
        const resume = await callService<Resume>('ResumeService', 'GetResumeByID', id)
        if (!resume) continue
        // 导出文件名取「简历项目名」（列表项 name，缺则回退 meta.name），
        // 不再用个人信息里的姓名：批量导出按项目维度处理，用个人姓名既与
        // 列表对不上，也容易多份撞名。
        const name =
          items.find((it) => it.id === id)?.name ||
          resume.meta.name ||
          t('resumeTitlePlaceholder')
        const templateId = resume.meta.template_id || FALLBACK_TEMPLATE_ID
        const tmpl = await loadTemplateContent(templateId)
        const rendered = renderResumeHtml(tmpl, resume)
        // 注入 per-resume custom_css（空则不注入 → 模板原生外观）。
        const htmlWithVars = injectGlobalVarsCss(rendered, resume)
        const paginatedHtml = await paginateHTMLString(
          htmlWithVars,
          exportFormat === 'png' ? 'continuous' : 'paged',
        )
        exportItems.push({ name, html: paginatedHtml })
      }

      if (exportItems.length === 0) {
        setExporting(false)
        return
      }

      // PDF 必须 scale=1.0 —— 放大后每页会溢出 A4，导致内容页后跟随空白页。
      const scale = exportFormat === 'pdf' ? 1.0 : exportScale
      await callService<string[]>('ExportService', 'ExportBatch', JSON.stringify(exportItems), exportFormat, scale)
    } catch { /* 用户取消或导出失败，静默收尾 */ }
    setExporting(false)
    setExportDone(true)
  }, [exportDone, exportFormat, exportScale, items, selectedIds, t])

  return {
    selectedIds,
    count: selectedIds.size,
    allSelected: items.length > 0 && selectedIds.size === items.length,
    isSelected: (id: string) => selectedIds.has(id),
    toggle,
    toggleAll,
    clear,

    confirmDeleteId,
    deletingId,
    askDelete,
    cancelDelete,
    confirmDelete,

    batchConfirmOpen,
    batchDeleting,
    askBatchDelete,
    cancelBatchDelete,
    confirmBatchDelete,

    exportOpen,
    exportFormat,
    setExportFormat,
    exportScale,
    setExportScale,
    exportProgress,
    exporting,
    exportDone,
    exportCanceled,
    askExport,
    cancelExport,
    runExport,

    refresh,
  }
}
