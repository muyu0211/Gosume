import { useState } from 'react'
import { useResumeStore } from '../../stores/resumeStore'
import { useAppStore } from '../../stores/appStore'
import type { Education } from '../../types/resume'
import { Plus, Trash2, ChevronDown, ChevronRight, GraduationCap, GripVertical, EyeOff } from 'lucide-react'
import { MonthPicker } from '../ui/MonthPicker'
import { VisibilityToggle } from '../ui/VisibilityToggle'
import { useDragReorder } from '../../hooks/useDragReorder'
import { useEntryTransition } from '../../hooks/useEntryTransition'
import { getSectionTitle } from '../../lib/resumeSections'
import { HighlightsBlock } from './HighlightsBlock'
import { useT } from '../../lib/i18n'

export function EducationSection() {
  const t = useT()
  const language = useAppStore((s) => s.language)
  const items = useResumeStore((s) => s.resume?.education) || []
  const { listRef, deleteEntry } = useEntryTransition(items, (idx) => requestDelete('education', idx))
  const addItem = useResumeStore((s) => s.addEducation)
  const updateItem = useResumeStore((s) => s.updateEducation)
  const requestDelete = useResumeStore((s) => s.requestItemDelete)
  const requestHighlightDelete = useResumeStore((s) => s.requestHighlightDelete)
  const moveItem = useResumeStore((s) => s.moveEducation)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  const { draggedIdx, overIdx, onDragStart, onDragOver, onDrop, onDragEnd } = useDragReorder(moveItem)

  const toggle = (idx: number) => setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }))

  return (
    <div className="form-section">
      <div className="form-section-header">
        <div className="flex items-center gap-2">
          <GraduationCap className="size-icon-md text-primary-600" />
          <span className="form-section-title">{getSectionTitle('education', language)}</span>
          <span className="text-xs text-surface-400">({items.length})</span>
        </div>
        <button onClick={() => { addItem(); setExpanded({[items.length]: true}) }} className="btn-primary btn-xs">
          <Plus className="w-3 h-3" />
          {t('add')}
        </button>
      </div>

      <div ref={listRef} className="space-y-2">
        {items.map((edu, idx) => {
          const isExpanded = expanded[idx] ?? (idx === items.length - 1 && items.length <= 2)
          const isHidden = !!edu.hidden

          return (
            <div
              key={edu.id}
              data-del-key={`item:education:${idx}`}
              className={`glass-entry overflow-hidden transition-colors ${
                overIdx === idx && draggedIdx !== idx ? 'glass-entry-dragover' : ''
              } ${draggedIdx === idx ? 'opacity-40' : ''} ${isHidden ? 'opacity-60' : ''}`}
              onDragOver={(e) => onDragOver(e, idx)}
              onDrop={() => onDrop(idx)}
            >
              <div className="flex items-center gap-2 px-3 py-2 hover:bg-surface-50 cursor-pointer" onClick={() => toggle(idx)}>
                <div
                  draggable
                  onDragStart={() => onDragStart(idx)}
                  onDragEnd={onDragEnd}
                  className={`cursor-grab active:cursor-grabbing p-0.5 -ml-0.5 rounded hover:bg-surface-200 transition-colors ${draggedIdx === idx ? 'text-primary-500' : 'text-surface-300'}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical className="size-icon-sm" />
                </div>
                {isExpanded ? <ChevronDown className="size-icon-md text-surface-400" /> : <ChevronRight className="size-icon-md text-surface-400" />}
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-medium truncate ${isHidden ? 'text-surface-400 line-through' : 'text-surface-700'}`}>
                    {edu.school || t('unnamedSchool')}
                  </span>
                  {edu.major && <span className="text-xs text-surface-400 ml-2">{edu.major}</span>}
                  {isHidden && (
                    <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-surface-500 bg-surface-200 rounded">
                      <EyeOff className="w-2.5 h-2.5" />
                      {t('hidden')}
                    </span>
                  )}
                </div>
                <VisibilityToggle
                  hidden={isHidden}
                  onToggle={() => updateItem(idx, { hidden: !isHidden })}
                />
                <button onClick={(e) => { e.stopPropagation(); deleteEntry(idx, e) }} className="p-1 text-danger-500 hover:bg-danger-100 hover:text-danger-600 rounded-md transition-colors">
                  <Trash2 className="size-icon-sm" />
                </button>
              </div>

              <div className={`collapse-wrap ${isExpanded ? 'open' : ''}`}>
                <div className="collapse-inner">
                  <div className="collapse-content px-3 pb-3 pt-1 border-t border-surface-100 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="form-label">{t('school')}</label>
                      <input className="form-input" value={edu.school || ''} onChange={(e) => updateItem(idx, { school: e.target.value })} placeholder={t('schoolPlaceholder')} maxLength={100} />
                    </div>
                    <div>
                      <label className="form-label">{t('degree')}</label>
                      <input className="form-input" value={edu.degree || ''} onChange={(e) => updateItem(idx, { degree: e.target.value })} placeholder={t('degreePlaceholder')} maxLength={50} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="form-label">{t('major')}</label>
                      <input className="form-input" value={edu.major || ''} onChange={(e) => updateItem(idx, { major: e.target.value })} placeholder={t('majorPlaceholder')} maxLength={100} />
                    </div>
                    <div>
                      <label className="form-label">{t('minor')}</label>
                      <input className="form-input" value={edu.minor || ''} onChange={(e) => updateItem(idx, { minor: e.target.value })} placeholder={t('minorPlaceholder')} maxLength={100} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="form-label">{t('startDate')}</label>
                      <MonthPicker value={edu.start_date || ''} onChange={(v) => updateItem(idx, { start_date: v })} placeholder={t('startDatePlaceholder')} />
                    </div>
                    <div>
                      <label className="form-label">{t('endDate')}</label>
                      <MonthPicker value={edu.end_date || ''} onChange={(v) => updateItem(idx, { end_date: v })} placeholder={t('endDatePlaceholder')} showPresent minValue={edu.start_date || undefined} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="form-label">GPA</label>
                      <input className="form-input" value={edu.gpa || ''} onChange={(e) => updateItem(idx, { gpa: e.target.value })} placeholder="3.8/4.0" maxLength={20} />
                    </div>
                    <div>
                      <label className="form-label">{t('coreCourses')}</label>
                      <input className="form-input" value={edu.courses || ''} onChange={(e) => updateItem(idx, { courses: e.target.value })} placeholder={t('coreCoursesPlaceholder')} maxLength={500} />
                    </div>
                  </div>

                  <div>
                    <HighlightsBlock
                      label={t('schoolHighlights')}
                      highlights={edu.highlights || []}
                      onChange={(highlights) => updateItem(idx, { highlights })}
                      onRequestRemove={(subIdx) => requestHighlightDelete('education', idx, subIdx)}
                      delKeyPrefix={`highlight:education:${idx}`}
                      context={[edu.school, edu.major, edu.degree].filter(Boolean).join(' · ')}
                    />
                  </div>
                </div>
                </div>
              </div>
            </div>
          )
        })}

        {items.length === 0 && (
          <div className="text-center py-6 text-sm text-surface-400">
            {t('emptyClickAdd')}
          </div>
        )}
      </div>
    </div>
  )
}

