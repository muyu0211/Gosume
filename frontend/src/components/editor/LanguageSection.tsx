import { useResumeStore } from '../../stores/resumeStore'
import { useAppStore } from '../../stores/appStore'
import { Plus, Trash2, Languages, GripVertical, EyeOff } from 'lucide-react'
import { useDragReorder } from '../../hooks/useDragReorder'
import { CustomSelect, type SelectOption } from '../ui/CustomSelect'
import { VisibilityToggle } from '../ui/VisibilityToggle'
import { getSectionTitle } from '../../lib/resumeSections'
import { useT } from '../../lib/i18n'

// 语言熟练程度档位（与模板 skillLevel/语言说明一致）
const LEVEL_OPTIONS = [
  { value: '母语', labelKey: 'langNative' },
  { value: '流利', labelKey: 'langFluent' },
  { value: '熟练', labelKey: 'langProficient' },
  { value: '良好', labelKey: 'langGood' },
  { value: '基础', labelKey: 'langBasic' },
] as const

export function LanguageSection() {
  const t = useT()
  const language = useAppStore((s) => s.language)
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
          <span className="form-section-title">{getSectionTitle('languages', language)}</span>
          <span className="text-xs text-surface-400">({items.length})</span>
        </div>
        <button onClick={addItem} className="btn-primary btn-xs">
          <Plus className="w-3 h-3" />
          {t('add')}
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
                  <label className="form-label">{t('languageName')}</label>
                  <input
                    className={`form-input ${isHidden ? 'text-surface-400 line-through' : ''}`}
                    value={lang.name || ''}
                    onChange={(e) => updateItem(idx, { name: e.target.value })}
                    placeholder={t('languageNamePlaceholder')}
                    maxLength={50}
                  />
                </div>
                <div>
                  <label className="form-label">{t('proficiencyLevel')}</label>
                  <CustomSelect
                    value={lang.level || ''}
                    onChange={(v) => updateItem(idx, { level: v })}
                    options={LEVEL_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }) as SelectOption)}
                    placeholder={t('selectPlaceholder')}
                  />
                </div>
              </div>
              {isHidden && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-surface-500 bg-surface-200 rounded flex-shrink-0 self-start mt-5">
                  <EyeOff className="w-2.5 h-2.5" />
                  {t('hidden')}
                </span>
              )}
              <VisibilityToggle
                hidden={isHidden}
                onToggle={() => updateItem(idx, { hidden: !isHidden })}
                className="flex-shrink-0 self-start mt-5"
              />
              <button onClick={() => requestDelete('language', idx)} className="p-1.5 text-red-500 hover:bg-red-100 hover:text-red-600 rounded-md transition-colors flex-shrink-0 self-start mt-5">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-2">
              <label className="form-label">{t('supplement')}</label>
              <input
                className="form-input"
                value={lang.proficiency || ''}
                onChange={(e) => updateItem(idx, { proficiency: e.target.value })}
                placeholder={t('supplementPlaceholder')}
                maxLength={200}
              />
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
