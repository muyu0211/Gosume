import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { JobProcess, JobStatus } from '../../types/recruit'
import { useT } from '../../lib/i18n'
import { JobCard } from './JobCard'

interface Props {
  active: JobProcess[]
  archived: JobProcess[]
  now: number
  thresholdHours: number
  onEdit: (job: JobProcess) => void
  onDelete: (job: JobProcess) => void
  onSetStatus: (id: string, status: JobStatus) => void
  onOpenLink: (url: string) => void
  onOpenCompany: (norm: string) => void
}

/**
 * 列表视图：活动区 + 归档区。
 *
 * 归档区默认折叠（PRD §4.2），折叠状态是**纯 UI 本地状态**，不进 store、不持久化——
 * 下次打开回到折叠态更符合「归档即收起」的直觉。
 */
export function JobListView({
  active,
  archived,
  now,
  thresholdHours,
  onEdit,
  onDelete,
  onSetStatus,
  onOpenLink,
  onOpenCompany,
}: Props) {
  const t = useT()
  const [archivedOpen, setArchivedOpen] = useState(false)

  const handlers = { now, thresholdHours, onEdit, onDelete, onSetStatus, onOpenLink, onOpenCompany }

  return (
    <div className="flex flex-col gap-2">
      {active.map((job) => (
        <JobCard key={job.id} job={job} {...handlers} />
      ))}

      {archived.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setArchivedOpen((v) => !v)}
            aria-expanded={archivedOpen}
            className="flex items-center gap-1.5 h-ctl-md px-2 rounded-md text-xs text-surface-500 hover:text-surface-700 hover:bg-surface-600/6 transition-colors duration-fast"
          >
            <ChevronDown
              className={`size-icon-sm transition-transform duration-fast ${archivedOpen ? '' : '-rotate-90'}`}
              strokeWidth={1.75}
            />
            {t('archiveSection').replace('{count}', String(archived.length))}
          </button>
          {archivedOpen && (
            <div className="mt-2 flex flex-col gap-2">
              {archived.map((job) => (
                <JobCard key={job.id} job={job} {...handlers} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
