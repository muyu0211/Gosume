import { Plus, Trash2, GripVertical } from 'lucide-react'
import { useDragReorder } from '../../hooks/useDragReorder'
import { useEntryTransition } from '../../hooks/useEntryTransition'
import { RichTextField } from '../ui/RichTextField'
import { Tooltip } from '../ui/Tooltip'
import { useT } from '../../lib/i18n'
import type { ExtraField } from '../../types/resume'

interface Props {
  extras: ExtraField[]
  onChange: (extras: ExtraField[]) => void
  /** 删除子项时改为走二次确认（由父组件统一处理）；缺省则直接删除。 */
  onRequestRemove?: (extraIndex: number) => void
  /** data-del-key 前缀（如 `extra:2`），供删除确认时定位条目 DOM 播放离场动画。 */
  delKeyPrefix?: string
}

/**
 * Editor for user-defined key/value pairs on a Project (e.g. "技术栈": "React, Go").
 * Each extra has a label (the key) and a multi-line value. Supports drag-to-reorder.
 */
export function ExtrasEditor({ extras, onChange, onRequestRemove, delKeyPrefix }: Props) {
  const t = useT()
  // 离场动画：确认弹窗点击「确认」后由 playEntryExit 按 data-del-key 播放，此处只负责请求
  const { listRef, deleteEntry } = useEntryTransition(extras, (idx) => removeExtra(idx))
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
    <div ref={listRef} className="space-y-1.5">
      {extras.map((extra, i) => (
        <div
          key={extra.id}
          data-del-key={delKeyPrefix ? `${delKeyPrefix}:${i}` : undefined}
          className={`glass-entry flex gap-1.5 items-start transition-colors ${
            overIdx === i && draggedIdx !== i ? 'glass-entry-dragover' : ''
          } ${draggedIdx === i ? 'opacity-40' : ''}`}
          onDragOver={(e) => onDragOver(e, i)}
          onDrop={() => onDrop(i)}
        >
          <div
            draggable
            onDragStart={() => onDragStart(i)}
            onDragEnd={onDragEnd}
            className="cursor-grab active:cursor-grabbing p-1 mt-1.5 text-surface-300 hover:text-primary-500 flex-shrink-0"
            title={t('dragReorder')}
          >
            <GripVertical className="size-icon-sm" />
          </div>
          <input
            className="form-input text-sm !w-24 !flex-shrink-0 h-[2.25rem] min-h-[2.25rem]"
            value={extra.label}
            onChange={(e) => updateExtra(i, { label: e.target.value })}
            placeholder={t('fieldName')}
            maxLength={30}
          />
          <RichTextField
            className="min-w-0 flex-1"
            variant="inline"
            toolbar="focus"
            minHeight={36}
            showCount={false}
            value={extra.value}
            onChange={(v) => updateExtra(i, { value: v })}
            placeholder={t('fieldValuePlaceholder')}
            maxLength={300}
          />
          <Tooltip label={t('delete')}>
            <button onClick={(e) => deleteEntry(i, e)} className="p-1 mt-1.5 text-danger-500 hover:bg-danger-100 hover:text-danger-600 rounded-md transition-colors flex-shrink-0">
              <Trash2 className="size-icon-sm" />
            </button>
          </Tooltip>
        </div>
      ))}
      <button onClick={addExtra} className="btn-ghost btn-xs text-primary-600">
        <Plus className="w-3 h-3" />
        {t('addExtraField')}
      </button>
    </div>
  )
}

function generateLocalId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10)
}
