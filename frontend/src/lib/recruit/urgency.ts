/**
 * 临近 / 过期标签计算（PRD §4.4）。
 *
 * 标签互斥，按 overdue > today > near > unknown > none 取最高优先级。
 * 只有 `pending` 条目参与告警——已归档/已完成的不该再打扰用户。
 *
 * **投递（apply）记录不参与告警**（2026-10-20 产品决策）：投递日期是既成事实
 * （"哪天投的"），不是要赶的截止线；过期 / 今日 / 临近只对时效性通知（面试、
 * 笔试、offer）成立。投递记录统一展示「已投递」状态消息（见 JobCard 徽章与
 * `options.statusLabelKey`），不渲染任何时间告警。
 *
 * 豁免落在本函数（单一来源）：卡片徽章 / 左侧色条、摘要条四类计数、过期横幅、
 * 告警快捷筛选、 urgency 排序随之全部排除投递记录，口径不会漂移。
 *
 * 注意：**过期不会自动改状态**（PRD 决策），只做视觉提示，
 * 是否「已错过」由用户自己确认后手动标记。
 */
import type { JobProcess, Urgency } from '../../types/recruit'
import { dayKey, toUTCms } from './time'
import { kindOfStage } from './options'

/** 标签的视觉映射。类名必须是**字面量**，否则 Tailwind 摇树会清掉。 */
export interface UrgencyMeta {
  urgency: Urgency
  /** 卡片左侧色条 */
  barClass: string
  /** 徽章文字色 */
  textClass: string
  /** 徽章底色 */
  chipClass: string
  /** i18n key；none 为空串（不渲染） */
  labelKey: string
  /** 是否需要在时间行加粗 */
  emphasize: boolean
}

const NONE: UrgencyMeta = {
  urgency: 'none',
  barClass: 'bg-transparent',
  textClass: 'text-surface-500',
  chipClass: '',
  labelKey: '',
  emphasize: false,
}

const METAS: Record<Exclude<Urgency, 'none'>, UrgencyMeta> = {
  overdue: {
    urgency: 'overdue',
    barClass: 'bg-danger-600',
    textClass: 'text-danger-600',
    chipClass: 'bg-danger-600/10',
    labelKey: 'urgencyOverdue',
    emphasize: true,
  },
  today: {
    urgency: 'today',
    barClass: 'bg-warning-600',
    textClass: 'text-warning-700',
    chipClass: 'bg-warning-600/12',
    labelKey: 'urgencyToday',
    emphasize: true,
  },
  near: {
    urgency: 'near',
    barClass: 'bg-warning-500',
    textClass: 'text-warning-600',
    chipClass: 'bg-warning-500/12',
    labelKey: 'urgencyNear',
    emphasize: false,
  },
  unknown: {
    urgency: 'unknown',
    barClass: 'bg-info-500',
    textClass: 'text-info-600',
    chipClass: 'bg-info-500/12',
    labelKey: 'urgencyUnknown',
    emphasize: false,
  },
}

/**
 * 告警判定的基准时间：**截止时间优先**。
 *
 * deadline 是用户要赶的线（报名 / 确认 / 提交截止），有它就以它判过期与临近；
 * 没有截止时间才回退举办时间 event_time（面试 / 笔试等的发生时间）。
 * 均空 → null（时间待定）。
 *
 * ⚠ 与 time.ts 的 `arriveAt`（event_time 优先）区分：那是日历分组 / 排序用的
 * 「展示时间」；告警语义必须以 deadline 为先。
 * ⚠ 投递（apply）记录整体不参与告警（见 computeUrgency 早退），本函数不会被执行到。
 */
function alertAt(job: Pick<JobProcess, 'event_time' | 'deadline'>): string | null {
  return job.deadline || job.event_time || null
}

/**
 * 计算条目的临近标签。
 *
 * @param now        当前 UTC 毫秒（由调用方统一注入，保证整屏一致）
 * @param threshold  临近阈值（小时），来自模块设置
 */
export function computeUrgency(job: JobProcess, now: number, thresholdHours: number): Urgency {
  if (job.status !== 'pending') return 'none'
  // 投递记录的日期是投递日期（既成事实），不构成"要赶的线"——不参与时间告警，
  // 状态消息统一为「已投递」（JobCard 渲染），避免把投递记录误判为"已过期"。
  if (kindOfStage(job.stage) === 'apply') return 'none'
  const at = alertAt(job)
  if (!at) return 'unknown'
  const ms = toUTCms(at)
  if (ms == null) return 'unknown'
  if (ms < now) return 'overdue'
  if (dayKey(ms) === dayKey(now)) return 'today'
  if (ms - now <= thresholdHours * 3_600_000) return 'near'
  return 'none'
}

/** 标签 → 视觉映射。 */
export function urgencyMeta(u: Urgency): UrgencyMeta {
  return u === 'none' ? NONE : METAS[u]
}

/** 便捷入口：算标签并一次拿到视觉映射。 */
export function jobUrgencyMeta(job: JobProcess, now: number, thresholdHours: number): UrgencyMeta {
  return urgencyMeta(computeUrgency(job, now, thresholdHours))
}

/** 排序优先级：过期最前，其次今日/临近，无时间置底。 */
export function urgencyRank(u: Urgency): number {
  switch (u) {
    case 'overdue':
      return 0
    case 'today':
      return 1
    case 'near':
      return 2
    case 'unknown':
      return 3
    default:
      return 4
  }
}
