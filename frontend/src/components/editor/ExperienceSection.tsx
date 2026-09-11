import { useState } from 'react'
import { useResumeStore } from '../../stores/resumeStore'
import type { Job, Project, Internship } from '../../types/resume'
import { Plus, Trash2, ChevronDown, ChevronRight, Briefcase, FolderGit2, Building, GripVertical, EyeOff } from 'lucide-react'
import { VisibilityToggle } from '../ui/VisibilityToggle'
import { MonthPicker } from '../ui/MonthPicker'
import { RichTextField } from '../ui/RichTextField'
import { useDragReorder } from '../../hooks/useDragReorder'
import { ExtrasEditor } from './ExtrasEditor'
import { AIPolishControl } from './AIPolishControl'
import { useT } from '../../lib/i18n'

interface Props {
  type: 'jobs' | 'projects' | 'internships'
  title: string
}

type Entry = Job | Project | Internship

export function ExperienceSection({ type, title }: Props) {
  const t = useT()
  const items = useResumeStore((s) => {
    if (type === 'jobs') return s.resume?.jobs
    if (type === 'internships') return s.resume?.internships
    return s.resume?.projects
  }) as Entry[]
  const addItem = useResumeStore((s) => {
    if (type === 'jobs') return s.addJob
    if (type === 'internships') return s.addInternship
    return s.addProject
  })
  const updateItem = useResumeStore((s) => {
    if (type === 'jobs') return s.updateJob
    if (type === 'internships') return s.updateInternship
    return s.updateProject
  })
  const requestDelete = useResumeStore((s) => s.requestItemDelete)
  const requestHighlightDelete = useResumeStore((s) => s.requestHighlightDelete)
  const requestExtraDelete = useResumeStore((s) => s.requestExtraDelete)
  const moveItem = useResumeStore((s) => {
    if (type === 'jobs') return s.moveJob
    if (type === 'internships') return s.moveInternship
    return s.moveProject
  })
  const updateProjectExtras = useResumeStore((s) => s.updateProjectExtras)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const sectionKind: 'job' | 'internship' | 'project' = type === 'jobs' ? 'job' : type === 'internships' ? 'internship' : 'project'

  const { draggedIdx, overIdx, onDragStart, onDragOver, onDrop, onDragEnd } = useDragReorder(moveItem)

  const toggle = (idx: number) => setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }))

  return (
    <div className="form-section">
      <div className="form-section-header">
        <div className="flex items-center gap-2">
          {type === 'jobs' ? (
            <Briefcase className="w-4 h-4 text-primary-600" />
          ) : type === 'internships' ? (
            <Building className="w-4 h-4 text-primary-600" />
          ) : (
            <FolderGit2 className="w-4 h-4 text-primary-600" />
          )}
          <span className="form-section-title">{title}</span>
          <span className="text-xs text-surface-400">({items?.length || 0})</span>
        </div>
        <button onClick={() => { addItem(); setExpanded({[items?.length || 0]: true}) }} className="btn-primary btn-xs">
          <Plus className="w-3 h-3" />
          {t('add')}
        </button>
      </div>

      <div className="space-y-2">
        {items?.map((item, idx) => {
          const isExpanded = expanded[idx] ?? (idx === items.length - 1 && items.length <= 2)
          const isHidden = !!(item as Entry).hidden
          const name = type === 'jobs' || type === 'internships' ? (item as Job).company : (item as Project).name
          const role = type === 'jobs' || type === 'internships' ? (item as Job).title : (item as Project).role

          return (
            <div
              key={item.id}
              className={`border rounded-lg overflow-hidden transition-colors ${
                overIdx === idx && draggedIdx !== idx ? 'border-primary-400 bg-primary-50/50' : 'border-surface-200'
              } ${draggedIdx === idx ? 'opacity-40' : ''} ${isHidden ? 'opacity-60 bg-surface-50' : ''}`}
              onDragOver={(e) => onDragOver(e, idx)}
              onDrop={() => onDrop(idx)}
            >
              {/* Collapsed header */}
              <div
                className="flex items-center gap-2 px-3 py-2 hover:bg-surface-50 cursor-pointer"
                onClick={() => toggle(idx)}
              >
                <div
                  draggable
                  onDragStart={() => onDragStart(idx)}
                  onDragEnd={onDragEnd}
                  className={`cursor-grab active:cursor-grabbing p-0.5 -ml-0.5 rounded hover:bg-surface-200 transition-colors ${draggedIdx === idx ? 'text-primary-500' : 'text-surface-300'}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
                {isExpanded ? <ChevronDown className="w-4 h-4 text-surface-400" /> : <ChevronRight className="w-4 h-4 text-surface-400" />}
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-medium truncate ${isHidden ? 'text-surface-400 line-through' : 'text-surface-700'}`}>
                    {name || `${t('unnamed')}${type === 'projects' ? t('projectNoun') : t('companyNoun')}`}
                  </span>
                  {role && <span className="text-xs text-surface-400 ml-2">{role}</span>}
                  {isHidden && (
                    <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-surface-500 bg-surface-200 rounded">
                      <EyeOff className="w-2.5 h-2.5" />
                      {t('hidden')}
                    </span>
                  )}
                </div>
                <VisibilityToggle
                  hidden={isHidden}
                  onToggle={() => updateItem(idx, { hidden: !isHidden } as Partial<Entry>)}
                />
                <button
                  onClick={(e) => { e.stopPropagation(); requestDelete(type === 'jobs' ? 'job' : type === 'internships' ? 'internship' : 'project', idx) }}
                  className="p-1 text-red-500 hover:bg-red-100 hover:text-red-600 rounded-md transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Expanded form */}
              <div className={`collapse-wrap ${isExpanded ? 'open' : ''}`}>
                <div className="collapse-inner">
                  <div className="collapse-content px-3 pb-3 pt-1 border-t border-surface-100 space-y-2.5">
                  {type === 'jobs' || type === 'internships' ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="form-label">{t('company')}</label>
                          <input className="form-input" value={(item as Job).company || ''} onChange={(e) => updateItem(idx, { company: e.target.value } as Partial<Job>)} placeholder={t('companyPlaceholder')} maxLength={100} />
                        </div>
                        <div>
                          <label className="form-label">{t('position')}</label>
                          <input className="form-input" value={(item as Job).title || ''} onChange={(e) => updateItem(idx, { title: e.target.value } as Partial<Job>)} placeholder={t('positionPlaceholder')} maxLength={100} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="form-label">{t('startDate')}</label>
                          <MonthPicker value={(item as Job).start_date || ''} onChange={(v) => updateItem(idx, { start_date: v } as Partial<Job>)} placeholder={t('startDatePlaceholder')} />
                        </div>
                        <div>
                          <label className="form-label">{t('endDate')}</label>
                          <MonthPicker
                            value={(item as Job).end_date || ''}
                            onChange={(v) => updateItem(idx, { end_date: v } as Partial<Job>)}
                            placeholder={t('endDatePlaceholder')}
                            showPresent
                            minValue={(item as Job).start_date || undefined}
                            disabled={(item as Job).is_current}
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-surface-500">
                        <input
                          type="checkbox"
                          checked={(item as Job).is_current || false}
                          onChange={(e) => updateItem(idx, { is_current: e.target.checked, end_date: e.target.checked ? '' : (item as Job).end_date } as Partial<Job>)}
                          className="accent-primary-600"
                        />
                        {t('currentEmployed')}
                      </label>
                      <div>
                        <label className="form-label">{t('workLocation')}</label>
                        <input className="form-input" value={(item as Job).location || ''} onChange={(e) => updateItem(idx, { location: e.target.value } as Partial<Job>)} placeholder="北京" maxLength={100} />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="form-label mb-0">{t('workSummary')}</label>
                          <AIPolishControl text={(item as Job).summary || ''} semantic="job" onPolish={(r) => updateItem(idx, { summary: r } as Partial<Job>)} />
                        </div>
                        <RichTextField
                          value={(item as Job).summary || ''}
                          onChange={(v) => updateItem(idx, { summary: v } as Partial<Job>)}
                          placeholder={t('workSummaryPlaceholder')}
                          maxLength={500}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="form-label">{t('projectName')}</label>
                          <input className="form-input" value={(item as Project).name || ''} onChange={(e) => updateItem(idx, { name: e.target.value } as Partial<Project>)} placeholder={t('projectNamePlaceholder')} maxLength={100} />
                        </div>
                        <div>
                          <label className="form-label">{t('role')}</label>
                          <input className="form-input" value={(item as Project).role || ''} onChange={(e) => updateItem(idx, { role: e.target.value } as Partial<Project>)} placeholder={t('rolePlaceholder')} maxLength={100} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="form-label">{t('startDate')}</label>
                          <MonthPicker value={(item as Project).start_date || ''} onChange={(v) => updateItem(idx, { start_date: v } as Partial<Project>)} placeholder={t('startDatePlaceholder')} />
                        </div>
                        <div>
                          <label className="form-label">{t('endDate')}</label>
                          <MonthPicker
                            value={(item as Project).end_date || ''}
                            onChange={(v) => updateItem(idx, { end_date: v } as Partial<Project>)}
                            placeholder={t('endDatePlaceholder')}
                            showPresent
                            minValue={(item as Project).start_date || undefined}
                            disabled={(item as Project).is_current || false}
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-surface-500">
                        <input
                          type="checkbox"
                          checked={(item as Project).is_current || false}
                          onChange={(e) => updateItem(idx, { is_current: e.target.checked, end_date: e.target.checked ? '' : (item as Project).end_date } as Partial<Project>)}
                          className="accent-primary-600"
                        />
                        {t('currentProject')}
                      </label>
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="form-label mb-0">{t('projectSummary')}</label>
                          <AIPolishControl text={(item as Project).summary || ''} semantic="project" onPolish={(r) => updateItem(idx, { summary: r } as Partial<Project>)} />
                        </div>
                        <RichTextField
                          value={(item as Project).summary || ''}
                          onChange={(v) => updateItem(idx, { summary: v } as Partial<Project>)}
                          placeholder={t('projectSummaryPlaceholder')}
                          maxLength={500}
                        />
                      </div>
                    </>
                  )}

                  {/* Highlights */}
                  <div>
                    <label className="form-label">{t('keyHighlights')}</label>
                    <HighlightsEditor
                      highlights={(item as { highlights?: string[] }).highlights || []}
                      onChange={(highlights) => updateItem(idx, { highlights } as Partial<Entry>)}
                      onRequestRemove={(subIdx) => requestHighlightDelete(sectionKind, idx, subIdx)}
                    />
                  </div>

                  {/* Extras (project only) */}
                  {type === 'projects' && (
                    <div>
                      <label className="form-label">{t('extras')}</label>
                      <p className="text-[10px] text-surface-400 mb-1">{t('extrasHint')}</p>
                      <ExtrasEditor
                        extras={(item as Project).extras || []}
                        onChange={(extras) => updateProjectExtras(idx, extras)}
                        onRequestRemove={(subIdx) => requestExtraDelete(idx, subIdx)}
                      />
                    </div>
                  )}
                </div>
                </div>
              </div>
            </div>
          )
        })}

        {(!items || items.length === 0) && (
          <div className="text-center py-6 text-sm text-surface-400">
            {t('emptyClickAdd')}
          </div>
        )}
      </div>
    </div>
  )
}

