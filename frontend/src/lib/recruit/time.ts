/**
 * 时间工具（求职进程模块专用）。
 *
 * 项目未引入 dayjs / date-fns（不新增依赖），这里自研最小集合。
 *
 * 两条硬规则：
 * 1. **存储与比较一律 RFC3339 带偏移字符串 → 转 UTC 毫秒**：本地时间戳直接比大小
 *    会在跨时区/夏令时下出错，排序与过期判定必须走 `toUTCms`。
 * 2. **脏数据不得抛错**：后端返回的 event_time 可能是空串或非法值，解析失败统一
 *    返回 null，按「时间待定」处理，避免整页白屏。
 */
import type { JobProcess } from '../../types/recruit'

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** 解析 RFC3339（带偏移）为 Date；失败返回 null。 */
export function parseRFC3339(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 转 UTC 毫秒；失败返回 null（调用方按「无时间」处理）。 */
export function toUTCms(s: string | null | undefined): number | null {
  if (!s) return null
  const ms = new Date(s).getTime()
  return Number.isNaN(ms) ? null : ms
}

/**
 * 条目用于排序/告警的「到达时间」：event_time ?? deadline。
 * 均空 → null（时间待定）。
 */
export function arriveAt(job: Pick<JobProcess, 'event_time' | 'deadline'>): string | null {
  return job.event_time || job.deadline || null
}

/** 本地日键 `YYYY-MM-DD`（用于按天分组与跨日判定）。 */
export function dayKey(v: Date | number): string {
  const d = typeof v === 'number' ? new Date(v) : v
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 两个本地时刻是否同一天。 */
export function isSameDay(a: number, b: number): boolean {
  return dayKey(a) === dayKey(b)
}

/** 本地 Date → RFC3339 带偏移字符串（保留本地时区，不用 toISOString 的 UTC）。 */
export function toRFC3339Local(d: Date, opts?: { allDay?: boolean }): string {
  const off = -d.getTimezoneOffset() // 分钟，东为正
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  const hh = opts?.allDay ? '00' : pad2(d.getHours())
  const mm = opts?.allDay ? '00' : pad2(d.getMinutes())
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${hh}:${mm}:00${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
  )
}

/** `<input type="date">` + `<input type="time">` 的值合成 RFC3339；日期为空返回 null。 */
export function composeRFC3339(date: string, time?: string, allDay?: boolean): string | null {
  if (!date) return null
  const [y, m, d] = date.split('-').map((x) => Number.parseInt(x, 10))
  if (!y || !m || !d) return null
  const hhmm = time && /^\d{2}:\d{2}$/.test(time) ? time : '00:00'
  const [hh, mi] = hhmm.split(':').map((x) => Number.parseInt(x, 10))
  return toRFC3339Local(new Date(y, m - 1, d, allDay ? 0 : hh, allDay ? 0 : mi, 0), { allDay })
}

/** RFC3339 → `<input type="date">` 的值（`YYYY-MM-DD`）；失败返回 ''。 */
export function toDateInput(s: string | null | undefined): string {
  const d = parseRFC3339(s)
  return d ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` : ''
}

/** RFC3339 → `<input type="time">` 的值（`HH:mm`）；失败返回 ''。 */
export function toTimeInput(s: string | null | undefined): string {
  const d = parseRFC3339(s)
  return d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : ''
}

/** `2026-09-18` / `09-18` 展示日期。 */
export function fmtDate(s: string | null | undefined): string {
  const d = parseRFC3339(s)
  if (!d) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** `09-18`（同年省略年份，时间轴分组头用）。 */
export function fmtDateShort(s: string | null | undefined, now: number): string {
  const d = parseRFC3339(s)
  if (!d) return ''
  const n = new Date(now)
  return d.getFullYear() === n.getFullYear()
    ? `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** `14:30`。 */
export function fmtTime(s: string | null | undefined): string {
  const d = parseRFC3339(s)
  return d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : ''
}

/** `2026-09-18 14:30`；全天只出日期。 */
export function fmtDateTime(s: string | null | undefined, allDay?: boolean): string {
  if (!s) return ''
  const date = fmtDate(s)
  return allDay ? date : `${date} ${fmtTime(s)}`.trim()
}

/** 相对日文案的 i18n key 集合（组件取词，避免把文案写死在 lib 里）。 */
export type RelativeKey =
  | 'relToday'
  | 'relTomorrow'
  | 'relYesterday'
  | 'relInDays'
  | 'relPastDays'
  | 'relDate'

export interface RelativeLabel {
  key: RelativeKey
  /** relInDays / relPastDays 的插值天数 */
  count: number
  /** 兜底绝对日期（`YYYY-MM-DD`），用于 title 与 relDate 展示 */
  date: string
}

/**
 * 相对日标签：只返回 **i18n key + 参数**，不返回成品文案——
 * lib 层拿不到响应式语言，写死中文会在切英文时残留。
 */
export function fmtRelative(s: string | null | undefined, now: number): RelativeLabel | null {
  const ms = toUTCms(s)
  if (ms == null) return null
  const a = new Date(ms)
  const b = new Date(now)
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOf(a) - startOf(b)) / 86_400_000)
  const date = fmtDate(s)
  if (diffDays === 0) return { key: 'relToday', count: 0, date }
  if (diffDays === 1) return { key: 'relTomorrow', count: 1, date }
  if (diffDays === -1) return { key: 'relYesterday', count: 1, date }
  if (diffDays > 1 && diffDays <= 7) return { key: 'relInDays', count: diffDays, date }
  if (diffDays < -1 && diffDays >= -7) return { key: 'relPastDays', count: -diffDays, date }
  return { key: 'relDate', count: 0, date }
}

/** 取「今天 00:00」的本地时间戳。 */
export function startOfToday(now: number): number {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
