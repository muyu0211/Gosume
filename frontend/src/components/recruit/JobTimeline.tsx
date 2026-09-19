import type { JobProcess, JobStatus } from '../../types/recruit'
import type { TimelineGroup } from '../../lib/recruit/grouping'
import { useT } from '../../lib/i18n'
import { JobCard } from './JobCard'
import { fmtDateShort, fmtRelative } from '../../lib/recruit/time'

interface Props {
  groups: TimelineGroup[]
  unknown: JobProcess[]
  now: number
  thresholdHours: number
  onEdit: (job: JobProcess) => void
  onDelete: (job: JobProcess) => void
  onSetStatus: (id: string, status: JobStatus) => void
  onOpenLink: (url: string) => void
  onOpenCompany: (norm: string) => void
}

/**
 * 时间轴视图：按天分组，组头为日期 + 相对日文案。
 *
 * 无时间的条目放在末尾独立区块——混进日期轴会伪造出一个不存在的日期节点。
 */
export function JobTimeline({
  groups,
  unknown,
  now,
  thresholdHours,
  onEdit,
  onDelete,
  onSetStatus,
  onOpenLink,
  onOpenCompany,
}: Props) {
  const t = useT()
  const handlers = { now, thresholdHours, onEdit, onDelete, onSetStatus, onOpenLink, onOpenCompany }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => {
        const rel = fmtRelative(`${g.day}T00:00:00`, now)
        const relLabel = rel ? (rel.key === 'relDate' ? rel.date : t(rel.key).replace('{count}', String(rel.count))) : ''
        return (
          <section key={g.day}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-surface-700">{fmtDateShort(g.day, now)}</span>
              {relLabel && <span className="text-xs text-surface-400">{relLabel}</span>}
              <span className="text-xs text-surface-400">· {g.jobs.length}</span>
            </div>
            <div className="flex flex-col gap-2 pl-3 border-l border-hairline border-surface-300">
              {g.jobs.map((job) => (
                <JobCard key={job.id} job={job} {...handlers} />
              ))}
            </div>
          </section>
        )
      })}

      {unknown.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-surface-700">{t('urgencyUnknown')}</span>
            <span className="text-xs text-surface-400">· {unknown.length}</span>
          </div>
          <div className="flex flex-col gap-2 pl-3 border-l border-hairline border-surface-300">
            {unknown.map((job) => (
              <JobCard key={job.id} job={job} {...handlers} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
