import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { JobProcess, JobStatus } from '../../types/recruit'
import { useT } from '../../lib/i18n'
import { buildCalendar } from '../../lib/recruit/grouping'
import { dayKey } from '../../lib/recruit/time'
import { jobUrgencyMeta } from '../../lib/recruit/urgency'
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

/**
 * 日历月视图（自绘 7 列，不引第三方）。
 *
 * - 固定 42 格，切月时高度不跳动；
 * - 当天格用主色浅底；有条目渲染色点徽章（最多 3 个 + `+N`）；
 * - 点击某天在下方抽屉列出当日条目（固定高度滚动区，**不叠 height 过渡**）。
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
  const base = new Date(now)
  const [cursor, setCursor] = useState({ year: base.getFullYear(), month: base.getMonth() })
  const [selected, setSelected] = useState<string>(dayKey(now))

  const cells = useMemo(() => buildCalendar(jobs, cursor.year, cursor.month), [jobs, cursor])
  const todayKey = dayKey(now)
  const selectedJobs = useMemo(
    () => jobs.filter((j) => (j.event_time ?? j.deadline)?.slice(0, 10) === selected.slice(0, 10)),
    [jobs, selected],
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
          const isSel = cell.day === selected
          const shown = cell.jobs.slice(0, 3)
          const rest = cell.jobs.length - shown.length
          return (
            <button
              key={cell.day}
              type="button"
              onClick={() => setSelected(cell.day)}
              className={`aspect-square min-h-[64px] rounded-md p-1 flex flex-col items-start gap-1 transition-colors duration-fast ${
                isSel
                  ? 'bg-primary-600/12'
                  : isToday
                    ? 'bg-primary-600/6'
                    : 'hover:bg-surface-600/6'
              } ${cell.inMonth ? '' : 'opacity-40'}`}
            >
              <span
                className={`text-xs tabular-nums ${isToday ? 'text-primary-700 font-semibold' : 'text-surface-500'}`}
              >
                {cell.date}
              </span>
              <div className="flex flex-col gap-0.5 w-full">
                {shown.map((j) => (
                  <span
                    key={j.id}
                    className={`h-1 w-full rounded-full ${jobUrgencyMeta(j, now, thresholdHours).barClass}`}
                  />
                ))}
                {rest > 0 && <span className="text-[10px] text-surface-400">+{rest}</span>}
              </div>
            </button>
          )
        })}
      </div>

      {/* 当日抽屉：固定高度滚动区 */}
      <div className="mt-1">
        <div className="text-xs text-surface-500 mb-2">{selected}</div>
        <div className="max-h-[280px] overflow-auto flex flex-col gap-2">
          {selectedJobs.length === 0 ? (
            <p className="text-sm text-surface-400 py-4 text-center">{t('noMatchJob')}</p>
          ) : (
            selectedJobs.map((job) => (
              <JobCard key={job.id} job={job} {...handlers} />
            ))
          )}
        </div>
      </div>

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
