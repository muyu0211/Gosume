/**
 * 求职进程 · Mock 数据层（仅前端独立开发期使用）。
 *
 * ⚠ 临时性质：
 * - 后端 `RecruitService` 联调通过后，**必须删除本文件中的 `mockParse`**（§6.3 风险：
 *   解析规则双份实现会与线上行为不一致）；数据 Mock 可保留用于纯 Vite 演示。
 * - 所有方法返回结构与真实契约完全一致，含人为 120ms 延迟，便于走查 loading 态。
 */
import type {
  CreateJobResult,
  DeleteJobResult,
  DuplicateCandidate,
  ImportReport,
  JobCompany,
  JobProcess,
  JobProcessDraft,
  JobSettings,
  JobStatus,
  ParseResult,
} from '../types/recruit'
import { dayKey, parseRFC3339, toUTCms } from '../lib/recruit/time'
import { normalizeCompany } from '../lib/recruit/normalize'
import { kindOfStage } from '../lib/recruit/options'
import { arriveAt } from '../lib/recruit/time'

const STORAGE_KEY = 'gosume-recruit-mock'
const LATENCY = 120

interface MockDB {
  jobs: JobProcess[]
  companies: JobCompany[]
  settings: JobSettings
}

function uid(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function nowISO(): string {
  return new Date().toISOString()
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 以今天为基准偏移天数/小时后得到本地 RFC3339。 */
function at(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour, minute, 0, 0)
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  const p = (n: number) => (n < 10 ? `0${n}` : String(n))
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:00${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
  )
}

/** 种子数据：覆盖 今日 / 临近 / 已过期 / 时间待定 / 已完成 五类。 */
function seed(): MockDB {
  const mk = (
    company: string,
    position: string,
    stage: JobProcess['stage'],
    round_no: number,
    event: string | null,
    status: JobStatus = 'pending',
    extra: Partial<JobProcess> = {},
  ): JobProcess => {
    const norm = normalizeCompany(company)
    return {
      id: uid(),
      company,
      company_norm: norm,
      position,
      stage,
      round_no,
      event_time: event,
      event_end: null,
      deadline: null,
      all_day: false,
      time_basis: null,
      link: '',
      location: '',
      online: false,
      source: 'manual',
      status,
      note: '',
      raw_text: null,
      confidence: {},
      company_id: null,
      parent_id: null,
      created_at: nowISO(),
      updated_at: nowISO(),
      ...extra,
    }
  }

  const bdApply = mk('字节跳动', '后端开发工程师', 'apply', 0, at(-12, 10), 'done', {
    source: 'email',
    link: 'https://jobs.bytedance.com/campus',
  })
  const txApply = mk('腾讯科技', '前端开发工程师', 'apply', 0, at(-8, 15), 'done', {
    link: 'https://join.qq.com',
  })
  const mtApply = mk('美团', '数据分析师', 'apply', 0, at(-6, 20), 'done')
  const aliApply = mk('阿里巴巴', '算法工程师', 'apply', 0, at(-5, 9), 'done')

  return {
    settings: { nearThresholdHours: 48, saveRawText: false },
    companies: [
      {
        id: uid(),
        name: '字节跳动',
        norm: normalizeCompany('字节跳动'),
        aliases: ['ByteDance', '字节'],
        website: 'https://www.bytedance.com',
        career_url: 'https://jobs.bytedance.com/campus',
        contact: '',
        note: '',
        created_at: nowISO(),
        updated_at: nowISO(),
      },
    ],
    jobs: [
      bdApply,
      txApply,
      mtApply,
      aliApply,
      // 今日 19:00 笔试
      mk('字节跳动', '后端开发工程师', 'written', 1, at(0, 19), 'pending', {
        source: 'email',
        online: true,
        link: 'https://campus.bytedance.com/exam/8842',
        parent_id: bdApply.id,
        note: '开考前 15 分钟可进入',
      }),
      // 后天 10:00 一面（临近）
      mk('字节跳动', '后端开发工程师', 'interview', 1, at(2, 10), 'pending', {
        source: 'email',
        online: true,
        link: 'https://meeting.bytedance.com/abc',
        parent_id: bdApply.id,
      }),
      // 昨天 14:00 测评（已过期）
      mk('腾讯科技', '前端开发工程师', 'assessment', 1, at(-1, 14), 'pending', {
        source: 'sms',
        parent_id: txApply.id,
        note: '测评链接 48 小时内有效',
      }),
      // 20 小时后截止（临近）
      mk('腾讯科技', '前端开发工程师', 'assessment', 1, null, 'pending', {
        source: 'email',
        online: true,
        deadline: at(1, 10),
        parent_id: txApply.id,
      }),
      // 时间待定
      mk('美团', '数据分析师', 'written', 1, null, 'pending', {
        source: 'sms',
        parent_id: mtApply.id,
        note: '具体时间另行通知',
      }),
      // 5 天后（不告警）
      mk('美团', '数据分析师', 'interview', 1, at(5, 14), 'pending', {
        online: true,
        location: '线上',
        parent_id: mtApply.id,
      }),
      // 已完成
      mk('阿里巴巴', '算法工程师', 'written', 1, at(-3, 19), 'done', {
        parent_id: aliApply.id,
      }),
      // 已错过
      mk('阿里巴巴', '算法工程师', 'interview', 1, at(-2, 10), 'missed', {
        parent_id: aliApply.id,
      }),
      // Offer
      mk('小红书', '客户端开发工程师', 'offer', 0, at(-1, 11), 'pending', {
        source: 'email',
        note: '需在 3 天内答复',
      }),
    ],
  }
}

let db: MockDB | null = null

function load(): MockDB {
  if (db) return db
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as MockDB
      if (parsed && Array.isArray(parsed.jobs)) {
        db = { ...seed(), ...parsed }
        return db
      }
    }
  } catch {
    /* 脏数据直接重建 */
  }
  db = seed()
  persist()
  return db
}

