import { useEffect, useMemo, useState } from 'react'
import { Undo2 } from 'lucide-react'
import { useT } from '../../lib/i18n'
import { useRecruitStore } from '../../stores/recruitStore'
import { buildList, buildTimeline } from '../../lib/recruit/grouping'
import { companyOptions, overdueJobs, summaryCounts } from '../../lib/recruit/stats'
import { optionsOf, KIND_LIST, KIND_KEYS, SOURCE_LIST, SOURCE_KEYS, STAGE_LIST, STAGE_KEYS, STATUS_LIST, STATUS_KEYS } from '../../lib/recruit/options'
import { MultiSelect } from '../ui/MultiSelect'
import { JobSummaryBar } from './JobSummaryBar'
import { JobToolbar } from './JobToolbar'
import { JobListView } from './JobListView'
import { JobTimeline } from './JobTimeline'
import { JobCalendar } from './JobCalendar'
import { JobEntryDialog } from './JobEntryDialog'
import { JobDuplicateDialog } from './JobDuplicateDialog'
import { JobSettingsDialog } from './JobSettingsDialog'
import { CompanyPanel } from './CompanyPanel'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import type { DuplicateCandidate, JobProcess, JobProcessDraft } from '../../types/recruit'

/**
 * 求职进程面板（首页 Tab【求职进程】的子视图）。
 *
 * 职责边界：只做**编排**——加载、跨日重算、筛选派发、弹层挂载；
 * 所有派生（排序 / 分组 / 统计）走 `lib/recruit/*` 纯函数，不进 store。
 *
 * ⚠ 这里**不是路由页面**：没有自己的 header / 返回按钮，标题由 TabRail 提供，
 * 外层 `main` 负责滚动，刷新后随首页回到【我的简历】。不要给它加独立路由。
 */
