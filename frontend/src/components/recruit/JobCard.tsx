import { CheckCircle2, CircleSlash, ExternalLink, Mail, MessageSquare, PencilLine, Trash2, XCircle, MapPin, Video } from 'lucide-react'
import type { JobProcess, JobStatus } from '../../types/recruit'
import { useT } from '../../lib/i18n'
import { Tooltip } from '../ui/Tooltip'
import { jobUrgencyMeta } from '../../lib/recruit/urgency'
import { fmtDateTime, fmtRelative } from '../../lib/recruit/time'
import { STAGE_KEYS } from '../../lib/recruit/options'

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

/** 归档态（非 pending）的状态视觉：图标 + 语义色 chip + 直达切换按钮（文案 / hover）。 */
const ARCHIVED_STATUS_META = {
  done: {
    icon: CheckCircle2,
    textClass: 'text-success-600',
    chipClass: 'bg-success-600/10',
    markKey: 'markDone',
    hoverClass: 'hover:text-success-600 hover:bg-success-500/10',
  },
  missed: {
    icon: XCircle,
    textClass: 'text-danger-600',
    chipClass: 'bg-danger-600/10',
    markKey: 'markMissed',
    hoverClass: 'hover:text-danger-600 hover:bg-danger-500/10',
  },
  dropped: {
    icon: CircleSlash,
    textClass: 'text-surface-500',
    chipClass: 'bg-surface-600/10',
    markKey: 'markDropped',
    hoverClass: 'hover:text-surface-600 hover:bg-surface-600/8',
  },
} as const

/** 全部终态（归档直达切换的遍历源，渲染时剔除当前状态）。 */
const TERMINAL_STATUSES = ['done', 'missed', 'dropped'] as const

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
  // 归档条目的状态视觉（pending 为 null）：图标 + 语义色 chip
  const statusMeta = job.status === 'pending' ? null : ARCHIVED_STATUS_META[job.status]
  const StatusIcon = statusMeta?.icon

  const relLabel = rel
    ? rel.key === 'relDate'
      ? rel.date
      : t(rel.key).replace('{count}', String(rel.count))
    : ''

  return (
    <div className="glass glass-card rounded-lg flex overflow-hidden transition-shadow duration-fast hover:shadow-md relative">
      {/* 环节水印：背景层大字（中间偏右——左侧多为文字行会被遮挡，右侧大部分情况留白），一眼识别当前求职阶段 */}
      <span
        aria-hidden
        className="absolute left-2/3 top-1/2 -translate-x-1/2 -translate-y-1/2 text-6xl font-bold italic leading-none text-surface-600/8 select-none pointer-events-none whitespace-nowrap"
      >
        {t(STAGE_KEYS[job.stage])}
      </span>

      {/* 左侧状态色条：颜色即告警等级 */}
      <div className={`w-[5px] shrink-0 ${meta.barClass}`} />

      <div className="relative flex-1 min-w-0 p-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* 第一行：公司 → 岗位 → 轮次 →（行尾）是否关联；环节改由背景水印承载。
              min-h-ctl-md 与右侧操作按钮列（size-ctl-md）同高，保证「未关联 / 第x轮」
              与标记完成、编辑、删除按钮在同一水平线上。 */}
          <div className="flex items-center gap-x-2 gap-y-0.5 min-w-0 flex-wrap min-h-ctl-md">
            <button
              type="button"
              onClick={() => onOpenCompany(job.company_norm)}
              className="shrink-0 max-w-[12rem] text-sm text-surface-800 font-medium truncate hover:text-primary-600 transition-colors duration-fast"
            >
              {job.company}
            </button>
            {job.position && (
              <span className="flex-1 min-w-0 text-sm text-surface-500 truncate">{job.position}</span>
            )}
            {job.stage !== 'apply' && job.round_no > 0 && (
              <span className="shrink-0 text-xs text-surface-400 tabular-nums">
                {t('roundN').replace('{count}', String(job.round_no))}
              </span>
            )}
            {job.stage !== 'apply' && !job.parent_id && (
              <span className="ml-auto shrink-0 text-xs px-1.5 py-0.5 rounded-sm bg-surface-600/10 text-surface-500">
                {t('noticeUnlinked')}
              </span>
            )}
          </div>

          {/* 第二行：时间 + 相对日 + 告警标签 */}
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className={`text-sm ${meta.emphasize ? 'font-semibold' : ''} ${meta.urgency === 'none' ? 'text-surface-600' : meta.textClass}`}>
              {timeText(job, t)}
            </span>
            {job.deadline && job.event_time && (
              <span className="text-xs text-surface-400">
                {t('deadlineShort')} {fmtDateTime(job.deadline, job.all_day)}
              </span>
            )}
            {relLabel && <span className="text-xs text-surface-400">{relLabel}</span>}
            {meta.labelKey && (
              <span className={`text-xs px-1.5 py-0.5 rounded-sm ${meta.chipClass} ${meta.textClass}`}>
                {t(meta.labelKey)}
              </span>
            )}
            {statusMeta && StatusIcon && (
              <span
                className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-sm ${statusMeta.chipClass} ${statusMeta.textClass}`}
              >
                <StatusIcon className="size-icon-sm" />
                {t(`status${cap(job.status)}`)}
              </span>
            )}
          </div>

          <div className="mt-1 flex items-center gap-x-3 gap-y-1 text-xs text-surface-400 min-w-0 flex-wrap">
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
              <span className="flex items-center gap-1 shrink-0 max-w-full truncate">
                <MapPin className="size-icon-sm shrink-0" strokeWidth={1.75} />
                <span className="truncate">{job.location}</span>
              </span>
            )}
            {job.online && (
              <span className="flex items-center gap-1 shrink-0">
                <Video className="size-icon-sm" strokeWidth={1.75} />
                {t('online')}
              </span>
            )}
            <span className="flex items-center gap-1 shrink-0">
              <SourceIcon className="size-icon-sm" strokeWidth={1.75} />
              {t(`source${cap(job.source)}`)}
            </span>
            {job.note && <span className="flex-1 min-w-0 truncate text-surface-400">{job.note}</span>}
          </div>
        </div>

        {/* 操作区：纯图标按钮，均带 Tooltip */}
        <div className="relative shrink-0 flex items-center gap-0.5">
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
            // 归档直达切换：除当前状态外的全部终态均可一键直达（含已放弃），无需先恢复待处理
            TERMINAL_STATUSES.filter((st) => st !== job.status).map((st) => {
              const m = ARCHIVED_STATUS_META[st]
              const Icon = m.icon
              return (
                <Tooltip key={st} label={t(m.markKey)}>
                  <button
                    type="button"
                    onClick={() => onSetStatus(job.id, st)}
                    className={`size-ctl-md rounded-md flex items-center justify-center active:scale-[0.98] transition-colors duration-fast ${m.hoverClass}`}
                  >
                    <Icon className="size-icon-md" strokeWidth={1.75} />
                  </button>
                </Tooltip>
              )
            })
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
