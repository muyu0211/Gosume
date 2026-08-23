import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTemplateStore } from '../stores/templateStore'
import { useResumeStore } from '../stores/resumeStore'
import { Clock, ArrowRight, Sparkles, Settings, List, Upload, FileUp, Loader2, ChevronLeft, ChevronRight, Eye, Trash2, CheckCircle2 } from 'lucide-react'
import { ResumeListDrawer } from '../components/resume/ResumeListDrawer'
import { ImportPreviewDialog } from '../components/resume/ImportPreviewDialog'
import { AnimatedPage } from '../components/ui/AnimatedPage'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { importTemplatePackage, loadTemplateMetas, loadTemplateContent, deleteTemplate } from '../services/templateService'
import { renderTemplate } from '../lib/templateEngine'
import { resolvePaper } from '../lib/paper'
import { extractErrorMessage } from '../lib/errorUtils'
import { createSampleResume } from '../services/sampleData'
import { callService } from '../services/backend'
import { generateAllThumbnails } from '../services/thumbnailService'
import type { TemplateMeta } from '../types/template'
import type { ResumeListItem } from '../types/resume'
import type { FileParseResult, FileImportResponse } from '../types/gosume_file'
import { migratePersonalSummary } from '../types/resume'

export function WelcomePage() {
  const navigate = useNavigate()
  const [recentFiles, setRecentFiles] = useState<ResumeListItem[]>([])
  const [showDrawer, setShowDrawer] = useState(false)
  const [previewHtmls, setPreviewHtmls] = useState<Record<string, string>>({})
  const [importingTemplate, setImportingTemplate] = useState(false)
  const [importError, setImportError] = useState('')
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  // 中间态导入（.gosume）
  const [importingGosume, setImportingGosume] = useState(false)
  const [importPreview, setImportPreview] = useState<FileParseResult | null>(null)
  const [importSuccess, setImportSuccess] = useState('')
  const PAGE_SIZE = 8
  const templates = useTemplateStore((s) => s.templates)
  const setTemplates = useTemplateStore((s) => s.setTemplates)
  const setActiveTemplate = useTemplateStore((s) => s.setActiveTemplate)
  const setThumbnails = useTemplateStore((s) => s.setThumbnails)
  const newResume = useResumeStore((s) => s.newResume)
  const loadResume = useResumeStore((s) => s.loadResume)
  const setResumeList = useResumeStore((s) => s.setResumeList)
  const setResume = useResumeStore((s) => s.setResume)
  const clearResume = useResumeStore((s) => s.clearResume)

  const totalPages = Math.max(1, Math.ceil(templates.length / PAGE_SIZE))
  const paginatedTemplates = templates.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [templates.length])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const metas = await loadTemplateMetas()
      setTemplates(metas)

      const previews: Record<string, string> = {}
      for (const meta of metas) {
        try {
          const tmpl = await loadTemplateContent(meta.id)
          const sampleResume = createSampleResume(meta.id)
          // Prevent scrollbars in the fixed-size iframe without affecting the
          // template's CSS layout. The card's paper aspect-ratio + overflow-hidden
          // naturally clips to the first page, matching the EditorPage rendering.
          const html = renderTemplate(tmpl, sampleResume)
            .replace('<head>', '<head><style>html{overflow:hidden}</style>')
          previews[meta.id] = html
        } catch {
          previews[meta.id] = ''
        }
      }
      setPreviewHtmls(previews)

      // Generate thumbnails in background (uses cache after first run)
      const ids = metas.map((m) => m.id)
      generateAllThumbnails(ids).then((thumbs) => setThumbnails(thumbs))
    } catch {
      // Fallback handled by loadTemplateMetas
    }

    try {
      const list = await callService<ResumeListItem[]>('ResumeService', 'ListResumes')
      if (list) {
        setResumeList(list)
        setRecentFiles(list)
      }
    } catch { /* empty list */ }
  }

  const handleNewResume = async (templateId: string) => {
    clearResume()
    setActiveTemplate(templateId)
    await newResume(templateId)
    navigate('/editor')
  }

  const handlePreviewWithSample = async (templateId: string) => {
    clearResume()
    setActiveTemplate(templateId)
    const sampleResume = createSampleResume(templateId)
    try {
      await callService('ResumeService', 'InitResume', sampleResume)
      setResume(sampleResume)
      navigate('/editor')
    } catch (err) {
      console.error('InitResume failed:', err)
      // 失败时仍进入编辑器（内存态可用），后续保存会重新创建记录
      setResume(sampleResume)
      navigate('/editor')
    }
  }

  const handleOpenRecent = async (id: string) => {
    clearResume()
    const resume = await loadResume(id)
    if (resume && resume.meta?.template_id) {
      setActiveTemplate(resume.meta.template_id)
    }
    navigate('/editor')
  }

  const handleOpenFromDrawer = async (id: string) => {
    setShowDrawer(false)
    clearResume()
    const resume = await loadResume(id)
    if (resume && resume.meta?.template_id) {
      setActiveTemplate(resume.meta.template_id)
    }
    navigate('/editor')
  }

  const handleImportTemplate = async () => {
    setImportingTemplate(true)
    setImportError('')
    try {
      const result = await importTemplatePackage()
      if (result) {
        setActiveTemplate(result.id)
        await loadData()
      }
    } catch (err) {
      console.error('Import template failed:', err)
      setImportError(extractErrorMessage(err, '模板导入失败，请检查模板包格式'))
    } finally {
      setImportingTemplate(false)
    }
  }

  // 中间态导入第一步：选择文件 → 后端解析校验 → 返回预览数据（未落库）
  const handleImportGosume = async () => {
    setImportingGosume(true)
    setImportSuccess('')
    try {
      const result = await callService<FileParseResult>('FileService', 'ParseFile')
      if (!result?.resume) return // 用户取消，静默关闭
      setImportPreview(result)
    } catch (err) {
      console.error('Parse gosume file failed:', err)
      setImportError(extractErrorMessage(err, '导入失败，请检查文件'))
    } finally {
      setImportingGosume(false)
    }
  }

  // 中间态导入第二步：预览确认后执行导入（新建/覆盖均进入编辑器）
  const handleImported = async (result: FileImportResponse, finalTemplateId: string) => {
    const resume = importPreview?.resume
    setImportPreview(null)

    if (result.mode === 'overwrite') {
      setImportSuccess('已覆盖导入')
      // 刷新简历列表（覆盖改变了 name/updated_at）
      try {
        const list = await callService<ResumeListItem[]>('ResumeService', 'ListResumes')
        if (list) {
          setResumeList(list)
          setRecentFiles(list)
        }
      } catch { /* 忽略，列表随下次加载刷新 */ }
      // 覆盖后直接进入编辑页继续编辑（与打开简历一致的加载流程）
      clearResume()
      const loaded = await loadResume(result.id)
      if (loaded && loaded.meta?.template_id) {
        setActiveTemplate(loaded.meta.template_id)
      }
      navigate('/editor')
      return
    }

    // 新建：用导入数据进入编辑器
    if (!resume) return
    clearResume()
    setActiveTemplate(finalTemplateId)
    // 兼容历史数据：早期顶层 summary 字段迁移到 personal_summary 结构
    setResume(migratePersonalSummary(resume))
    navigate('/editor')
  }

  const handleDeleteTemplate = (id: string, name: string) => {
    setDeleteTarget({ id, name })
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    const { id } = deleteTarget
    setDeletingTemplateId(id)
    setImportError('')
    try {
      await deleteTemplate(id)
      await loadData()
    } catch (err) {
      console.error('Delete template failed:', err)
      setImportError(extractErrorMessage(err, '模板删除失败'))
    } finally {
      setDeletingTemplateId(null)
      setDeleteTarget(null)
    }
  }

  return (
    <AnimatedPage className="h-full flex flex-col bg-surface-50">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center shadow-sm shadow-primary-600/25">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-800 tracking-tight">Gosume</h1>
            <p className="text-xs text-surface-400 mt-0.5">桌面级简历制作工具</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleImportTemplate}
            disabled={importingTemplate}
            className="btn-secondary btn-sm"
            title="导入 .zip 模板包"
          >
            {importingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            导入模板
          </button>
          <button
            onClick={handleImportGosume}
            disabled={importingGosume}
            className="btn-secondary btn-sm"
            title="导入可编辑简历文件 (.gosume)"
          >
            {importingGosume ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            导入简历
          </button>
          <button
            onClick={() => setShowDrawer(true)}
            className="btn-secondary btn-sm"
          >
            <List className="w-4 h-4" />
            全部简历
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="btn-ghost btn-sm"
            title="设置"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {importError && (
        <div className="mx-8 mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{importError}</span>
          <button onClick={() => setImportError('')} className="text-red-500 hover:text-red-700 text-xs font-medium">
            关闭
          </button>
        </div>
      )}

      {importSuccess && (
        <div className="mx-8 mb-4 px-4 py-3 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-700 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {importSuccess}
          </span>
          <button onClick={() => setImportSuccess('')} className="text-emerald-500 hover:text-emerald-700 text-xs font-medium">
            关闭
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto px-8 pb-8 mr-1">
        {/* Template Selection */}
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-5">
            <h2 className="text-sm font-semibold text-surface-400 uppercase tracking-wider">
              选择模板开始创建
            </h2>
            <div className="flex-1 h-px bg-surface-200" />
          </div>
          <div className="grid grid-cols-4 gap-5" key={currentPage}>
            {paginatedTemplates.map((tmpl, i) => (
              <TemplateCard
                key={tmpl.id}
                template={tmpl}
                previewHtml={previewHtmls[tmpl.id]}
                onSelect={() => handleNewResume(tmpl.id)}
                onPreview={() => handlePreviewWithSample(tmpl.id)}
                onDelete={!tmpl.is_builtin ? () => handleDeleteTemplate(tmpl.id, tmpl.name) : undefined}
                isDeleting={deletingTemplateId === tmpl.id}
                index={i}
              />
            ))}
          </div>
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          )}
        </section>

        {/* Recent Files */}
        {recentFiles.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <h2 className="text-sm font-semibold text-surface-400 uppercase tracking-wider">
                最近打开
              </h2>
              <div className="flex-1 h-px bg-surface-200" />
            </div>
            <div className="space-y-1.5 max-w-lg">
              {recentFiles.slice(0, 3).map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3.5 px-4 py-3 rounded-xl bg-white border border-surface-100 hover:border-surface-200 hover:shadow-sm cursor-pointer transition-all duration-150 group"
                  onClick={() => handleOpenRecent(file.id)}
                >
                  <div className="w-9 h-9 rounded-lg bg-surface-100 flex items-center justify-center group-hover:bg-primary-50 transition-colors">
                    <Clock className="w-4 h-4 text-surface-400 group-hover:text-primary-500 transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-700 truncate">{file.name}</p>
                    <p className="text-xs text-surface-400 mt-0.5">
                      {new Date(file.updated_at).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-surface-300 group-hover:text-primary-400 group-hover:translate-x-0.5 transition-all" />
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="px-8 py-4 border-t border-surface-100 text-center">
        <p className="text-xs text-surface-400">
          Gosume v1.0.0 — 专注于内容，让简历排版变得简单
        </p>
      </footer>

      <ResumeListDrawer
        open={showDrawer}
        onClose={() => setShowDrawer(false)}
        onOpenResume={handleOpenFromDrawer}
      />

      {importPreview && (
        <ImportPreviewDialog
          preview={importPreview}
          onClose={() => setImportPreview(null)}
          onImported={handleImported}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除模板"
        description={`确定要删除模板「${deleteTarget?.name}」吗？此操作不可恢复。`}
        confirmText="删除"
        danger
        loading={!!deletingTemplateId}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </AnimatedPage>
  )
}

function Pagination({ currentPage, totalPages, onPageChange }: {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-surface-400 hover:text-surface-600 hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="上一页"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
        <button
          key={page}
          onClick={() => onPageChange(page)}
          className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
            page === currentPage
              ? 'bg-primary-600 text-white shadow-sm'
              : 'text-surface-500 hover:text-surface-700 hover:bg-surface-100'
          }`}
        >
          {page}
        </button>
      ))}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-surface-400 hover:text-surface-600 hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="下一页"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

function TemplateCard({ template, previewHtml, onSelect, onPreview, onDelete, isDeleting = false, index = 0 }: { template: TemplateMeta; previewHtml?: string; onSelect: () => void; onPreview: () => void; onDelete?: () => void; isDeleting?: boolean; index?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.16)
  const [isHovered, setIsHovered] = useState(false)
  const paper = useMemo(
    () => resolvePaper(template.paper_size, template.orientations?.[0]),
    [template.paper_size, template.orientations],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      if (w > 0) setScale(w / paper.pxW)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [paper.pxW])

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group cursor-pointer rounded-xl border border-surface-200 bg-white overflow-hidden hover:shadow-md hover:border-primary-300 transition-all duration-200 hover:-translate-y-0.5 animate-card-enter"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Preview area */}
      <div ref={containerRef} className="relative overflow-hidden bg-surface-100" style={{ aspectRatio: `${paper.mmW} / ${paper.mmH}` }}>
        {previewHtml ? (
          <iframe
            srcDoc={previewHtml}
            className="absolute border-0 pointer-events-none"
            style={{
              width: paper.pxW,
              height: paper.pxH,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            title={template.name}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-surface-200 border-t-surface-400 animate-spin" />
          </div>
        )}

        {/* Hover blur overlay + preview button — slides in from right */}
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-center transition-transform duration-300 ease-out"
          style={{
            width: '33.333%',
            transform: isHovered ? 'translateX(0)' : 'translateX(100%)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Gaussian blur backdrop */}
          <div
            className="absolute inset-0"
            style={{
              backdropFilter: 'blur(12px) saturate(1.2)',
              WebkitBackdropFilter: 'blur(12px) saturate(1.2)',
              background: 'rgba(255,255,255,0.25)',
            }}
          />
          {/* Preview + delete buttons on top of blur */}
          <div className="relative z-10 flex flex-col items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onPreview() }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50/95 text-surface-800 text-sm font-medium border border-white shadow-md hover:bg-amber-50 hover:border-surface-100 hover:shadow-lg active:scale-95 transition-all duration-150 backdrop-blur-sm"
            >
              <Eye className="w-4 h-4" />
              预览
            </button>
            {!template.is_builtin && onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50/95 text-red-600 text-sm font-medium border border-white shadow-md hover:bg-red-50 hover:border-red-100 hover:shadow-lg active:scale-95 transition-all duration-150 backdrop-blur-sm disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                删除
              </button>
            )}
          </div>
        </div>
      </div>
      {/* Meta info */}
      <div className="p-3.5 border-t border-surface-100">
        <h3 className="text-sm font-semibold text-surface-800">{template.name}</h3>
        <p className="text-xs text-surface-400 mt-0.5 line-clamp-2">{template.description}</p>
        <div className="flex gap-1.5 mt-2.5">
          {template.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="px-2 py-0.5 text-[10px] rounded-full bg-surface-100 text-surface-500 font-medium">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
