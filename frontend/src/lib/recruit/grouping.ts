/**
 * 过滤 / 排序 / 分区 / 分组（求职进程列表、时间轴、日历共用）。
 *
 * 全部是**纯函数**：不进 store、不缓存，由组件用 useMemo 调。
 * 派生值（临近标签等）在渲染时按同一个 `now` 计算，保证整屏一致。
 */
import type { JobProcess, JobFilters } from '../../types/recruit'
import { arriveAt, dayKey, toUTCms } from './time'
import { computeUrgency, urgencyRank } from './urgency'

/** 过滤上下文：告警标签是**运行时派生**的，必须带 now 与阈值才能判定。 */
export interface FilterCtx {
  now: number
  thresholdHours: number
  /** 关键词是否纳入通知原文（仅当保存原文开关打开时为 true） */
  includeRaw?: boolean
}

/** 归档态：非 pending 的终态都进归档区。 */
export function isArchived(job: JobProcess): boolean {
  return job.status !== 'pending'
}

/** 关键词是否命中（公司/岗位/备注/链接/地点；原文仅当开关打开时纳入）。 */
function matchKeyword(job: JobProcess, kw: string, includeRaw: boolean): boolean {
  const q = kw.trim().toLowerCase()
  if (!q) return true
  const hay = [job.company, job.position, job.note, job.link, job.location]
  if (includeRaw) hay.push(job.raw_text ?? '')
  return hay.some((v) => (v ?? '').toLowerCase().includes(q))
}

/** 按筛选条件过滤。空数组＝该维度不限；`urgencies` 为空表示不限告警。 */
export function filterJobs(jobs: JobProcess[], filters: JobFilters, ctx: FilterCtx): JobProcess[] {
  const includeRaw = ctx.includeRaw === true
  return jobs.filter((j) => {
    if (filters.companies.length && !filters.companies.includes(j.company_norm)) return false
    if (filters.stages.length && !filters.stages.includes(j.stage)) return false
    if (filters.statuses.length && !filters.statuses.includes(j.status)) return false
    if (filters.sources.length && !filters.sources.includes(j.source)) return false
    if (filters.urgencies.length) {
      const u = computeUrgency(j, ctx.now, ctx.thresholdHours)
      if (!filters.urgencies.includes(u)) return false
    }
    if (!matchKeyword(j, filters.keyword, includeRaw)) return false
    return true
  })
}

/**
 * 排序：到达时间升序（临近在前）→ 同档内按临近等级 → 无时间置底 → created_at 降序。
 *
 * 「到达时间升序」与「临近等级」并不完全等价（已过期的在时间上是最小却排最前，
 * 这正好符合「最需要处理」的直觉），故先按等级再按时间。
 */
export function sortJobs(jobs: JobProcess[], now: number, thresholdHours: number): JobProcess[] {
  return [...jobs].sort((a, b) => {
    const ra = urgencyRank(computeUrgency(a, now, thresholdHours))
    const rb = urgencyRank(computeUrgency(b, now, thresholdHours))
    if (ra !== rb) return ra - rb
    const ta = toUTCms(arriveAt(a))
    const tb = toUTCms(arriveAt(b))
    if (ta == null && tb == null) return b.created_at.localeCompare(a.created_at)
    if (ta == null) return 1
    if (tb == null) return -1
    if (ta !== tb) return ta - tb
    return b.created_at.localeCompare(a.created_at)
  })
}

export interface ListSections {
  /** 待处理（status === 'pending'） */
  active: JobProcess[]
  /** 已完成/已放弃/已错过/已归档 */
  archived: JobProcess[]
}

/** 过滤 + 排序 + 分区。 */
export function buildList(
  jobs: JobProcess[],
  filters: JobFilters,
  ctx: FilterCtx,
): ListSections {
  const filtered = filterJobs(jobs, filters, ctx)
  const sorted = sortJobs(filtered, ctx.now, ctx.thresholdHours)
  return {
    active: sorted.filter((j) => !isArchived(j)),
    archived: sorted.filter(isArchived),
  }
}

export interface TimelineGroup {
  /** `YYYY-MM-DD` */
  day: string
  jobs: JobProcess[]
}

/**
 * 时间轴按天分组。
 *
 * 只收有时间的条目；无时间的条目由调用方单独渲染「时间待定」区，
 * 不混进日期轴里（否则会伪造出一个不存在的日期节点）。
 */
export function buildTimeline(jobs: JobProcess[], filters: JobFilters, ctx: FilterCtx): TimelineGroup[] {
  const filtered = filterJobs(jobs, filters, ctx)
  const buckets = new Map<string, JobProcess[]>()
  for (const j of filtered) {
    const ms = toUTCms(arriveAt(j))
    if (ms == null) continue
    const k = dayKey(ms)
    const arr = buckets.get(k)
    if (arr) arr.push(j)
    else buckets.set(k, [j])
  }
  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, list]) => ({ day, jobs: sortJobs(list, ctx.now, ctx.thresholdHours) }))
}

/** 日历某月的格子数据（1 号前的补白为 null）。 */
export interface CalendarCell {
  /** 该格日期 `YYYY-MM-DD` */
  day: string
  /** 月内日序号 1..31 */
  date: number
  /** 是否属于目标月（false = 上个月补白/下个月补白） */
  inMonth: boolean
  jobs: JobProcess[]
}

/**
 * 生成月视图 6×7 网格（固定 42 格，避免切月时高度跳动）。
 * 周一为首列（国内习惯）。
 */
export function buildCalendar(jobs: JobProcess[], year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1)
  // getDay(): 0=周日；转成周一为 0
  const lead = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - lead)
  const cells: CalendarCell[] = []
  const byDay = new Map<string, JobProcess[]>()
  for (const j of jobs) {
    const ms = toUTCms(arriveAt(j))
    if (ms == null) continue
    const k = dayKey(ms)
    const arr = byDay.get(k)
    if (arr) arr.push(j)
    else byDay.set(k, [j])
  }
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const k = dayKey(d)
    cells.push({
      day: k,
      date: d.getDate(),
      inMonth: d.getMonth() === month,
      jobs: byDay.get(k) ?? [],
    })
  }
  return cells
}
