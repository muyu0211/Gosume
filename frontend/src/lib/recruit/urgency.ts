/**
 * 临近 / 过期标签计算（PRD §4.4）。
 *
 * 标签互斥，按 overdue > today > near > unknown > none 取最高优先级。
 * 只有 `pending` 条目参与告警——已归档/已完成的不该再打扰用户。
 *
 * 注意：**过期不会自动改状态**（PRD 决策），只做视觉提示，
 * 是否「已错过」由用户自己确认后手动标记。
 */
import type { JobProcess, Urgency } from '../../types/recruit'
import { arriveAt, dayKey, toUTCms } from './time'

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
 * 计算条目的临近标签。
 *
 * @param now        当前 UTC 毫秒（由调用方统一注入，保证整屏一致）
 * @param threshold  临近阈值（小时），来自模块设置
 */
export function computeUrgency(job: JobProcess, now: number, thresholdHours: number): Urgency {
  if (job.status !== 'pending') return 'none'
  const at = arriveAt(job)
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
