import { useState, useCallback, useRef, useEffect } from 'react'
import { useTemplateStore } from '../../stores/templateStore'
import { useResumeStore } from '../../stores/resumeStore'
import { getCachedThumbnails } from '../../services/thumbnailService'
import { Check, ChevronDown, Layout } from 'lucide-react'

const FALLBACK_COLORS: Record<string, string> = {
  modern: '#2563EB',
  classic: '#1F2937',
  minimal: '#334155',
  creative: '#6366F1',
  executive: '#C8A45C',
  compact: '#0F766E',
}

export function TemplateSwitcher() {
  const templates = useTemplateStore((s) => s.templates)
  const activeTemplateId = useTemplateStore((s) => s.activeTemplateId)
  const thumbnails = useTemplateStore((s) => s.thumbnails)
  const setActiveTemplate = useTemplateStore((s) => s.setActiveTemplate)
  const updateField = useResumeStore((s) => s.updateField)

  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)
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

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => open ? close() : setOpen(true)}
        className="flex items-center gap-1.5 h-8 px-2 text-xs rounded-md hover:bg-slate-100 transition-colors text-slate-600"
      >
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: activeColor }}
        />
        <span className="max-w-[80px] truncate">{activeTemplate?.name || '模板'}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {visible && (
        <div className={`absolute right-0 top-full mt-1 w-72 bg-white rounded-lg border border-slate-200 shadow-lg z-50 ${open ? 'animate-dropdown-enter' : 'animate-dropdown-exit'}`}>
          <div className="px-3 py-1.5 text-[11px] text-slate-400 flex items-center gap-1.5 border-b border-slate-100">
            <Layout className="w-3 h-3" />
            切换模板风格
          </div>
          <div className="max-h-[380px] overflow-y-auto py-1">
          {templates.map((tmpl) => {
            const thumb = thumbnails[tmpl.id]
            const color = tmpl.colors?.primary || FALLBACK_COLORS[tmpl.id] || '#64748B'
            const isActive = tmpl.id === activeTemplateId
            return (
              <button
                key={tmpl.id}
                onClick={() => handleSelect(tmpl.id)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors ${
                  isActive ? 'bg-primary-50' : 'hover:bg-slate-50'
                }`}
              >
                {/* Thumbnail */}
                <div className="w-[72px] h-[102px] rounded border flex-shrink-0 overflow-hidden bg-slate-100 flex items-center justify-center">
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
                    <span className={`text-xs font-medium truncate ${isActive ? 'text-primary-700' : 'text-slate-700'}`}>
                      {tmpl.name}
                    </span>
                    {isActive && <Check className="w-3 h-3 text-primary-500 flex-shrink-0" />}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {tmpl.description}
                  </p>
                </div>
              </button>
            )
          })}
          </div>
        </div>
      )}
    </div>
  )
}
