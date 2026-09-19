/**
 * 派生统计：摘要计数、公司进展、漏斗。
 *
 * 与摘要条、首页卡片**共用同一份实现**（AC-32），避免两处口径漂移。
 */
import type { JobProcess, JobStage } from '../../types/recruit'
import { arriveAt, toUTCms } from './time'
import { computeUrgency } from './urgency'

/** 环节推进权重（越大越靠后）。talk / other 不参与进展比较。 */
const STAGE_RANK: Record<JobStage, number> = {
  apply: 1,
  assessment: 2,
  written: 3,
  interview: 4,
  offer: 5,
  talk: 0,
  other: 0,
}

/** 环节展示顺序（漏斗从左到右）。 */
export const STAGE_ORDER: JobStage[] = ['apply', 'assessment', 'written', 'interview', 'offer']

/** 摘要条四类计数。 */
export interface SummaryCounts {
  today: number
  near: number
  overdue: number
  unknown: number
}

/** 统计四类告警数量（只数 pending）。 */
export function summaryCounts(
  jobs: JobProcess[],
  now: number,
  thresholdHours: number,
): SummaryCounts {
  const out: SummaryCounts = { today: 0, near: 0, overdue: 0, unknown: 0 }
  for (const j of jobs) {
    switch (computeUrgency(j, now, thresholdHours)) {
      case 'today':
        out.today++
        break
      case 'near':
        out.near++
        break
      case 'overdue':
        out.overdue++
        break
      case 'unknown':
        out.unknown++
        break
      default:
        break
    }
  }
  return out
}

/** 已过期的 pending 条目（过期横幅用）。 */
export function overdueJobs(jobs: JobProcess[], now: number, thresholdHours: number): JobProcess[] {
  return jobs.filter((j) => computeUrgency(j, now, thresholdHours) === 'overdue')
}

/** 公司进展。 */
export interface CompanyProgress {
  company_norm: string
  /** 展示名（取最新条目的 company） */
  name: string
  stage: JobStage
  round_no: number
  /** 该公司下时间最新的条目 */
  latest: JobProcess
  total: number
  pending: number
}

/**
 * 按公司聚合进展：取该公司**时间最新**条目的环节作为当前进展。
 * 无时间的条目排在最后（排序时视为最小）。
 */
export function companyProgress(jobs: JobProcess[]): CompanyProgress[] {
  const map = new Map<string, CompanyProgress>()
  for (const j of jobs) {
    const cur = map.get(j.company_norm)
    if (!cur) {
      map.set(j.company_norm, {
        company_norm: j.company_norm,
        name: j.company,
        stage: j.stage,
        round_no: j.round_no,
        latest: j,
        total: 1,
        pending: j.status === 'pending' ? 1 : 0,
      })
      continue
    }
    cur.total++
    if (j.status === 'pending') cur.pending++
    const a = toUTCms(arriveAt(cur.latest)) ?? -Infinity
    const b = toUTCms(arriveAt(j)) ?? -Infinity
    if (b > a || (b === a && STAGE_RANK[j.stage] > STAGE_RANK[cur.latest.stage])) {
      cur.latest = j
      cur.stage = j.stage
      cur.round_no = j.round_no
      cur.name = j.company || cur.name
    }
  }
  return [...map.values()].sort((x, y) => y.total - x.total || x.name.localeCompare(y.name))
}

/** 漏斗（按 company_norm 去重的「家数」）。 */
export interface Funnel {
  applied: number
  assessment: number
  written: number
  interview: number
  offer: number
  missed: number
}

/** 统计各环节到达家数 + 已错过条数。 */
export function funnel(jobs: JobProcess[]): Funnel {
  const reached = new Map<string, Set<JobStage>>()
  let missed = 0
  for (const j of jobs) {
    if (j.status === 'missed') missed++
    let set = reached.get(j.company_norm)
    if (!set) {
      set = new Set()
      reached.set(j.company_norm, set)
    }
    set.add(j.stage)
  }
  const out: Funnel = {
    applied: 0,
    assessment: 0,
    written: 0,
    interview: 0,
    offer: 0,
    missed,
  }
  for (const set of reached.values()) {
    if (set.has('apply')) out.applied++
    if (set.has('assessment')) out.assessment++
    if (set.has('written')) out.written++
    if (set.has('interview')) out.interview++
    if (set.has('offer')) out.offer++
  }
  return out
}

/** 公司下拉选项（去重后按名排序）。 */
export function companyOptions(jobs: JobProcess[]): Array<{ norm: string; name: string }> {
  const map = new Map<string, string>()
  for (const j of jobs) if (!map.has(j.company_norm)) map.set(j.company_norm, j.company)
  return [...map.entries()]
    .map(([norm, name]) => ({ norm, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
}
