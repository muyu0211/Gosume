import { Plus, Trash2 } from 'lucide-react'
import { useT } from '../../lib/i18n'
import { RichTextField } from '../ui/RichTextField'
import { useListEnterAnimation } from '../../hooks/useEntryTransition'
import { AIGroupPolishControl } from './AIGroupPolishControl'

interface Props {
  /** label 文案（关键亮点 / 在校亮点） */
  label: string
  highlights: string[]
  onChange: (h: string[]) => void
  /** 二次确认删除回调（不传则直接删除） */
  onRequestRemove?: (highlightIndex: number) => void
  /** 条目删除动画 key 前缀（如 `highlight:job:0`） */
  delKeyPrefix: string
  /** AI 条目上下文（公司 · 职位 / 学校 · 专业 · 学位 / 模块 · 条目标题），可空 */
  context: string
}

/**
 * 「关键亮点」公共块（方案 v0.3 §6.2）：label 行（含整组 AI 润色入口）+ bullet
 * 编辑器。原 `ExperienceSection` / `EducationSection` / `CustomSection` 三处
 * 逐字重复的私有 `HighlightsEditor` 收敛于此，AI 接入只改这一处。
 *
 * 差异点全部参数化：label 文案、删除回调（各 Section 闭包适配自己的
 * requestXxxHighlightDelete）、del-key 前缀、AI 条目上下文。
 */
export function HighlightsBlock({ label, highlights, onChange, onRequestRemove, delKeyPrefix, context }: Props) {
  const t = useT()
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
  const enterRef = useListEnterAnimation(highlights.length, '.hl-row')

  return (
    <div>
      <div className="flex items-center justify-between min-w-0">
        <label className="form-label mb-0">{label}</label>
        <AIGroupPolishControl highlights={highlights} context={context} onApply={onChange} />
      </div>
      <div ref={enterRef} className="space-y-1.5 mt-1">
        {highlights.map((h, i) => (
          <div key={i} data-del-key={`${delKeyPrefix}:${i}`} className="hl-row flex gap-1">
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
            <button onClick={() => removeHighlight(i)} className="p-1 text-danger-500 hover:bg-danger-100 hover:text-danger-600 rounded-md transition-colors flex-shrink-0">
              <Trash2 className="size-icon-sm" />
            </button>
          </div>
        ))}
        <button onClick={() => onChange([...highlights, ''])} className="btn-ghost btn-xs text-primary-600">
          <Plus className="w-3 h-3" />
          {t('addHighlight')}
        </button>
      </div>
    </div>
  )
}
