/**
 * 枚举 → i18n key 映射与下拉选项构造。
 *
 * 只存 **key**，不存成品文案：这里拿不到响应式语言，写死中文会在切英文时残留。
 * 组件里用 `useT()` 取词后再 `optionsOf()`。
 */
import type { JobKind, JobSource, JobStage, JobStatus } from '../../types/recruit'

export const KIND_KEYS: Record<JobKind, string> = {
  apply: 'kindApply',
  notice: 'kindNotice',
}

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
export const KIND_LIST: JobKind[] = ['apply', 'notice']
export const STAGE_LIST: JobStage[] = [
  'apply',
  'assessment',
  'written',
  'interview',
  'talk',
  'offer',
  'other',
]
export const STATUS_LIST: JobStatus[] = ['pending', 'done', 'dropped', 'missed', 'archived']
export const SOURCE_LIST: JobSource[] = ['manual', 'email', 'sms', 'other']

/** 把 key 表 + 顺序表转成 CustomSelect 的 options。 */
export function optionsOf<T extends string>(
  t: (key: string) => string,
  list: T[],
  keys: Record<T, string>,
): Array<{ value: string; label: string }> {
  return list.map((v) => ({ value: v, label: t(keys[v]) }))
}