export function RecruitPanel() {
  const t = useT()
  const jobs = useRecruitStore((s) => s.jobs)
  const loading = useRecruitStore((s) => s.loading)
  const error = useRecruitStore((s) => s.error)
  const now = useRecruitStore((s) => s.now)
  const settings = useRecruitStore((s) => s.settings)
  const filters = useRecruitStore((s) => s.filters)
  const view = useRecruitStore((s) => s.view)
  const undo = useRecruitStore((s) => s.undo)
  const ensureLoaded = useRecruitStore((s) => s.ensureLoaded)
  const tick = useRecruitStore((s) => s.tick)
  const setView = useRecruitStore((s) => s.setView)
  const setFilters = useRecruitStore((s) => s.setFilters)
  const resetFilters = useRecruitStore((s) => s.resetFilters)
  const setStatus = useRecruitStore((s) => s.setStatus)
  const remove = useRecruitStore((s) => s.remove)
  const undoRemove = useRecruitStore((s) => s.undoRemove)
  const create = useRecruitStore((s) => s.create)
  const merge = useRecruitStore((s) => s.merge)

  const [editing, setEditing] = useState<JobProcess | null>(null)
  const [entryOpen, setEntryOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<JobProcess | null>(null)
  const [duplicate, setDuplicate] = useState<{
    draft: JobProcessDraft
    candidate: DuplicateCandidate
  } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [companyNorm, setCompanyNorm] = useState<string | null>(null)

  // 进入 Tab 时确保已加载（幂等）；每分钟推进 now（跨日自动重算「今日/临近/已过期」）
  useEffect(() => {
    ensureLoaded()
    const id = window.setInterval(() => tick(), 60_000)
    return () => window.clearInterval(id)
  }, [ensureLoaded, tick])

  const threshold = settings.nearThresholdHours
  const ctx = useMemo(
    () => ({ now, thresholdHours: threshold, includeRaw: settings.saveRawText }),
    [now, threshold, settings.saveRawText],
  )

  const counts = useMemo(() => summaryCounts(jobs, now, threshold), [jobs, now, threshold])
  const overdue = useMemo(() => overdueJobs(jobs, now, threshold), [jobs, now, threshold])
  const list = useMemo(() => buildList(jobs, filters, ctx), [jobs, filters, ctx])
  const timeline = useMemo(() => buildTimeline(jobs, filters, ctx), [jobs, filters, ctx])
  const companies = useMemo(() => companyOptions(jobs), [jobs])
  const unknownJobs = useMemo(
    () => list.active.concat(list.archived).filter((j) => !j.event_time && !j.deadline),
    [list],
  )
  const timedJobs = useMemo(
    () => list.active.concat(list.archived).filter((j) => j.event_time || j.deadline),
    [list],
  )

  /** 摘要条点击：切换告警快捷筛选（再点一次取消）。 */
  const pickUrgency = (u: (typeof filters.urgencies)[number]) => {
    const on = filters.urgencies.includes(u)
    setFilters({ urgencies: on ? [] : [u], statuses: on ? ['pending'] : [] })
  }

  const handleDelete = async () => {
    if (!pendingDelete) return
    const target = pendingDelete
    setPendingDelete(null)
    // 保留子通知：只解关联，不级联删除（避免误删整条投递链）
    await remove(target.id, false)
  }

  const childCount = pendingDelete ? jobs.filter((j) => j.parent_id === pendingDelete.id).length : 0

  const cardHandlers = {
    onSetStatus: (id: string, status: JobProcess['status']) => void setStatus(id, status),
    onOpenLink: (url: string) => window.open(url, '_blank', 'noopener,noreferrer'),
    onOpenCompany: (norm: string) => setCompanyNorm(norm),
    onEdit: (job: JobProcess) => {
      setEditing(job)
      setEntryOpen(true)
    },
    onDelete: (job: JobProcess) => setPendingDelete(job),
    now,
    thresholdHours: threshold,
  }

  // 「干净」基线 = 全字段为空（与 resetFilters 的 emptyFilters 对齐）。
  // 初始视图 statuses=['pending'] 是一个生效筛选，因此清除按钮会正常出现。
  const filterDirty =
    filters.kinds.length > 0 ||
    filters.stages.length > 0 ||
    filters.sources.length > 0 ||
    filters.companies.length > 0 ||
    filters.urgencies.length > 0 ||
    filters.keyword.length > 0 ||
    filters.statuses.length > 0

  return (
    <div className="relative flex flex-col gap-3">
      <JobSummaryBar counts={counts} active={filters.urgencies[0] ?? null} onPick={pickUrgency} />

      {overdue.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-danger-600/8 border border-hairline border-danger-200">
          <span className="text-sm text-danger-600 flex-1 min-w-0">
            {t('overdueBanner').replace('{count}', String(overdue.length))}
          </span>
          <button
            type="button"
            onClick={() => {
              for (const j of overdue) void setStatus(j.id, 'missed')
            }}
            className="btn btn-secondary h-ctl-sm text-xs"
          >
            {t('markMissedAll')}
          </button>
        </div>
      )}

      <JobToolbar
        view={view}
        onView={setView}
        keyword={filters.keyword}
        onKeyword={(v) => setFilters({ keyword: v })}
        onAdd={() => {
          setEditing(null)
          setEntryOpen(true)
        }}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* 筛选行：多选下拉，空＝不限 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-[120px]">
          <MultiSelect
            value={filters.kinds}
            onChange={(v) => setFilters({ kinds: v as JobProcess['kind'][] })}
            options={optionsOf(t, KIND_LIST, KIND_KEYS)}
            placeholder={t('filterKind')}
          />
        </div>
        <div className="w-[140px]">
          <MultiSelect
            value={filters.companies}
            onChange={(v) => setFilters({ companies: v })}
            options={companies.map((c) => ({ value: c.norm, label: c.name }))}
            placeholder={t('filterCompany')}
          />
        </div>
        <div className="w-[140px]">
          <MultiSelect
            value={filters.stages}
            onChange={(v) => setFilters({ stages: v as JobProcess['stage'][] })}
            options={optionsOf(t, STAGE_LIST, STAGE_KEYS)}
            placeholder={t('filterStage')}
          />
        </div>
        <div className="w-[140px]">
          <MultiSelect
            value={filters.statuses}
            onChange={(v) => setFilters({ statuses: v as JobProcess['status'][] })}
            options={optionsOf(t, STATUS_LIST, STATUS_KEYS)}
            placeholder={t('filterStatus')}
          />
        </div>
        <div className="w-[120px]">
          <MultiSelect
            value={filters.sources}
            onChange={(v) => setFilters({ sources: v as JobProcess['source'][] })}
            options={optionsOf(t, SOURCE_LIST, SOURCE_KEYS)}
            placeholder={t('filterSource')}
          />
        </div>
        {filterDirty && (
          <button
            type="button"
            onClick={resetFilters}
            className="h-ctl-lg px-3 text-xs text-primary-600 hover:text-primary-700 transition-colors duration-fast"
          >
            {t('clearFilters')}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-danger-600">{error}</p>}

      <div className="mt-1 pb-4">
        {!loading && error ? (
          <p className="text-sm text-danger-600 py-8 text-center">{t('recruitLoadFailed')}</p>
        ) : loading && jobs.length === 0 ? (
          <p className="text-sm text-surface-400 py-8 text-center">{t('recruitLoading')}</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-surface-400 py-8 text-center">{t('recruitEmpty')}</p>
        ) : view === 'list' ? (
          list.active.length === 0 && list.archived.length === 0 ? (
            <p className="text-sm text-surface-400 py-8 text-center">{t('noMatchJob')}</p>
          ) : (
            <JobListView active={list.active} archived={list.archived} {...cardHandlers} />
          )
        ) : view === 'timeline' ? (
          <JobTimeline groups={timeline} unknown={unknownJobs} {...cardHandlers} />
        ) : (
          <JobCalendar
            jobs={timedJobs}
            unknownCount={unknownJobs.length}
            onPickUnknown={() => setFilters({ urgencies: ['unknown'], statuses: [] })}
            {...cardHandlers}
          />
        )}
      </div>

      {companyNorm && (
        <CompanyPanel norm={companyNorm} onClose={() => setCompanyNorm(null)} />
      )}

      {entryOpen && (
        <JobEntryDialog
          initial={editing ?? undefined}
          onDuplicate={(draft, candidate) => setDuplicate({ draft, candidate })}
          onClose={() => {
            setEntryOpen(false)
            setEditing(null)
          }}
        />
      )}

      {duplicate && (
        <JobDuplicateDialog
          candidate={duplicate.candidate}
          onUpdate={() => {
            const { draft, candidate } = duplicate
            const patch = Object.fromEntries(
              candidate.diffs.map((d) => [d.field, (draft as Record<string, unknown>)[d.field]]),
            )
            setDuplicate(null)
            void merge(candidate.job.id, patch)
          }}
          onKeepBoth={() => {
            const { draft } = duplicate
            setDuplicate(null)
            void create(draft, 'new')
          }}
          onCancel={() => setDuplicate(null)}
        />
      )}

      {settingsOpen && <JobSettingsDialog onClose={() => setSettingsOpen(false)} />}

      <ConfirmDialog
        open={pendingDelete !== null}
        danger
        title={t('jobDeleteConfirm')}
        description={
          childCount > 0 ? t('deleteCascadeHint').replace('{count}', String(childCount)) : undefined
        }
        confirmText={childCount > 0 ? t('deleteKeepNotices') : undefined}
        onConfirm={() => void handleDelete()}
        onCancel={() => setPendingDelete(null)}
      />

      {/* 删除撤销：内存级 5 秒，不做持久化 */}
      {undo && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] glass glass-card rounded-lg px-4 py-2 flex items-center gap-3 animate-dropdown-enter">
          <span className="text-sm text-surface-600 truncate">{t('undoHint')}</span>
          <button
            type="button"
            onClick={() => void undoRemove()}
            className="btn btn-secondary h-ctl-sm text-xs"
          >
            <Undo2 className="size-icon-sm" strokeWidth={2} />
            {t('undo')}
          </button>
        </div>
      )}
    </div>
  )
}
