import { CheckCircle2, CircleSlash, ExternalLink, Mail, MessageSquare, PencilLine, Trash2, XCircle, MapPin } from 'lucide-react'
import type { JobProcess, JobStatus } from '../../types/recruit'
import { useT } from '../../lib/i18n'
import { Tooltip } from '../ui/Tooltip'
import { jobUrgencyMeta } from '../../lib/recruit/urgency'
import { fmtDateTime, fmtRelative } from '../../lib/recruit/time'
import { STAGE_KEYS, KIND_KEYS } from '../../lib/recruit/options'

interface Props {
  job: JobProcess
  now: number
  thresholdHours: number
  onEdit: (job: JobProcess) => void
  onDelete: (job: JobProcess) => void
  onSetStatus: (id: string, status: JobStatus) => void
  onOpenLink: (url: string) => void
  onOpenCompany: (norm: string) => void
}

const SOURCE_ICON = {
  manual: PencilLine,
  email: Mail,
  sms: MessageSquare,
  other: PencilLine,
} as const

/** 时间行文案：优先事件时间，其次截止时间，都没有则为「时间待定」。 */
function timeText(job: JobProcess, t: (k: string) => string): string {
  if (job.event_time) return fmtDateTime(job.event_time, job.all_day)
  if (job.deadline) return `${t('fieldDeadline')} ${fmtDateTime(job.deadline, job.all_day)}`
  return t('urgencyUnknown')
}

/**
 * 单条求职记录卡片。
 *
 * 交互纪律（苹果风）：hover 只变背景与阴影，**禁止缩放与位移**；
 * 按压才 `active:scale-[0.98]`。纯图标按钮一律挂 Tooltip，禁用原生 title。
 */
