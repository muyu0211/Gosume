import { useState } from 'react'
import { useResumeStore } from '../../stores/resumeStore'
import { Plus, Trash2, ChevronDown, ChevronRight, Award, GripVertical, EyeOff } from 'lucide-react'
import { MonthPicker } from '../ui/MonthPicker'
import { VisibilityToggle } from '../ui/VisibilityToggle'
import { RichTextField } from '../ui/RichTextField'
import { useDragReorder } from '../../hooks/useDragReorder'

export function AwardSection() {
  const items = useResumeStore((s) => s.resume?.awards) || []
  const addItem = useResumeStore((s) => s.addAward)
  const updateItem = useResumeStore((s) => s.updateAward)
  const requestDelete = useResumeStore((s) => s.requestItemDelete)
  const moveItem = useResumeStore((s) => s.moveAward)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  const { draggedIdx, overIdx, onDragStart, onDragOver, onDrop, onDragEnd } = useDragReorder(moveItem)

  const toggle = (idx: number) => setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }))

  return (
    <div className="form-section">
      <div className="form-section-header">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-primary-600" />
          <span className="form-section-title">奖项荣誉</span>
          <span className="text-xs text-surface-400">({items.length})</span>
        </div>
        <button onClick={() => { addItem(); setExpanded({[items.length]: true}) }} className="btn-primary btn-xs">
          <Plus className="w-3 h-3" />
          添加
        </button>
      </div>

      <div className="space-y-2">
        {items.map((award, idx) => {
          const isExpanded = expanded[idx] ?? (idx === items.length - 1 && items.length <= 2)
          const isHidden = !!award.hidden

          return (
            <div
              key={award.id}
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
                    {award.title || '未命名奖项'}
                  </span>
                  {award.date && <span className="text-xs text-surface-400 ml-2">{award.date}</span>}
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
                <button onClick={(e) => { e.stopPropagation(); requestDelete('award', idx) }} className="p-1 text-red-500 hover:bg-red-100 hover:text-red-600 rounded-md transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className={`collapse-wrap ${isExpanded ? 'open' : ''}`}>
                <div className="collapse-inner">
                  <div className="collapse-content px-3 pb-3 pt-1 border-t border-surface-100 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="form-label">奖项名称 *</label>
                      <input className="form-input" value={award.title || ''} onChange={(e) => updateItem(idx, { title: e.target.value })} placeholder="如：年度技术创新奖" maxLength={200} />
                    </div>
                    <div>
                      <label className="form-label">颁发机构</label>
                      <input className="form-input" value={award.issuer || ''} onChange={(e) => updateItem(idx, { issuer: e.target.value })} placeholder="如：字节跳动" maxLength={200} />
                    </div>
                  </div>
                  <div>
                    <label className="form-label">获奖日期</label>
                    <MonthPicker value={award.date || ''} onChange={(v) => updateItem(idx, { date: v })} placeholder="选择获奖日期" />
                  </div>
                  <div>
                    <label className="form-label">说明</label>
                    <RichTextField value={award.summary || ''} onChange={(v) => updateItem(idx, { summary: v })} placeholder="简要描述获奖原因或背景" maxLength={500} />
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