function persist(): void {
  if (!db) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    /* 容量超限时静默 */
  }
}

async function withLatency<T>(fn: () => T): Promise<T> {
  await sleep(LATENCY)
  return fn()
}

/** 去重指纹（与后端约定一致）：stage==='apply' 即投递族，其余为通知族。 */
function fingerprint(j: JobProcess | JobProcessDraft): string {
  const norm = j.company_norm || normalizeCompany(j.company)
  const d = parseRFC3339(arriveAt(j))
  const day = d ? dayKey(d) : ''
  return j.stage === 'apply'
    ? `a|${norm}|${j.position}|${day}`
    : `n|${norm}|${j.stage}|${j.round_no}|${day}`
}

function diffFields(a: JobProcess, b: JobProcessDraft): DuplicateCandidate['diffs'] {
  const keys: Array<keyof JobProcess> = ['position', 'event_time', 'deadline', 'link', 'location']
  const out: DuplicateCandidate['diffs'] = []
  for (const k of keys) {
    const cur = String((a as Record<string, unknown>)[k] ?? '')
    const inc = String((b as Record<string, unknown>)[k] ?? '')
    if (cur !== inc) out.push({ field: k, current: cur, incoming: inc })
  }
  return out
}

// ───────────────────────────── Mock 方法 ─────────────────────────────

export const mockListJobs = (): Promise<JobProcess[]> =>
  withLatency(() => [...load().jobs].sort((a, b) => b.updated_at.localeCompare(a.updated_at)))

export const mockGetJob = (id: string): Promise<JobProcess | null> =>
  withLatency(() => load().jobs.find((j) => j.id === id) ?? null)