export function JobCard({
  job,
  now,
  thresholdHours,
  onEdit,
  onDelete,
  onSetStatus,
  onOpenLink,
  onOpenCompany,
}: Props) {
  const t = useT()
  const meta = jobUrgencyMeta(job, now, thresholdHours)
  const rel = fmtRelative(job.event_time ?? job.deadline, now)
  const SourceIcon = SOURCE_ICON[job.source]

  const relLabel = rel
    ? rel.key === 'relDate'
      ? rel.date
      : t(rel.key).replace('{count}', String(rel.count))
    : ''

  return (
    <div className="glass glass-card rounded-lg flex overflow-hidden transition-shadow duration-fast hover:shadow-md">
      {/* 左侧状态色条：3px，颜色即告警等级 */}
      <div className={`w-[3px] shrink-0 ${meta.barClass}`} />

      <div className="flex-1 min-w-0 p-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* 第一行：类型 / 环节 / 公司 · 岗位 */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 text-xs text-surface-400">{t(KIND_KEYS[job.kind])}</span>
            <span className="shrink-0 text-xs font-medium text-surface-600">
              {t(STAGE_KEYS[job.stage])}
            </span>
            {job.kind === 'notice' && job.round_no > 0 && (
              <span className="shrink-0 text-xs text-surface-400 tabular-nums">
                {t('roundN').replace('{count}', String(job.round_no))}
              </span>
            )}
            <button
              type="button"
              onClick={() => onOpenCompany(job.company_norm)}
              className="text-sm text-surface-800 font-medium truncate min-w-0 hover:text-primary-600 transition-colors duration-fast"
            >
              {job.company}
            </button>
            {job.position && (
              <span className="text-sm text-surface-500 truncate min-w-0">· {job.position}</span>
            )}
          </div>

          {/* 第二行：时间 + 相对日 + 告警标签 */}
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className={`text-sm ${meta.emphasize ? 'font-semibold' : ''} ${meta.urgency === 'none' ? 'text-surface-600' : meta.textClass}`}>
              {timeText(job, t)}
            </span>
            {relLabel && <span className="text-xs text-surface-400">{relLabel}</span>}
            {meta.labelKey && (
              <span className={`text-xs px-1.5 py-0.5 rounded-sm ${meta.chipClass} ${meta.textClass}`}>
                {t(meta.labelKey)}
              </span>
            )}
            {job.status !== 'pending' && (
              <span className="text-xs text-surface-400">{t(`status${cap(job.status)}`)}</span>
            )}
          </div>

          {/* 第三行：链接 / 地点 / 来源 */}
          <div className="mt-1 flex items-center gap-3 text-xs text-surface-400 min-w-0">
            {job.link && (
              <button
                type="button"
                onClick={() => onOpenLink(job.link)}
                className="flex items-center gap-1 min-w-0 max-w-[240px] text-primary-600 hover:text-primary-700 truncate"
              >
                <ExternalLink className="size-icon-sm shrink-0" strokeWidth={1.75} />
                <span className="truncate">{job.link}</span>
              </button>
            )}
            {job.location && (
              <span className="flex items-center gap-1 min-w-0 truncate">
                <MapPin className="size-icon-sm shrink-0" strokeWidth={1.75} />
                <span className="truncate">{job.location}</span>
              </span>
            )}
            <span className="flex items-center gap-1 shrink-0">
              <SourceIcon className="size-icon-sm" strokeWidth={1.75} />
              {t(`source${cap(job.source)}`)}
            </span>
            {job.note && <span className="truncate min-w-0 text-surface-400">{job.note}</span>}
          </div>
        </div>

        {/* 操作区：纯图标按钮，均带 Tooltip */}
        <div className="shrink-0 flex items-center gap-0.5">
          {job.status === 'pending' ? (
            <>
              <Tooltip label={t('markDone')}>
                <button
                  type="button"
                  onClick={() => onSetStatus(job.id, 'done')}
                  className="size-ctl-md rounded-md flex items-center justify-center text-surface-400 hover:text-success-600 hover:bg-success-500/10 active:scale-[0.98] transition-colors duration-fast"
                >
                  <CheckCircle2 className="size-icon-md" strokeWidth={1.75} />
                </button>
              </Tooltip>
              <Tooltip label={t('markMissed')}>
                <button
                  type="button"
                  onClick={() => onSetStatus(job.id, 'missed')}
                  className="size-ctl-md rounded-md flex items-center justify-center text-surface-400 hover:text-danger-600 hover:bg-danger-500/10 active:scale-[0.98] transition-colors duration-fast"
                >
                  <XCircle className="size-icon-md" strokeWidth={1.75} />
                </button>
              </Tooltip>
              <Tooltip label={t('markDropped')}>
                <button
                  type="button"
                  onClick={() => onSetStatus(job.id, 'dropped')}
                  className="size-ctl-md rounded-md flex items-center justify-center text-surface-400 hover:text-surface-600 hover:bg-surface-600/8 active:scale-[0.98] transition-colors duration-fast"
                >
                  <CircleSlash className="size-icon-md" strokeWidth={1.75} />
                </button>
              </Tooltip>
            </>
          ) : (
            <Tooltip label={t('markPending')}>
              <button
                type="button"
                onClick={() => onSetStatus(job.id, 'pending')}
                className="h-ctl-md px-2 rounded-md text-xs text-surface-500 hover:text-primary-600 hover:bg-primary-600/8 active:scale-[0.98] transition-colors duration-fast"
              >
                {t('markPending')}
              </button>
            </Tooltip>
          )}
          <Tooltip label={t('jobEdit')}>
            <button
              type="button"
              onClick={() => onEdit(job)}
              className="size-ctl-md rounded-md flex items-center justify-center text-surface-400 hover:text-primary-600 hover:bg-primary-600/10 active:scale-[0.98] transition-colors duration-fast"
            >
              <PencilLine className="size-icon-md" strokeWidth={1.75} />
            </button>
          </Tooltip>
          <Tooltip label={t('jobDelete')}>
            <button
              type="button"
              onClick={() => onDelete(job)}
              className="size-ctl-md rounded-md flex items-center justify-center text-surface-400 hover:text-danger-600 hover:bg-danger-500/10 active:scale-[0.98] transition-colors duration-fast"
            >
              <Trash2 className="size-icon-md" strokeWidth={1.75} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

/** `pending` → `Pending`，用于拼 `statusPending` / `sourceEmail` 这类 key。 */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
