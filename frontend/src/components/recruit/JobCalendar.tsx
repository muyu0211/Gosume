import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { JobProcess, JobStatus } from '../../types/recruit'
import { useT } from '../../lib/i18n'
import { buildCalendar } from '../../lib/recruit/grouping'
import { dayKey } from '../../lib/recruit/time'
import { jobUrgencyMeta } from '../../lib/recruit/urgency'
import { Modal, type ModalHandle } from '../ui/Modal'
import { Tooltip } from '../ui/Tooltip'
import { JobCard } from './JobCard'

interface Props {
  /** 已按筛选条件过滤后的条目（不含「时间待定」，那部分走页脚） */
  jobs: JobProcess[]
  unknownCount: number
  now: number
  thresholdHours: number
  onPickUnknown: () => void
  onEdit: (job: JobProcess) => void
  onDelete: (job: JobProcess) => void
  onSetStatus: (id: string, status: JobStatus) => void
  onOpenLink: (url: string) => void
  onOpenCompany: (norm: string) => void
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

/** 格内缩略信息最多展示的条数（更多以 +N 提示，完整内容在点击后的模态里）。 */
const PREVIEW_LIMIT = 3

/** RFC3339 → 当日 HH:mm（全天事件不显示时分）。 */
function hhmm(job: JobProcess): string {
  if (job.all_day) return ''
  const at = job.event_time ?? job.deadline
  return at && at.length >= 16 ? at.slice(11, 16) : ''
}

/**
 * 日历月视图（自绘 7 列，不引第三方）。
 *
 * - 固定 42 格，切月时高度不跳动；格子定高，内容永不撑大格子；
 * - 当天格用主色浅底；**格内缩略行程为小 chip 水平排列**（放不下自动换行，
 *   超出格高被裁剪；chip 内文本超宽 truncate 省略；`+N` 提示还有更多，
 *   完整内容在点击后的模态里）；
 * - 点击有行程的日期格 → 模态窗口列出当日全部条目（完整 JobCard，可编辑/删改），
 *   关闭即返回日历；空格子不响应点击。
 */
export function JobCalendar({
  jobs,
  unknownCount,
  now,
  thresholdHours,
  onPickUnknown,
  onEdit,
  onDelete,
  onSetStatus,
  onOpenLink,
  onOpenCompany,
}: Props) {
  const t = useT()
  const handlers = { now, thresholdHours, onEdit, onDelete, onSetStatus, onOpenLink, onOpenCompany }
  const modalRef = useRef<ModalHandle>(null)
  const base = new Date(now)
  const [cursor, setCursor] = useState({ year: base.getFullYear(), month: base.getMonth() })
  const [openDay, setOpenDay] = useState<string | null>(null)

  const cells = useMemo(() => buildCalendar(jobs, cursor.year, cursor.month), [jobs, cursor])
  const todayKey = dayKey(now)
  const openJobs = useMemo(
    () => (openDay ? jobs.filter((j) => (j.event_time ?? j.deadline)?.slice(0, 10) === openDay) : []),
    [jobs, openDay],
  )

  const shift = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Tooltip label={t('prevMonth')}>
          <button
            type="button"
            onClick={() => shift(-1)}
            className="size-ctl-md rounded-md flex items-center justify-center text-surface-500 hover:text-surface-700 hover:bg-surface-600/8 active:scale-[0.98] transition-colors duration-fast"
          >
            <ChevronLeft className="size-icon-md" strokeWidth={2} />
          </button>
        </Tooltip>
        <span className="text-sm font-medium text-surface-700 tabular-nums">
          {cursor.year}-{String(cursor.month + 1).padStart(2, '0')}
        </span>
        <Tooltip label={t('nextMonth')}>
          <button
            type="button"
            onClick={() => shift(1)}
            className="size-ctl-md rounded-md flex items-center justify-center text-surface-500 hover:text-surface-700 hover:bg-surface-600/8 active:scale-[0.98] transition-colors duration-fast"
          >
            <ChevronRight className="size-icon-md" strokeWidth={2} />
          </button>
        </Tooltip>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="h-ctl-sm flex items-center justify-center text-xs text-surface-400">
            {w}
          </div>
        ))}
        {cells.map((cell) => {
          const isToday = cell.day === todayKey
          const hasJobs = cell.jobs.length > 0
          const shown = cell.jobs.slice(0, PREVIEW_LIMIT)
          const rest = cell.jobs.length - shown.length
          return (
            <button
              key={cell.day}
              type="button"
              onClick={() => hasJobs && setOpenDay(cell.day)}
              className={`h-[64px] rounded-md p-1 flex flex-col items-stretch text-left transition-colors duration-fast overflow-hidden ${
                isToday
                  ? 'bg-primary-600/6'
                  : 'bg-surface-100 hover:bg-surface-200'
              } ${cell.inMonth ? '' : 'opacity-40'} ${hasJobs ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span
                className={`shrink-0 text-sm tabular-nums ${isToday ? 'text-primary-700 font-semibold' : 'text-surface-500'}`}
              >
                {cell.date}
              </span>
              {/* 行程缩略区 */}
              <span className="flex-1 min-w-0 flex flex-wrap items-start content-start gap-x-1 gap-y-0.5 overflow-hidden mt-0.5">
                {shown.map((j) => {
                  const time = hhmm(j)
                  return (
                    <span
                      key={j.id}
                      className="max-w-full min-w-0 h-6 px-1.5 rounded-full bg-surface-600/6 flex items-center gap-1"
                    >
                      <span
                        className={`w-1 h-1 rounded-full shrink-0 ${jobUrgencyMeta(j, now, thresholdHours).barClass}`}
                      />
                      {time && (
                        <span className="shrink-0 text-[10px] leading-none text-surface-400 tabular-nums">{time}</span>
                      )}
                      <span className="min-w-0 truncate text-[12px] leading-none text-surface-600">{j.company}</span>
                    </span>
                  )
                })}
                {rest > 0 && (
                  <span className="shrink-0 self-center text-[12px] leading-none text-surface-400 pl-0.5">+{rest}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {/* 当日行程详情：模态窗口 */}
      {openDay && (
        <Modal ref={modalRef} onClose={() => setOpenDay(null)} width="w-[520px]" cardClassName="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-base font-semibold text-surface-800 tabular-nums">{openDay}</h2>
            </div>
            <button
              type="button"
              onClick={() => modalRef.current?.close()}
              className="p-1.5 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-100 transition-colors"
            >
              <X className="size-icon-lg" />
            </button>
          </div>
          
          <div className="gosume-modal-scroll flex-1 overflow-auto px-6 py-4 flex flex-col gap-2 max-h-[60vh]">
            {openJobs.length === 0 ? (
              <p className="text-sm text-surface-400 py-4 text-center">{t('noMatchJob')}</p>
            ) : (
              openJobs.map((job) => <JobCard key={job.id} job={job} {...handlers} />)
            )}
          </div>
        </Modal>
      )}

      {unknownCount > 0 && (
        <button
          type="button"
          onClick={onPickUnknown}
          className="self-start text-xs text-info-600 hover:text-info-700 transition-colors duration-fast"
        >
          {t('unknownFooter').replace('{count}', String(unknownCount))}
        </button>
      )}
    </div>
  )
}