export function mockCreateJob(
  draft: JobProcessDraft,
  strategy?: 'update' | 'new',
): Promise<CreateJobResult> {
  return withLatency(() => {
    const d = load()
    const fp = fingerprint(draft)
    const hit = d.jobs.find((j) => fingerprint(j) === fp)
    if (hit && strategy !== 'new') {
      if (strategy === 'update') {
        Object.assign(hit, { ...draft }, { id: hit.id, updated_at: nowISO() })
        persist()
        return { id: hit.id }
      }
      return { id: '', duplicate: { job: hit, diffs: diffFields(hit, draft) } }
    }
    const job: JobProcess = {
      ...draft,
      id: uid(),
      company_norm: draft.company_norm || normalizeCompany(draft.company),
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    d.jobs.push(job)
    persist()
    return { id: job.id }
  })
}

export function mockUpdateJob(dto: JobProcess): Promise<{ id: string }> {
  return withLatency(() => {
    const d = load()
    const i = d.jobs.findIndex((j) => j.id === dto.id)
    if (i < 0) throw new Error('条目不存在')
    d.jobs[i] = { ...dto, company_norm: dto.company_norm || normalizeCompany(dto.company), updated_at: nowISO() }
    persist()
    return { id: dto.id }
  })
}

export function mockDeleteJob(id: string, cascade?: boolean): Promise<DeleteJobResult> {
  return withLatency(() => {
    const d = load()
    const children = d.jobs.filter((j) => j.parent_id === id)
    d.jobs = d.jobs.filter((j) => j.id !== id && !(cascade === true && j.parent_id === id))
    if (cascade !== true && children.length) {
      for (const c of children) c.parent_id = null
    }
    persist()
    return cascade === true ? { deleted: 1 + children.length } : { unlinked: children.length, deleted: 1 }
  })
}

export function mockSetStatus(id: string, status: JobStatus): Promise<{ id: string }> {
  return withLatency(() => {
    const d = load()
    const j = d.jobs.find((x) => x.id === id)
    if (!j) throw new Error('条目不存在')
    j.status = status
    j.updated_at = nowISO()
    persist()
    return { id }
  })
}

export function mockFindDuplicates(dto: JobProcessDraft): Promise<DuplicateCandidate[]> {
  return withLatency(() => {
    const d = load()
    const norm = dto.company_norm || normalizeCompany(dto.company)
    const day = parseRFC3339(arriveAt(dto))
    return d.jobs
      .filter(
        (j) =>
          j.company_norm === norm &&
          (j.stage === dto.stage ? true : kindOfStage(j.stage) !== kindOfStage(dto.stage)) &&
          (!day || !parseRFC3339(arriveAt(j)) || dayKey(parseRFC3339(arriveAt(j))!) === dayKey(day)),
      )
      .slice(0, 5)
      .map((job) => ({ job, diffs: diffFields(job, dto) }))
  })
}

export function mockMergeJob(targetId: string, patch: Partial<JobProcess>): Promise<{ id: string }> {
  return withLatency(() => {
    const d = load()
    const j = d.jobs.find((x) => x.id === targetId)
    if (!j) throw new Error('条目不存在')
    Object.assign(j, patch, { id: targetId, updated_at: nowISO() })
    persist()
    return { id: targetId }
  })
}

export const mockListCompanies = (): Promise<JobCompany[]> => withLatency(() => [...load().companies])

export const mockGetCompany = (id: string): Promise<JobCompany | null> =>
  withLatency(() => load().companies.find((c) => c.id === id) ?? null)

export function mockSaveCompany(dto: JobCompany): Promise<{ id: string }> {
  return withLatency(() => {
    const d = load()
    const norm = dto.norm || normalizeCompany(dto.name)
    const conflict = d.companies.find((c) => c.id !== dto.id && c.aliases.some((a) => normalizeCompany(a) === norm))
    if (conflict) throw new Error(`该别名已属于 ${conflict.name}`)
    const i = d.companies.findIndex((c) => c.id === dto.id)
    const saved: JobCompany = { ...dto, norm, updated_at: nowISO() }
    if (i >= 0) d.companies[i] = saved
    else d.companies.push({ ...saved, id: uid(), created_at: nowISO() })
    persist()
    return { id: saved.id }
  })
}

export function mockDeleteCompany(id: string): Promise<null> {
  return withLatency(() => {
    const d = load()
    const used = d.jobs.filter((j) => j.company_id === id).length
    if (used) throw new Error(`请先处理该公司下的 ${used} 条记录`)
    d.companies = d.companies.filter((c) => c.id !== id)
    persist()
    return null
  })
}

export function mockLinkNotice(noticeId: string, applyId: string | null): Promise<{ id: string }> {
  return withLatency(() => {
    const d = load()
    const j = d.jobs.find((x) => x.id === noticeId)
    if (!j) throw new Error('条目不存在')
    j.parent_id = applyId
    j.updated_at = nowISO()
    persist()
    return { id: noticeId }
  })
}

export const mockGetSettings = (): Promise<JobSettings> => withLatency(() => ({ ...load().settings }))

export function mockSetSettings(patch: Partial<JobSettings>): Promise<JobSettings> {
  return withLatency(() => {
    const d = load()
    d.settings = { ...d.settings, ...patch }
    persist()
    return { ...d.settings }
  })
}

export const mockExportJobs = (format: 'csv' | 'json'): Promise<{ path: string }> =>
  withLatency(() => ({ path: `gosume-recruit.${format}` }))

export function mockImportJobs(strategy: 'skip' | 'overwrite' | 'new'): Promise<ImportReport> {
  return withLatency(() => {
    if (strategy === 'skip') return { created: 3, skipped: 2, overwritten: 0 }
    if (strategy === 'overwrite') return { created: 3, skipped: 0, overwritten: 2 }
    return { created: 5, skipped: 0, overwritten: 0 }
  })
}

// ───────────────────── 临时解析器（联调通过后删除） ─────────────────────

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
}

const STAGE_KEYWORDS: Array<[RegExp, JobProcess['stage']]> = [
  [/在线测评|测评|性格测评|行测/, 'assessment'],
  [/笔试|在线考试|机考/, 'written'],
  [/面试|面谈|视频面/, 'interview'],
  [/宣讲|空中宣讲|开放日/, 'talk'],
  [/offer|录用|意向书/, 'offer'],
]

