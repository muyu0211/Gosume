import { useState, useCallback, useRef, useEffect } from 'react'
import { useTemplateStore } from '../../stores/templateStore'
import { useResumeStore } from '../../stores/resumeStore'
import { Palette, Check, ChevronDown } from 'lucide-react'

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
  const setActiveTemplate = useTemplateStore((s) => s.setActiveTemplate)
  const updateField = useResumeStore((s) => s.updateField)

  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const activeTemplate = templates.find((t) => t.id === activeTemplateId)
  const activeColor = activeTemplate?.colors?.primary
    || FALLBACK_COLORS[activeTemplateId || '']
    || '#2563EB'

  const handleSelect = useCallback((id: string) => {
    setActiveTemplate(id)
    updateField('meta.template_id', id)
    setOpen(false)
  }, [setActiveTemplate, updateField])

  // Sort so active template appears first in list
  const sorted = [...templates].sort((a, b) => {
    if (a.id === activeTemplateId) return -1
    if (b.id === activeTemplateId) return 1
    return 0
  })

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 h-8 px-2 text-xs rounded-md hover:bg-slate-100 transition-colors text-slate-600"
      >
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: activeColor }}
        />
        <span className="max-w-[80px] truncate">{activeTemplate?.name || '模板'}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg border border-slate-200 shadow-lg z-50 py-1">
          <div className="px-3 py-1.5 text-[11px] text-slate-400 flex items-center gap-1.5">
            <Palette className="w-3 h-3" />
            切换模板
          </div>
          {sorted.map((tmpl) => {
            const color = tmpl.colors?.primary || FALLBACK_COLORS[tmpl.id] || '#64748B'
            const isActive = tmpl.id === activeTemplateId
            return (
              <button
                key={tmpl.id}
                onClick={() => handleSelect(tmpl.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  isActive ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="flex-1 truncate">{tmpl.name}</span>
                {isActive && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
