import { useState } from 'react'
import { useResumeStore } from '../../stores/resumeStore'
import type { Job, Project } from '../../types/resume'
import { Plus, Trash2, ChevronDown, ChevronRight, Briefcase, FolderGit2, GripVertical } from 'lucide-react'
import { MonthPicker } from '../ui/MonthPicker'
import { useDragReorder } from '../../hooks/useDragReorder'

interface Props {
  type: 'jobs' | 'projects'
  title: string
}

type Entry = Job | Project

export function ExperienceSection({ type, title }: Props) {
  const items = useResumeStore((s) => (type === 'jobs' ? s.resume?.jobs : s.resume?.projects)) as Entry[]
  const addItem = useResumeStore((s) => (type === 'jobs' ? s.addJob : s.addProject))
  const updateItem = useResumeStore((s) => (type === 'jobs' ? s.updateJob : s.updateProject))
  const removeItem = useResumeStore((s) => (type === 'jobs' ? s.removeJob : s.removeProject))
  const moveItem = useResumeStore((s) => (type === 'jobs' ? s.moveJob : s.moveProject))
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  const { draggedIdx, overIdx, onDragStart, onDragOver, onDrop, onDragEnd } = useDragReorder(moveItem)

  const toggle = (idx: number) => setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }))

  return (
    <div className="form-section">
      <div className="form-section-header">
        <div className="flex items-center gap-2">
          {type === 'jobs' ? (
            <Briefcase className="w-4 h-4 text-primary-600" />
          ) : (
            <FolderGit2 className="w-4 h-4 text-primary-600" />
          )}
          <span className="form-section-title">{title}</span>
          <span className="text-xs text-surface-400">({items?.length || 0})</span>
        </div>
        <button onClick={() => { addItem(); setExpanded({[items?.length || 0]: true}) }} className="btn-primary btn-xs">
          <Plus className="w-3 h-3" />
          添加
        </button>
      </div>

      <div className="space-y-2">
        {items?.map((item, idx) => {
          const isExpanded = expanded[idx] ?? (idx === items.length - 1 && items.length <= 2)
          const name = type === 'jobs' ? (item as Job).company : (item as Project).name
          const role = type === 'jobs' ? (item as Job).title : (item as Project).role

          return (
            <div
              key={item.id}
              className={`border rounded-lg overflow-hidden transition-colors ${
                overIdx === idx && draggedIdx !== idx ? 'border-primary-400 bg-primary-50/50' : 'border-surface-200'
              } ${draggedIdx === idx ? 'opacity-40' : ''}`}
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
                  <span className="text-sm font-medium text-surface-700 truncate">
                    {name || `未命名${type === 'jobs' ? '公司' : '项目'}`}
                  </span>
                  {role && <span className="text-xs text-surface-400 ml-2">{role}</span>}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeItem(idx) }}
                  className="p-1 text-surface-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Expanded form */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-1 border-t border-surface-100 space-y-2.5">
                  {type === 'jobs' ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="form-label">公司名称 *</label>
                          <input className="form-input" value={(item as Job).company || ''} onChange={(e) => updateItem(idx, { company: e.target.value } as Partial<Job>)} placeholder="字节跳动" maxLength={100} />
                        </div>
                        <div>
                          <label className="form-label">职位 *</label>
                          <input className="form-input" value={(item as Job).title || ''} onChange={(e) => updateItem(idx, { title: e.target.value } as Partial<Job>)} placeholder="高级前端工程师" maxLength={100} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="form-label">开始日期</label>
                          <MonthPicker value={(item as Job).start_date || ''} onChange={(v) => updateItem(idx, { start_date: v } as Partial<Job>)} placeholder="选择开始日期" />
                        </div>
                        <div>
                          <label className="form-label">结束日期</label>
                          <MonthPicker
                            value={(item as Job).end_date || ''}
                            onChange={(v) => updateItem(idx, { end_date: v } as Partial<Job>)}
                            placeholder="选择结束日期"
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
                        当前在职
                      </label>
                      <div>
                        <label className="form-label">工作地点</label>
                        <input className="form-input" value={(item as Job).location || ''} onChange={(e) => updateItem(idx, { location: e.target.value } as Partial<Job>)} placeholder="北京" maxLength={100} />
                      </div>
                      <div>
                        <label className="form-label">工作概述</label>
                        <textarea className="form-textarea-resizable h-16" value={(item as Job).summary || ''} onChange={(e) => updateItem(idx, { summary: e.target.value } as Partial<Job>)} placeholder="工作经历概述..." maxLength={500} />
                        <p className="text-[10px] text-surface-400 mt-0.5">{((item as Job).summary || '').length} / 500 字</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="form-label">项目名称 *</label>
                          <input className="form-input" value={(item as Project).name || ''} onChange={(e) => updateItem(idx, { name: e.target.value } as Partial<Project>)} placeholder="电商平台重构" maxLength={100} />
                        </div>
                        <div>
                          <label className="form-label">担任角色</label>
                          <input className="form-input" value={(item as Project).role || ''} onChange={(e) => updateItem(idx, { role: e.target.value } as Partial<Project>)} placeholder="前端负责人" maxLength={100} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="form-label">开始日期</label>
                          <MonthPicker value={(item as Project).start_date || ''} onChange={(v) => updateItem(idx, { start_date: v } as Partial<Project>)} placeholder="选择开始日期" />
                        </div>
                        <div>
                          <label className="form-label">结束日期</label>
                          <MonthPicker
                            value={(item as Project).end_date || ''}
                            onChange={(v) => updateItem(idx, { end_date: v } as Partial<Project>)}
                            placeholder="选择结束日期"
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
                        当前项目未结束
                      </label>
                      <div>
                        <label className="form-label">项目简述</label>
                        <textarea className="form-textarea-resizable h-16" value={(item as Project).summary || ''} onChange={(e) => updateItem(idx, { summary: e.target.value } as Partial<Project>)} placeholder="项目简要描述..." maxLength={500} />
                        <p className="text-[10px] text-surface-400 mt-0.5">{((item as Project).summary || '').length} / 500 字</p>
                      </div>
                    </>
                  )}

                  {/* Highlights */}
                  <div>
                    <label className="form-label">关键亮点</label>
                    <HighlightsEditor
                      highlights={(item as { highlights?: string[] }).highlights || []}
                      onChange={(highlights) => updateItem(idx, { highlights } as Partial<Entry>)}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {(!items || items.length === 0) && (
          <div className="text-center py-6 text-sm text-surface-400">
            暂无内容，点击上方"添加"按钮开始
          </div>
        )}
      </div>
    </div>
  )
}

function HighlightsEditor({ highlights, onChange }: { highlights: string[]; onChange: (h: string[]) => void }) {
  const addHighlight = () => onChange([...highlights, ''])
  const updateHighlight = (idx: number, value: string) => {
    const updated = [...highlights]
    updated[idx] = value
    onChange(updated)
  }
  const removeHighlight = (idx: number) => onChange(highlights.filter((_, i) => i !== idx))

  return (
    <div className="space-y-1.5">
      {highlights.map((h, i) => (
        <div key={i} className="flex gap-1">
          <div className="flex items-center px-1 pt-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-400 flex-shrink-0" />
          </div>
          <input
            className="form-input flex-1 text-sm"
            value={h}
            onChange={(e) => updateHighlight(i, e.target.value)}
            placeholder={`亮点 ${i + 1}`}
            maxLength={500}
          />
          <button onClick={() => removeHighlight(i)} className="p-1 text-surface-400 hover:text-red-500">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button onClick={addHighlight} className="btn-ghost btn-xs text-primary-600">
        <Plus className="w-3 h-3" />
        添加亮点
      </button>
    </div>
  )
}
