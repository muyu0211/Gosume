import { useResumeStore } from '../../stores/resumeStore'
import { useAppStore } from '../../stores/appStore'
import { FileText, EyeOff } from 'lucide-react'
import { RichTextField } from '../ui/RichTextField'
import { VisibilityToggle } from '../ui/VisibilityToggle'
import { getSectionTitle } from '../../lib/resumeSections'
import { useT } from '../../lib/i18n'

export function SummarySection() {
  const t = useT()
  const resume = useResumeStore((s) => s.resume)
  const updateField = useResumeStore((s) => s.updateField)
  const language = useAppStore((s) => s.language)

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
              {t('hidden')}
            </span>
          )}
        </div>
        <VisibilityToggle
          hidden={isHidden}
          onToggle={() => updateField('personal_summary.hidden', !isHidden)}
          title={isHidden ? t('unhideHint') : t('hideHint')}
        />
      </div>
      <div>
        <label className="form-label">{t('summaryLabel')}</label>
        <RichTextField
          value={summary?.summary || ''}
          onChange={(v) => updateField('personal_summary.summary', v)}
          placeholder={t('summaryPlaceholder')}
          maxLength={1000}
          minHeight={96}
        />
      </div>
    </div>
  )
}
