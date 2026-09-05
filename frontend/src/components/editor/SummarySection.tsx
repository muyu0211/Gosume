import { useResumeStore } from '../../stores/resumeStore'
import { FileText, EyeOff } from 'lucide-react'
import { RichTextField } from '../ui/RichTextField'
import { VisibilityToggle } from '../ui/VisibilityToggle'
import { getSectionTitle } from '../../lib/resumeSections'

export function SummarySection() {
  const resume = useResumeStore((s) => s.resume)
  const updateField = useResumeStore((s) => s.updateField)
  const language = resume?.meta?.language

  const summary = resume?.personal_summary
  const isHidden = !!summary?.hidden

  return (
    <div className={`form-section ${isHidden ? 'opacity-60' : ''}`}>
      <div className="form-section-header">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary-600" />
          <span className="form-section-title">{getSectionTitle('summary', language)}</span>
          {isHidden && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-surface-500 bg-surface-200 rounded">
              <EyeOff className="w-2.5 h-2.5" />
              已隐藏
            </span>
          )}
        </div>
        <VisibilityToggle
          hidden={isHidden}
          onToggle={() => updateField('personal_summary.hidden', !isHidden)}
          title={isHidden ? '取消隐藏（在简历中显示）' : '隐藏此段（不在简历中显示）'}
        />
      </div>
      <div>
        <label className="form-label">求职意向 / 个人简介</label>
        <RichTextField
          value={summary?.summary || ''}
          onChange={(v) => updateField('personal_summary.summary', v)}
          placeholder="简要描述你的职业背景、核心能力和求职目标..."
          maxLength={1000}
          minHeight={96}
        />
      </div>
    </div>
  )
}
