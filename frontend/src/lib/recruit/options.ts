/**
 * 枚举 → i18n key 映射与下拉选项构造。
 *
 * 只存 **key**，不存成品文案：这里拿不到响应式语言，写死中文会在切英文时残留。
 * 组件里用 `useT()` 取词后再 `optionsOf()`。
 */
import type { JobKind, JobSource, JobStage, JobStatus } from '../../types/recruit'

export const STAGE_KEYS: Record<JobStage, string> = {
  apply: 'stageApply',
  assessment: 'stageAssessment',
  written: 'stageWritten',
  interview: 'stageInterview',
  talk: 'stageTalk',
  offer: 'stageOffer',
  other: 'stageOther',
}

export const STATUS_KEYS: Record<JobStatus, string> = {
  pending: 'statusPending',
  done: 'statusDone',
  dropped: 'statusDropped',
  missed: 'statusMissed',
  archived: 'statusArchived',
}

export const SOURCE_KEYS: Record<JobSource, string> = {
  manual: 'sourceManual',
  email: 'sourceEmail',
  sms: 'sourceSms',
  other: 'sourceOther',
}

/** 顺序即下拉展示顺序。 */
export const STAGE_LIST: JobStage[] = [
  'apply',
  'assessment',
  'written',
  'interview',
  'talk',
  'offer',
  'other',
]
/** 顺序即下拉展示顺序（通知环节口径的全量 5 态，筛选器等处仍用此表）。 */
export const STATUS_LIST: JobStatus[] = ['pending', 'done', 'dropped', 'missed', 'archived']
export const SOURCE_LIST: JobSource[] = ['manual', 'email', 'sms', 'other']

/**
 * 投递（apply）记录适用的状态子集：待处理 / 已投递 / 已放弃 / 已错过。
 *
 * - 不含 `archived`（已归档）：归档是人工整理态，不是投递进度；
 * - 「已过期」**从来不是处理状态**（那是时间告警 urgency，见 `urgencyOverdue`），
 *   任何环节都不把它作为状态选项——且投递记录整体不参与 urgency 告警
 *   （见 `urgency.computeUrgency` 早退），卡片上统一展示「已投递」。
 */
export const APPLY_STATUS_LIST: JobStatus[] = ['pending', 'done', 'dropped', 'missed']

/** 通知（notice）记录适用的状态子集 = 全量 5 态（存储枚举，历史数据兼容）。 */
export const NOTICE_STATUS_LIST: JobStatus[] = ['pending', 'done', 'dropped', 'missed', 'archived']

/** 按类型取状态下拉列表（顺序即展示顺序）。 */
export function statusListOf(kind: JobKind): JobStatus[] {
  return kind === 'apply' ? APPLY_STATUS_LIST : NOTICE_STATUS_LIST
}

/** 投递环节的差异化状态文案：`done` = 已投递（投递进度），而非通知口径的「已完成」。 */
const APPLY_STATUS_LABEL_OVERRIDES: Partial<Record<JobStatus, string>> = {
  done: 'statusApplied',
}

/**
 * 状态展示 key：按环节派生（投递的 `done` → `statusApplied`）。
 *
 * 列表 chip、卡片操作 tooltip、表单下拉共用，保证同一记录各处文案一致。
 */
export function statusLabelKey(status: JobStatus, kind: JobKind): string {
  if (kind === 'apply') {
    return APPLY_STATUS_LABEL_OVERRIDES[status] ?? STATUS_KEYS[status]
  }
  return STATUS_KEYS[status]
}

/**
 * 状态下拉选项：按类型取子集 + 差异化文案。
 *
 * `extra` 供编辑态回显历史越界值（如旧数据里的「投递 + 已归档」）——
 * 追加到选项末尾，保证 CustomSelect 能显示当前值，用户可改回合法状态。
 */
export function statusOptionsOf(
  t: (key: string) => string,
  kind: JobKind,
  extra?: JobStatus,
): Array<{ value: string; label: string }> {
  const list = statusListOf(kind)
  const values = extra && !list.includes(extra) ? [...list, extra] : list
  return values.map((v) => ({ value: v, label: t(statusLabelKey(v, kind)) }))
}

export function kindOfStage(stage: JobStage): JobKind {
  return stage === 'apply' ? 'apply' : 'notice'
}

/** 把 key 表 + 顺序表转成 CustomSelect 的 options。 */
export function optionsOf<T extends string>(
  t: (key: string) => string,
  list: T[],
  keys: Record<T, string>,
): Array<{ value: string; label: string }> {
  return list.map((v) => ({ value: v, label: t(keys[v]) }))
}
