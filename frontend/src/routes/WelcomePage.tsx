import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTemplateStore } from '../stores/templateStore'
import { useResumeStore } from '../stores/resumeStore'
import { FileText, FolderOpen, Plus, Clock, ArrowRight, Sparkles, Settings, List, Upload, Loader2 } from 'lucide-react'
import { ResumeListDrawer } from '../components/resume/ResumeListDrawer'
import { AnimatedPage } from '../components/ui/AnimatedPage'
import { importTemplatePackage, loadTemplateMetas, loadTemplateContent } from '../services/templateService'
import { renderTemplate } from '../lib/template-engine'
import { extractErrorMessage } from '../lib/error-utils'
import { createSampleResume } from '../services/sampleData'
import { callService } from '../services/backend'
import { generateAllThumbnails } from '../services/thumbnailService'
import type { TemplateMeta } from '../types/template'
import type { ResumeListItem } from '../types/resume'

export function WelcomePage() {
  const navigate = useNavigate()
  const [recentFiles, setRecentFiles] = useState<ResumeListItem[]>([])
  const [showDrawer, setShowDrawer] = useState(false)
  const [previewHtmls, setPreviewHtmls] = useState<Record<string, string>>({})
  const [importingTemplate, setImportingTemplate] = useState(false)
  const [importError, setImportError] = useState('')
  const templates = useTemplateStore((s) => s.templates)
  const setTemplates = useTemplateStore((s) => s.setTemplates)
  const setActiveTemplate = useTemplateStore((s) => s.setActiveTemplate)
  const setThumbnails = useTemplateStore((s) => s.setThumbnails)
  const newResume = useResumeStore((s) => s.newResume)
  const loadResume = useResumeStore((s) => s.loadResume)
  const setResumeList = useResumeStore((s) => s.setResumeList)
  const setResume = useResumeStore((s) => s.setResume)
  const clearResume = useResumeStore((s) => s.clearResume)

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
          let html = renderTemplate(tmpl, sampleResume)
          html = html.replace('<head>', '<head><style>html,body{overflow:hidden;margin:0;}</style>')
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

  const handleOpenRecent = async (id: string) => {
    clearResume()
    const resume = await loadResume(id)
    if (resume && resume.meta?.template_id) {
      setActiveTemplate(resume.meta.template_id)
    }
    navigate('/editor')
  }

  const handleOpenFile = async () => {
    clearResume()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await callService('FileService', 'OpenProject')
      if (data?.meta) {
        setResume(data)
        setActiveTemplate(data.meta.template_id || '')
        navigate('/editor')
      }
    } catch (err) {
      console.error('Open file failed:', err)
    }
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
            title="导入 .gosume-template 模板包"
          >
            {importingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            导入模板
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="btn-ghost btn-sm"
            title="设置"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowDrawer(true)}
            className="btn-secondary btn-sm"
          >
            <List className="w-4 h-4" />
            全部简历
          </button>
          <button
            onClick={handleOpenFile}
            className="btn-secondary btn-sm"
          >
            <FolderOpen className="w-4 h-4" />
            打开文件
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

      {/* Main Content */}
      <main className="flex-1 overflow-auto px-8 pb-8">
        {/* Template Selection */}
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-5">
            <h2 className="text-sm font-semibold text-surface-400 uppercase tracking-wider">
              选择模板开始创建
            </h2>
            <div className="flex-1 h-px bg-surface-200" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {templates.map((tmpl) => (
              <TemplateCard
                key={tmpl.id}
                template={tmpl}
                previewHtml={previewHtmls[tmpl.id]}
                onSelect={() => handleNewResume(tmpl.id)}
              />
            ))}
          </div>
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
          Gosume v0.1 — 专注于内容，让简历排版变得简单
        </p>
      </footer>

      <ResumeListDrawer
        open={showDrawer}
        onClose={() => setShowDrawer(false)}
        onOpenResume={handleOpenFromDrawer}
      />
    </AnimatedPage>
  )
}

function TemplateCard({ template, previewHtml, onSelect }: { template: TemplateMeta; previewHtml?: string; onSelect: () => void }) {
  const IFRAME_W = 800
  const IFRAME_H = IFRAME_W * (297 / 210)

  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.16)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      if (w > 0) setScale(w / IFRAME_W)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      onClick={onSelect}
      className="group cursor-pointer rounded-xl border border-surface-200 bg-white overflow-hidden hover:shadow-md hover:border-primary-300 transition-all duration-200 hover:-translate-y-0.5"
    >
      {/* Preview area */}
      <div ref={containerRef} className="aspect-[210/297] relative overflow-hidden bg-surface-100">
        {previewHtml ? (
          <iframe
            srcDoc={previewHtml}
            className="absolute border-0 pointer-events-none"
            style={{
              width: IFRAME_W,
              height: IFRAME_H,
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
