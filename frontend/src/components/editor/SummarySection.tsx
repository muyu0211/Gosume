import { useResumeStore } from '../../stores/resumeStore'
import { FileText } from 'lucide-react'

export function SummarySection() {
  const resume = useResumeStore((s) => s.resume)
  const updateField = useResumeStore((s) => s.updateField)

  return (
    <div className="form-section">
      <div className="form-section-header">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary-600" />
          <span className="form-section-title">个人总结</span>
        </div>
      </div>
      <div>
        <label className="form-label">求职意向 / 个人简介</label>
        <textarea
          className="form-textarea-resizable h-24"
          value={resume?.summary || ''}
          onChange={(e) => updateField('summary', e.target.value)}
          placeholder="简要描述你的职业背景、核心能力和求职目标..."
          maxLength={1000}
        />
        <p className="text-[10px] text-surface-400 mt-1">{(resume?.summary || '').length} / 1000 字</p>
      </div>
    </div>
  )
}
