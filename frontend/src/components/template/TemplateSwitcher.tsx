import { useState, useCallback, useRef, useEffect } from 'react'
import { useTemplateStore } from '../../stores/templateStore'
import { useResumeStore } from '../../stores/resumeStore'
import { generateAllThumbnails, getCachedThumbnails } from '../../services/thumbnailService'
import { importTemplatePackage, loadTemplateMetas, deleteTemplate } from '../../services/templateService'
import { extractErrorMessage } from '../../lib/errorUtils'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Check, ChevronDown, Layout, Loader2, Upload, Trash2 } from 'lucide-react'

const FALLBACK_COLORS: Record<string, string> = {
  'a406004d-d3b8-4900-969f-8094f8e85cf0': '#2563EB',
  '134eaf4d-6788-4cd3-82a5-36029e0301d1': '#1F2937',
  'ee56f81c-4564-47f7-bcbe-fdb1cbeeac9b': '#334155',
  '5783a016-1d38-4723-afa5-babb4a5c1bdd': '#6366F1',
  '550e2b7e-9a88-4869-9928-ea4e78c2ef4f': '#C8A45C',
  '8a4a05cb-78fe-42e5-ac2d-deec81418660': '#0F766E',
}

export function TemplateSwitcher() {
  const templates = useTemplateStore((s) => s.templates)
  const activeTemplateId = useTemplateStore((s) => s.activeTemplateId)
  const thumbnails = useTemplateStore((s) => s.thumbnails)
  const setActiveTemplate = useTemplateStore((s) => s.setActiveTemplate)
  const updateField = useResumeStore((s) => s.updateField)
  const setTemplates = useTemplateStore((s) => s.setTemplates)

  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const close = useCallback(() => {
    setOpen(false)
    // Delay removal until exit animation finishes
    exitTimerRef.current = setTimeout(() => setVisible(false), 150)
  }, [])

  useEffect(() => {
    if (open) {
      setVisible(true)
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    }
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    }
  }, [open])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        close()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [close])

  const setThumbnails = useTemplateStore((s) => s.setThumbnails)

  // Lazy-load thumbnails from cache if store is empty (e.g. direct /editor navigation)
  useEffect(() => {
    if (Object.keys(thumbnails).length === 0 && templates.length > 0) {
      const cached = getCachedThumbnails()
      if (Object.keys(cached).length > 0) {
        setThumbnails(cached)
      }
    }
  }, [thumbnails, templates, setThumbnails])

  const activeTemplate = templates.find((t) => t.id === activeTemplateId)
  const activeColor = activeTemplate?.colors?.primary
    || FALLBACK_COLORS[activeTemplateId || '']
    || '#2563EB'

  const handleSelect = useCallback((id: string) => {
    setActiveTemplate(id)
    updateField('meta.template_id', id)
    close()
  }, [setActiveTemplate, updateField, close])

  const handleImport = useCallback(async () => {
    setImporting(true)
    setImportError('')
    try {
      const result = await importTemplatePackage()
      if (!result) return

      const metas = await loadTemplateMetas()
      setTemplates(metas)
      setActiveTemplate(result.id)
      updateField('meta.template_id', result.id)

      const ids = metas.map((m) => m.id)
      generateAllThumbnails(ids).then((thumbs) => setThumbnails(thumbs))
    } catch (err) {
      console.error('Import template failed:', err)
      setImportError(extractErrorMessage(err, '模板导入失败'))
    } finally {
      setImporting(false)
    }
  }, [setActiveTemplate, setTemplates, setThumbnails, updateField])

  const handleDeleteClick = useCallback((e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation()
    setDeleteTarget({ id, name })
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    const { id } = deleteTarget
    setDeletingId(id)
    setImportError('')
    try {
      await deleteTemplate(id)
      const metas = await loadTemplateMetas()
      setTemplates(metas)
      // 删除当前激活模板时，切换到列表中的第一个模板
      if (id === activeTemplateId && metas.length > 0) {
        const firstId = metas[0].id
        setActiveTemplate(firstId)
        updateField('meta.template_id', firstId)
      }
      const ids = metas.map((m) => m.id)
      generateAllThumbnails(ids).then((thumbs) => setThumbnails(thumbs))
    } catch (err) {
      console.error('Delete template failed:', err)
      setImportError(extractErrorMessage(err, '模板删除失败'))
    } finally {
      setDeletingId(null)
      setDeleteTarget(null)
    }
  }, [deleteTarget, activeTemplateId, setTemplates, setActiveTemplate, updateField, setThumbnails])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => open ? close() : setOpen(true)}
        className="flex items-center gap-1.5 h-8 px-2 text-xs rounded-md hover:bg-surface-100 transition-colors text-surface-600"
      >
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: activeColor }}
        />
        <span className="max-w-[80px] truncate">{activeTemplate?.name || '模板'}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {visible && (
        <div className={`absolute right-0 top-full mt-1 w-72 bg-elev rounded-lg border border-surface-200 shadow-lg z-50 will-change-transform ${open ? 'animate-dropdown-enter' : 'animate-dropdown-exit pointer-events-none'}`}>
          <div className="px-3 py-1.5 text-[11px] text-surface-400 flex items-center gap-1.5 border-b border-surface-100">
            <Layout className="w-3 h-3" />
            切换模板风格
          </div>
          <div className="max-h-[380px] overflow-y-auto py-1">
          {templates.map((tmpl) => {
            const thumb = thumbnails[tmpl.id]
            const color = tmpl.colors?.primary || FALLBACK_COLORS[tmpl.id] || '#64748B'
            const isActive = tmpl.id === activeTemplateId
            const isDeleting = deletingId === tmpl.id
            return (
              <div
                key={tmpl.id}
                onClick={() => handleSelect(tmpl.id)}
                role="button"
                tabIndex={0}
                className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer group ${
                  isActive ? 'bg-primary-50' : 'hover:bg-surface-50'
                }`}
              >
                {/* Thumbnail */}
                <div className="w-[72px] h-[102px] rounded border flex-shrink-0 overflow-hidden bg-surface-100 flex items-center justify-center">
                  {thumb ? (
                    <img src={thumb} alt={tmpl.name} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-8 h-8 rounded"
                      style={{ backgroundColor: color, opacity: 0.3 }}
                    />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className={`text-xs font-medium truncate ${isActive ? 'text-primary-700' : 'text-surface-700'}`}>
                      {tmpl.name}
                    </span>
                    {isActive && <Check className="w-3 h-3 text-primary-500 flex-shrink-0" />}
                    {!tmpl.is_builtin && (
                      <button
                        onClick={(e) => handleDeleteClick(e, tmpl.id, tmpl.name)}
                        disabled={isDeleting}
                        className="ml-auto flex-shrink-0 p-1 rounded text-surface-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="删除模板"
                      >
                        {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-surface-400 mt-1 line-clamp-2 leading-relaxed">
                    {tmpl.description}
                  </p>
                </div>
              </div>
            )
          })}
          </div>
          <div className="border-t border-surface-100 p-2">
            {importError && (
              <div className="mb-2 px-2 py-1.5 rounded-md bg-red-50 text-[11px] text-red-600 leading-relaxed">
                {importError}
              </div>
            )}
            <button
              onClick={handleImport}
              disabled={importing}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md text-surface-600 hover:text-primary-700 hover:bg-primary-50 transition-colors disabled:opacity-60"
            >
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              导入模板包
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除模板"
        description={`确定要删除模板「${deleteTarget?.name}」吗？此操作不可恢复。`}
        confirmText="删除"
        danger
        loading={!!deletingId}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
