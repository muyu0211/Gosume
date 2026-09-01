import { useResumeStore } from '../../stores/resumeStore'
import { Plus, Trash2, Languages, GripVertical, EyeOff } from 'lucide-react'
import { useDragReorder } from '../../hooks/useDragReorder'
import { CustomSelect, type SelectOption } from '../ui/CustomSelect'

// 语言熟练程度档位（与模板 skillLevel/语言说明一致）
const LEVEL_OPTIONS: SelectOption[] = [
  { value: '母语', label: '母语' },
  { value: '流利', label: '流利' },
  { value: '熟练', label: '熟练' },
  { value: '良好', label: '良好' },
  { value: '基础', label: '基础' },
]

export function LanguageSection() {
  const items = useResumeStore((s) => s.resume?.languages) || []
  const addItem = useResumeStore((s) => s.addLanguage)
  const updateItem = useResumeStore((s) => s.updateLanguage)
  const requestDelete = useResumeStore((s) => s.requestItemDelete)
  const moveItem = useResumeStore((s) => s.moveLanguage)

  const { draggedIdx, overIdx, onDragStart, onDragOver, onDrop, onDragEnd } = useDragReorder(moveItem)

  return (
    <div className="form-section">
      <div className="form-section-header">
        <div className="flex items-center gap-2">
          <Languages className="w-4 h-4 text-primary-600" />
          <span className="form-section-title">语言能力</span>
          <span className="text-xs text-surface-400">({items.length})</span>
        </div>
        <button onClick={addItem} className="btn-primary btn-xs">
          <Plus className="w-3 h-3" />
          添加
        </button>
      </div>

      <div className="space-y-2">
        {items.map((lang, idx) => {
          const isHidden = !!lang.hidden
          return (
          <div
            key={lang.id}
            className={`border rounded-lg p-3 transition-colors ${
              overIdx === idx && draggedIdx !== idx ? 'border-primary-400 bg-primary-50/50' : 'border-surface-200'
            } ${draggedIdx === idx ? 'opacity-40' : ''} ${isHidden ? 'opacity-60 bg-surface-50' : ''}`}
            onDragOver={(e) => onDragOver(e, idx)}
            onDrop={() => onDrop(idx)}
          >
            <div className="flex items-center gap-2">
              <div
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragEnd={onDragEnd}
                className={`cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-surface-200 transition-colors flex-shrink-0 self-start mt-5 ${draggedIdx === idx ? 'text-primary-500' : 'text-surface-300'}`}
              >
                <GripVertical className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2">
                <div>
                  <label className="form-label">语言名称 *</label>
                  <input
                    className={`form-input ${isHidden ? 'text-surface-400 line-through' : ''}`}
                    value={lang.name || ''}
                    onChange={(e) => updateItem(idx, { name: e.target.value })}
                    placeholder="如：英语、日语"
                    maxLength={50}
                  />
                </div>
                <div>
                  <label className="form-label">熟练程度 *</label>
                  <CustomSelect
                    value={lang.level || ''}
                    onChange={(v) => updateItem(idx, { level: v })}
                    options={LEVEL_OPTIONS}
                    placeholder="请选择"
                  />
                </div>
              </div>
              {isHidden && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-surface-500 bg-surface-200 rounded flex-shrink-0 self-start mt-5">
                  <EyeOff className="w-2.5 h-2.5" />
                  已隐藏
                </span>
              )}
              <label
                className="flex items-center gap-1 px-1.5 py-1 text-xs text-surface-500 hover:text-surface-700 cursor-pointer select-none flex-shrink-0 self-start mt-5"
                title={isHidden ? '取消隐藏（在简历中显示）' : '隐藏此项（不在简历中显示）'}
              >
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded border-surface-300 accent-primary-600 focus:ring-primary-500 cursor-pointer"
                  checked={!isHidden}
                  onChange={(e) => updateItem(idx, { hidden: !e.target.checked })}
                />
                <span className="hidden sm:inline">显示</span>
              </label>
              <button onClick={() => requestDelete('language', idx)} className="p-1.5 text-surface-400 hover:text-red-500 flex-shrink-0 self-start mt-5">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-2">
              <label className="form-label">补充说明</label>
              <input
                className="form-input"
                value={lang.proficiency || ''}
                onChange={(e) => updateItem(idx, { proficiency: e.target.value })}
                placeholder="如：CET-6 580分、JLPT N1"
                maxLength={200}
              />
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
