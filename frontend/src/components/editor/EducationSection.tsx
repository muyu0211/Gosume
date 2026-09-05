import { useState } from 'react'
import { useResumeStore } from '../../stores/resumeStore'
import type { Education } from '../../types/resume'
import { Plus, Trash2, ChevronDown, ChevronRight, GraduationCap, GripVertical, EyeOff } from 'lucide-react'
import { MonthPicker } from '../ui/MonthPicker'
import { VisibilityToggle } from '../ui/VisibilityToggle'
import { RichTextField } from '../ui/RichTextField'
import { useDragReorder } from '../../hooks/useDragReorder'
import { getSectionTitle } from '../../lib/resumeSections'

export function EducationSection() {
  const language = useResumeStore((s) => s.resume?.meta?.language)
  const items = useResumeStore((s) => s.resume?.education) || []
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
          <GraduationCap className="w-4 h-4 text-primary-600" />
          <span className="form-section-title">{getSectionTitle('education', language)}</span>
          <span className="text-xs text-surface-400">({items.length})</span>
        </div>
        <button onClick={() => { addItem(); setExpanded({[items.length]: true}) }} className="btn-primary btn-xs">
          <Plus className="w-3 h-3" />
          添加
        </button>
      </div>

      <div className="space-y-2">
        {items.map((edu, idx) => {
          const isExpanded = expanded[idx] ?? (idx === items.length - 1 && items.length <= 2)
          const isHidden = !!edu.hidden

          return (
            <div
              key={edu.id}
              className={`border rounded-lg overflow-hidden transition-colors ${
                overIdx === idx && draggedIdx !== idx ? 'border-primary-400 bg-primary-50/50' : 'border-surface-200'
              } ${draggedIdx === idx ? 'opacity-40' : ''} ${isHidden ? 'opacity-60 bg-surface-50' : ''}`}
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
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
                {isExpanded ? <ChevronDown className="w-4 h-4 text-surface-400" /> : <ChevronRight className="w-4 h-4 text-surface-400" />}
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-medium truncate ${isHidden ? 'text-surface-400 line-through' : 'text-surface-700'}`}>
                    {edu.school || '未命名学校'}
                  </span>
                  {edu.major && <span className="text-xs text-surface-400 ml-2">{edu.major}</span>}
                  {isHidden && (
                    <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-surface-500 bg-surface-200 rounded">
                      <EyeOff className="w-2.5 h-2.5" />
                      已隐藏
                    </span>
                  )}
                </div>
                <VisibilityToggle
                  hidden={isHidden}
                  onToggle={() => updateItem(idx, { hidden: !isHidden })}
                />
                <button onClick={(e) => { e.stopPropagation(); requestDelete('education', idx) }} className="p-1 text-red-500 hover:bg-red-100 hover:text-red-600 rounded-md transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className={`collapse-wrap ${isExpanded ? 'open' : ''}`}>
                <div className="collapse-inner">
                  <div className="collapse-content px-3 pb-3 pt-1 border-t border-surface-100 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="form-label">学校 *</label>
                      <input className="form-input" value={edu.school || ''} onChange={(e) => updateItem(idx, { school: e.target.value })} placeholder="清华大学" maxLength={100} />
                    </div>
                    <div>
                      <label className="form-label">学位</label>
                      <input className="form-input" value={edu.degree || ''} onChange={(e) => updateItem(idx, { degree: e.target.value })} placeholder="学士" maxLength={50} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="form-label">专业 *</label>
                      <input className="form-input" value={edu.major || ''} onChange={(e) => updateItem(idx, { major: e.target.value })} placeholder="计算机科学与技术" maxLength={100} />
                    </div>
                    <div>
                      <label className="form-label">辅修</label>
                      <input className="form-input" value={edu.minor || ''} onChange={(e) => updateItem(idx, { minor: e.target.value })} placeholder="辅修专业（可选）" maxLength={100} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="form-label">开始日期</label>
                      <MonthPicker value={edu.start_date || ''} onChange={(v) => updateItem(idx, { start_date: v })} placeholder="选择开始日期" />
                    </div>
                    <div>
                      <label className="form-label">结束日期</label>
                      <MonthPicker value={edu.end_date || ''} onChange={(v) => updateItem(idx, { end_date: v })} placeholder="选择结束日期" showPresent minValue={edu.start_date || undefined} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="form-label">GPA</label>
                      <input className="form-input" value={edu.gpa || ''} onChange={(e) => updateItem(idx, { gpa: e.target.value })} placeholder="3.8/4.0" maxLength={20} />
                    </div>
                    <div>
                      <label className="form-label">主修课程</label>
                      <input className="form-input" value={edu.courses || ''} onChange={(e) => updateItem(idx, { courses: e.target.value })} placeholder="如：数据结构、操作系统、计算机网络" maxLength={500} />
                    </div>
                  </div>

                  <div>
                    <label className="form-label">在校亮点</label>
                    <HighlightsEditor
                      highlights={edu.highlights || []}
                      onChange={(highlights) => updateItem(idx, { highlights })}
                      onRequestRemove={(subIdx) => requestHighlightDelete('education', idx, subIdx)}
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
            暂无内容，点击上方"添加"按钮开始
          </div>
        )}
      </div>
    </div>
  )
}

function HighlightsEditor({ highlights, onChange, onRequestRemove }: { highlights: string[]; onChange: (h: string[]) => void; onRequestRemove?: (highlightIndex: number) => void }) {
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
            placeholder={`亮点 ${i + 1}`}
            maxLength={500}
          />
          <button onClick={() => removeHighlight(i)} className="p-1 text-red-500 hover:bg-red-100 hover:text-red-600 rounded-md transition-colors">
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
