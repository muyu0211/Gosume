import { Plus, Trash2, GripVertical } from 'lucide-react'
import { useDragReorder } from '../../hooks/useDragReorder'
import type { ExtraField } from '../../types/resume'

interface Props {
  extras: ExtraField[]
  onChange: (extras: ExtraField[]) => void
  /** 删除子项时改为走二次确认（由父组件统一处理）；缺省则直接删除。 */
  onRequestRemove?: (extraIndex: number) => void
}

/**
 * Editor for user-defined key/value pairs on a Project (e.g. "技术栈": "React, Go").
 * Each extra has a label (the key) and a multi-line value. Supports drag-to-reorder.
 */
export function ExtrasEditor({ extras, onChange, onRequestRemove }: Props) {
  const { draggedIdx, overIdx, onDragStart, onDragOver, onDrop, onDragEnd } = useDragReorder(moveItem)

  function moveItem(from: number, to: number) {
    const next = [...extras]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
  }

  function addExtra() {
    onChange([...extras, { id: generateLocalId(), label: '', value: '' }])
  }

  function updateExtra(idx: number, patch: Partial<ExtraField>) {
    const next = [...extras]
    next[idx] = { ...next[idx], ...patch }
    onChange(next)
  }

  function removeExtra(idx: number) {
    if (onRequestRemove) {
      onRequestRemove(idx)
      return
    }
    onChange(extras.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-1.5">
      {extras.map((extra, i) => (
        <div
          key={extra.id}
          className={`flex gap-1.5 items-start rounded border transition-colors ${
            overIdx === i && draggedIdx !== i ? 'border-primary-400 bg-primary-50/50' : 'border-transparent'
          } ${draggedIdx === i ? 'opacity-40' : ''}`}
          onDragOver={(e) => onDragOver(e, i)}
          onDrop={() => onDrop(i)}
        >
          <div
            draggable
            onDragStart={() => onDragStart(i)}
            onDragEnd={onDragEnd}
            className="cursor-grab active:cursor-grabbing p-1 mt-1.5 text-surface-300 hover:text-primary-500 flex-shrink-0"
            title="拖拽排序"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>
          <input
            className="form-input text-sm !w-24 !flex-shrink-0 h-[2.25rem] min-h-[2.25rem]"
            value={extra.label}
            onChange={(e) => updateExtra(i, { label: e.target.value })}
            placeholder="字段名"
            maxLength={30}
          />
          <textarea
            className="form-textarea-resizable text-sm !flex-1 !w-auto !min-w-0 h-[2.25rem] min-h-[2.25rem]"
            value={extra.value}
            onChange={(e) => updateExtra(i, { value: e.target.value })}
            placeholder="字段值（可多行）"
            maxLength={500}
            rows={1}
          />
          <button onClick={() => removeExtra(i)} className="p-1 mt-1.5 text-surface-400 hover:text-red-500 flex-shrink-0" title="删除">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button onClick={addExtra} className="btn-ghost btn-xs text-primary-600">
        <Plus className="w-3 h-3" />
        添加扩展项
      </button>
    </div>
  )
}

function generateLocalId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10)
}
