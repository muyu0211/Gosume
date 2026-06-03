import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTemplateStore } from '../stores/templateStore'
import { useResumeStore } from '../stores/resumeStore'
import { FileText, FolderOpen, Plus, Clock, ArrowRight, Sparkles, Settings, List } from 'lucide-react'
import { ResumeListDrawer } from '../components/resume/ResumeListDrawer'
import { AnimatedPage } from '../components/ui/AnimatedPage'
import { loadTemplateMetas, loadTemplateContent } from '../services/templateService'
import { renderTemplate } from '../lib/template-engine'
import { createSampleResume } from '../services/sampleData'
import { callService } from '../services/backend'
import type { TemplateMeta } from '../types/template'
import type { ResumeListItem } from '../types/resume'

export function WelcomePage() {
  const navigate = useNavigate()
  const [recentFiles, setRecentFiles] = useState<ResumeListItem[]>([])
  const [showDrawer, setShowDrawer] = useState(false)
  const [previewHtmls, setPreviewHtmls] = useState<Record<string, string>>({})
  const templates = useTemplateStore((s) => s.templates)
  const setTemplates = useTemplateStore((s) => s.setTemplates)
  const setActiveTemplate = useTemplateStore((s) => s.setActiveTemplate)
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

  return (
    <AnimatedPage className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Gosume</h1>
            <p className="text-xs text-slate-400">桌面级简历制作工具</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
            className="btn-secondary text-sm"
          >
            <FolderOpen className="w-4 h-4" />
            打开文件
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto px-8 pb-8">
        {/* Template Selection */}
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
            选择模板开始创建
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
              最近打开
            </h2>
            <div className="space-y-2 max-w-lg">
              {recentFiles.slice(0, 3).map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-white border border-slate-200 hover:border-primary-300 cursor-pointer transition-colors"
                  onClick={() => handleOpenRecent(file.id)}
                >
                  <Clock className="w-4 h-4 text-slate-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(file.updated_at).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300" />
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="px-8 py-3 border-t border-slate-200 text-center">
        <p className="text-xs text-slate-400">
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
      className="group cursor-pointer rounded-xl border border-slate-200 bg-white overflow-hidden hover:shadow-lg hover:border-primary-300 transition-all"
    >
      {/* Preview area */}
      <div ref={containerRef} className="aspect-[210/297] relative overflow-hidden bg-white">
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
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
            <div className="animate-pulse w-8 h-8 rounded-full border-2 border-slate-200 border-t-slate-400" />
          </div>
        )}
      </div>
      {/* Meta info */}
      <div className="p-3 border-t border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">{template.name}</h3>
        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{template.description}</p>
        <div className="flex gap-1.5 mt-2">
          {template.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 text-[10px] rounded-full bg-slate-100 text-slate-500">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