/** 极简中文规则解析：只用于前端走查「粘贴 → 预览 → 标黄 → 保存」链路。 */
export function mockParse(raw: string, receivedAt: string | null): Promise<ParseResult> {
  return withLatency(() => {
    const text = (raw ?? '').trim()
    const warnings: string[] = []
    const fields: ParseResult['fields'] = {}
    const confidence: ParseResult['confidence'] = {}

    if (!text) return { fields, confidence, warnings, received_at: receivedAt }

    // 非中文判定：中文字符占比低于 10% 视为不支持
    const cnCount = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length
    if (cnCount / text.length < 0.1) {
      warnings.push('parseNonChinese')
      return { fields, confidence, warnings, received_at: receivedAt }
    }

    // 公司：方括号 / 书名号 / 「xxx 校园招聘」
    const mCompany =
      text.match(/【([^】]{2,20})】/) ||
      text.match(/「([^」]{2,20})」/) ||
      text.match(/([^\s，,。]{2,15})(?:校园招聘|2027届|2026届)/)
    if (mCompany) {
      fields.company = mCompany[1]
      confidence.company = 'high'
    } else {
      confidence.company = 'unknown'
      warnings.push('parseNoCompany')
    }

    // 岗位
    const mPos = text.match(/([^\s，,。：:]{2,12}(?:工程师|开发|分析师|产品经理|设计师|实习生|专员))/)
    if (mPos) {
      fields.position = mPos[1]
      confidence.position = 'medium'
    }

    // 环节
    for (const [re, stage] of STAGE_KEYWORDS) {
      if (re.test(text)) {
        fields.stage = stage
        confidence.stage = 'high'
        break
      }
    }
    if (!fields.stage) confidence.stage = 'unknown'

    // 轮次
    const mRound = text.match(/第\s*([一二三四五六七八九十]|\d)\s*[轮面次]/)
    if (mRound) {
      const raw1 = mRound[1]
      fields.round_no = /^\d$/.test(raw1) ? Number.parseInt(raw1, 10) : (CN_NUM[raw1] ?? 1)
      confidence.round_no = 'medium'
    }

    // 时间：`2026年9月20日 19:00` / `9月20日19:00` / `9/20 19:00`
    const base = parseRFC3339(receivedAt) ?? new Date()
    const mTime = text.match(
      /(\d{4})?年?(\d{1,2})月(\d{1,2})日?\s*(?:(\d{1,2}):(\d{2}))?/,
    )
    if (mTime) {
      const year = mTime[1] ? Number.parseInt(mTime[1], 10) : base.getFullYear()
      const month = Number.parseInt(mTime[2], 10) - 1
      const date = Number.parseInt(mTime[3], 10)
      const hour = mTime[4] ? Number.parseInt(mTime[4], 10) : 0
      const minute = mTime[5] ? Number.parseInt(mTime[5], 10) : 0
      const d = new Date(year, month, date, hour, minute, 0, 0)
      const iso = toUTCms(d.toISOString()) != null ? localISO(d) : null
      if (iso) {
        if (mTime[4]) {
          fields.event_time = iso
          confidence.event_time = 'medium'
        } else {
          fields.event_time = iso
          confidence.event_time = 'low'
        }
      }
    }

    // 截止
    const mDeadline = text.match(/截止[^\d]{0,6}((\d{4})?年?(\d{1,2})月(\d{1,2})日?\s*(?:(\d{1,2}):(\d{2}))?)/)
    if (mDeadline) {
      const year = mDeadline[2] ? Number.parseInt(mDeadline[2], 10) : base.getFullYear()
      const d = new Date(
        year,
        Number.parseInt(mDeadline[3], 10) - 1,
        Number.parseInt(mDeadline[4], 10),
        mDeadline[5] ? Number.parseInt(mDeadline[5], 10) : 23,
        mDeadline[6] ? Number.parseInt(mDeadline[6], 10) : 59,
        0,
        0,
      )
      fields.deadline = localISO(d)
      confidence.deadline = 'medium'
      if (!fields.event_time) {
        fields.event_time = null
        confidence.event_time = 'unknown'
      }
    }

    // 链接
    const mLink = text.match(/https?:\/\/[^\s，,）)]+/)
    if (mLink) {
      fields.link = mLink[0]
      confidence.link = 'high'
    }

    // 地点 / 线上
    if (/线上|远程|视频|腾讯会议|飞书/.test(text)) fields.online = true
    const mLoc = text.match(/(?:地点|地址|考场)[：: ]\s*([^\s，,。\n]{2,30})/)
    if (mLoc) {
      fields.location = mLoc[1]
      confidence.location = 'medium'
    }

    // 来源：极短且含短信特征 → sms
    fields.source = text.length < 160 && /【|回T退订|短信/.test(text) ? 'sms' : 'email'
    confidence.source = 'low'

    return { fields, confidence, warnings, received_at: receivedAt }
  })
}

function localISO(d: Date): string {
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  const p = (n: number) => (n < 10 ? `0${n}` : String(n))
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:00${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
  )
}
