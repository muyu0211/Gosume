import { useCallback } from 'react'
import { useTemplateStore } from '../../stores/templateStore'
import { useResumeStore } from '../../stores/resumeStore'
import { Palette, Check } from 'lucide-react'
import type { TemplateMeta } from '../../types/template'

interface Props {
  onTemplateChange?: (templateId: string) => void
}

export function TemplateSelector({ onTemplateChange }: Props) {
  const templates = useTemplateStore((s) => s.templates)
  const activeTemplateId = useTemplateStore((s) => s.activeTemplateId)
  const setActiveTemplate = useTemplateStore((s) => s.setActiveTemplate)
  const updateField = useResumeStore((s) => s.updateField)

  const handleSelect = useCallback((id: string) => {
    setActiveTemplate(id)
    updateField('meta.template_id', id)
    onTemplateChange?.(id)
  }, [setActiveTemplate, updateField, onTemplateChange])

  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-3">
        <Palette className="w-4 h-4 text-primary-600" />
        <span className="text-sm font-semibold text-surface-700">模板选择</span>
      </div>
      <div className="space-y-2">
        {templates.map((tmpl) => (
          <TemplateCard
            key={tmpl.id}
            template={tmpl}
            isActive={tmpl.id === activeTemplateId}
            onSelect={() => handleSelect(tmpl.id)}
          />
        ))}
      </div>
    </div>
  )
}

function TemplateCard({ template, isActive, onSelect }: { template: TemplateMeta; isActive: boolean; onSelect: () => void }) {
  const colors = template.colors || { primary: '#2563EB', secondary: '#1E40AF', text: '#1F2937', background: '#FFFFFF', accent: '#DBEAFE' }

  return (
    <div
      onClick={onSelect}
      className={`relative cursor-pointer rounded-lg border-2 p-3 transition-all ${
        isActive ? 'border-primary-500 bg-primary-50/50' : 'border-surface-200 hover:border-surface-300 bg-elev'
      }`}
    >
      {isActive && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}
      <div className="flex gap-3">
        {/* Mini preview */}
        <div className="w-14 h-20 rounded border border-surface-200 overflow-hidden flex-shrink-0" style={{ background: colors.background }}>
          <div className="p-1.5 scale-[0.55] origin-top-left w-[180%]">
            <div className="h-0.5 w-8 rounded mb-1" style={{ background: colors.primary }} />
            <div className="h-0.5 w-12 rounded mb-0.5 bg-surface-200" />
            <div className="h-0.5 w-10 rounded mb-0.5 bg-surface-200" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-surface-800">{template.name}</h4>
          <p className="text-[11px] text-surface-400 mt-0.5 line-clamp-2">{template.description}</p>
        </div>
      </div>
      {/* Color dots */}
      {colors && (
        <div className="flex gap-1 mt-2">
          <div className="w-3 h-3 rounded-full border border-surface-200" style={{ background: colors.primary }} title="主色" />
          <div className="w-3 h-3 rounded-full border border-surface-200" style={{ background: colors.secondary }} title="辅色" />
          <div className="w-3 h-3 rounded-full border border-surface-200" style={{ background: colors.text }} title="文字色" />
          <div className="w-3 h-3 rounded-full border border-surface-200" style={{ background: colors.accent }} title="强调色" />
        </div>
      )}
    </div>
  )
}
