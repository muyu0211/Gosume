import { useEffect, useMemo, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { useT } from '../../lib/i18n'
import { Tooltip } from '../ui/Tooltip'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useRecruitStore } from '../../stores/recruitStore'
import { companyProgress } from '../../lib/recruit/stats'
import { STAGE_KEYS } from '../../lib/recruit/options'
import { fmtDate } from '../../lib/recruit/time'
import type { JobCompany } from '../../types/recruit'

interface Props {
  /** 目标公司的归一化名 */
  norm: string
  onClose: () => void
}

/**
 * 公司档案面板（Q12：页内右侧抽屉，不新增路由）。
 *
 * 档案是**可选**的增强数据：没有档案也能看到该公司的时间线，
 * 勾选字段后点保存才会创建记录。
 */
export function CompanyPanel({ norm, onClose }: Props) {
  const t = useT()
  const jobs = useRecruitStore((s) => s.jobs)
  const companies = useRecruitStore((s) => s.companies)
  const saveCompany = useRecruitStore((s) => s.saveCompany)
  const removeCompany = useRecruitStore((s) => s.removeCompany)

  const existing = useMemo(() => companies.find((c) => c.norm === norm) ?? null, [companies, norm])
  const related = useMemo(() => jobs.filter((j) => j.company_norm === norm), [jobs, norm])
  const progress = useMemo(() => companyProgress(related)[0], [related])

  const [form, setForm] = useState<JobCompany>(() => blank(norm, related[0]?.company ?? norm))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)

  // 切换目标公司或档案首次加载时同步表单
  useEffect(() => {
    setForm(existing ?? blank(norm, related[0]?.company ?? norm))
    setDirty(false)
    setError('')
  }, [existing, norm, related])

  const patch = (p: Partial<JobCompany>) => {
    setForm((f) => ({ ...f, ...p }))
    setDirty(true)
  }

  const handleSave = async () => {
    setError('')
    try {
      await saveCompany(form)
      setDirty(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const usedCount = related.filter((j) => j.company_id === existing?.id).length

  return (
    <div className="absolute right-0 top-0 bottom-0 w-[380px] glass glass-card rounded-l-lg flex flex-col overflow-hidden animate-dropdown-enter">
      <div className="px-4 h-ctl-xl flex items-center gap-2 border-b border-hairline border-surface-300">
        <span className="flex-1 min-w-0 truncate text-sm font-semibold text-surface-800">
          {t('companyPanelTitle')}
        </span>
        <Tooltip label={t('close')}>
          <button
            type="button"
            onClick={onClose}
            className="size-ctl-md rounded-md flex items-center justify-center text-surface-400 hover:text-surface-700 hover:bg-surface-600/8 transition-colors duration-fast"
          >
            <X className="size-icon-md" strokeWidth={2} />
          </button>
        </Tooltip>
      </div>

      <div className="flex-1 overflow-auto overlay-scroll px-4 py-4 flex flex-col gap-4">
        <div>
          <div className="text-base font-medium text-surface-800 truncate">
            {related[0]?.company ?? norm}
          </div>
          {progress && (
            <div className="mt-1 text-xs text-surface-500">
              {t('progressLabel')} · {t(STAGE_KEYS[progress.stage])}
              {progress.round_no > 0 ? ` ${progress.round_no}` : ''}
            </div>
          )}
        </div>

        <Field label={t('name')}>
          <input
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label={t('companyAliases')}>
          <input
            value={form.aliases.join('，')}
            onChange={(e) =>
              patch({
                aliases: e.target.value
                  .split(/[，,]/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            className={inputCls}
            placeholder="ByteDance，字节"
          />
        </Field>
        <Field label={t('companyWebsite')}>
          <input value={form.website} onChange={(e) => patch({ website: e.target.value })} className={inputCls} />
        </Field>
        <Field label={t('companyCareer')}>
          <input value={form.career_url} onChange={(e) => patch({ career_url: e.target.value })} className={inputCls} />
        </Field>
        <Field label={t('companyContact')}>
          <input value={form.contact} onChange={(e) => patch({ contact: e.target.value })} className={inputCls} />
        </Field>
        <Field label={t('fieldNote')}>
          <textarea
            value={form.note}
            onChange={(e) => patch({ note: e.target.value })}
            rows={2}
            className={`${inputCls} !h-auto py-2 resize-none`}
          />
        </Field>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void handleSave()} disabled={!dirty} className="btn btn-primary">
            {t('save')}
          </button>
          {existing && (
            <Tooltip label={t('delete')}>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="size-ctl-lg rounded-md flex items-center justify-center text-surface-400 hover:text-danger-600 hover:bg-danger-500/10 transition-colors duration-fast"
              >
                <Trash2 className="size-icon-md" strokeWidth={1.75} />
              </button>
            </Tooltip>
          )}
        </div>
        {error && <p className="text-sm text-danger-600">{error}</p>}

        <div className="border-t border-hairline border-surface-300 pt-4">
          <div className="text-xs text-surface-500 mb-2">
            {t('companyJobs').replace('{count}', String(related.length))}
          </div>
          <div className="flex flex-col gap-1">
            {related.map((j) => (
              <div key={j.id} className="flex items-center gap-2 text-xs text-surface-600">
                <span className="text-surface-400 tabular-nums">{fmtDate(j.event_time ?? j.deadline) || '—'}</span>
                <span className="shrink-0">{t(STAGE_KEYS[j.stage])}</span>
                <span className="truncate min-w-0">{j.position}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        danger
        title={t('deleteConfirmTitle')}
        description={
          usedCount > 0 ? t('companyDeleteBlocked').replace('{count}', String(usedCount)) : undefined
        }
        onConfirm={() => {
          setConfirmDelete(false)
          if (!existing) return
          void removeCompany(existing.id).catch((err: unknown) => {
            setError(err instanceof Error ? err.message : String(err))
          })
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}

const inputCls =
  'w-full min-w-0 h-ctl-lg px-3 rounded-md bg-elev text-sm text-surface-800 placeholder:text-surface-400 border border-hairline border-surface-200 transition-colors duration-fast hover:border-surface-300 focus:outline-none focus:border-primary-500 focus:shadow-focus'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-xs text-surface-500 mb-1">
        {label}
        {hint && <span className="text-surface-400">（{hint}）</span>}
      </span>
      {children}
    </label>
  )
}

function blank(norm: string, name: string): JobCompany {
  const now = new Date().toISOString()
  return {
    id: '',
    name,
    norm,
    aliases: [],
    website: '',
    career_url: '',
    contact: '',
    note: '',
    created_at: now,
    updated_at: now,
  }
}