function HighlightsEditor({ highlights, onChange, onRequestRemove }: { highlights: string[]; onChange: (h: string[]) => void; onRequestRemove?: (highlightIndex: number) => void }) {
  const t = useT()
  const addHighlight = () => onChange([...highlights, ''])
  const updateHighlight = (idx: number, value: string) => {
    const updated = [...highlights]
    updated[idx] = value
    onChange(updated)
  }
  const removeHighlight = (idx: number) => {
    if (onRequestRemove) {
      onRequestRemove(idx)
      return
    }
    onChange(highlights.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-1.5">
      {highlights.map((h, i) => (
        <div key={i} className="flex gap-1">
          <div className="flex items-center px-1 pt-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-400 flex-shrink-0" />
          </div>
          <RichTextField
            variant="inline"
            minHeight={36}
            value={h}
            onChange={(v) => updateHighlight(i, v)}
            placeholder={`${t('highlights')} ${i + 1}`}
            maxLength={500}
          />
          <button onClick={() => removeHighlight(i)} className="p-1 text-red-500 hover:bg-red-100 hover:text-red-600 rounded-md transition-colors flex-shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button onClick={addHighlight} className="btn-ghost btn-xs text-primary-600">
        <Plus className="w-3 h-3" />
        {t('addHighlight')}
      </button>
    </div>
  )
}
