/**
 * 求职进程 store。
 *
 * 纪律（与既有 store 一致）：
 * - **持久化变更一律走后端**（RecruitService），store 只做内存镜像；
 * - 纯 UI 状态（视图 / 筛选 / 折叠）留本地，不落库；
 * - **派生值不进 store**（临近标签、分组、统计都是纯函数 + useMemo），
 *   避免缓存与数据不同步；
 * - `now` 由页面定时器统一推进，整屏共用同一时刻，避免各卡片算出不同结果。
 */
import { create } from 'zustand'
import type {
  CreateJobResult,
  DuplicateCandidate,
  ImportReport,
  JobCompany,
  JobFilters,
  JobProcess,
  JobProcessDraft,
  JobSettings,
  JobStatus,
  JobView,
  ParseResult,
} from '../types/recruit'
import {
  createJob,
  deleteCompany,
  deleteJob,
  exportJobs,
  findDuplicates,
  getJobSettings,
  importJobs,
  linkNotice,
  listCompanies,
  listJobs,
  mergeJob,
  parseJobText,
  saveCompany,
  setJobSettings,
  setJobStatus,
  updateJob,
} from '../services/recruitService'
import { extractErrorMessage } from '../lib/errorUtils'
import { dayKey } from '../lib/recruit/time'

export const DEFAULT_FILTERS: JobFilters = {
  companies: [],
  stages: [],
  statuses: [],
  sources: [],
  urgencies: [],
  keyword: '',
}

/**
 * 「清除所有筛选条件」的目标态：全字段清空（状态 = 全部）。
 */
const emptyFilters = (): JobFilters => ({
  companies: [],
  stages: [],
  statuses: [],
  sources: [],
  urgencies: [],
  keyword: '',
})

const DEFAULT_SETTINGS: JobSettings = { nearThresholdHours: 48, saveRawText: false }

/** 删除撤销缓冲（内存级，5 秒），含被解关联的子通知以便完整恢复。 */
interface UndoBuffer {
  job: JobProcess
  childIds: string[]
  timer: number
}

interface RecruitState {
  // ── 数据 ──
  jobs: JobProcess[]
  companies: JobCompany[]
  settings: JobSettings
  /** 整屏共用的「当前时刻」（UTC 毫秒），由 tick 推进 */
  now: number
  lastComputedDay: string

  // ── UI（本地） ──
  view: JobView
  filters: JobFilters
  loading: boolean
  error: string
  undo: UndoBuffer | null

  // ── actions ──
  load: () => Promise<void>
  /** 幂等加载：首页卡片与 Tab 面板同时挂载 / 反复切 Tab 都只真正请求一次。 */
  ensureLoaded: () => void
  tick: () => void
  create: (draft: JobProcessDraft, strategy?: 'update' | 'new') => Promise<CreateJobResult>
  update: (dto: JobProcess) => Promise<void>
  remove: (id: string, cascade?: boolean) => Promise<void>
  undoRemove: () => Promise<void>
  clearUndo: () => void
  setStatus: (id: string, status: JobStatus) => Promise<void>
  parse: (raw: string, receivedAt: string | null) => Promise<ParseResult>
  findDup: (dto: JobProcessDraft) => Promise<DuplicateCandidate[]>
  merge: (targetId: string, patch: Partial<JobProcess>) => Promise<void>
  link: (noticeId: string, applyId: string | null) => Promise<void>
  loadCompanies: () => Promise<void>
  saveCompany: (dto: JobCompany) => Promise<void>
  removeCompany: (id: string) => Promise<void>
  setSettings: (patch: Partial<JobSettings>) => Promise<void>
  exportJobs: (format: 'csv' | 'json') => Promise<{ path: string }>
  importJobs: (strategy: 'skip' | 'overwrite' | 'new') => Promise<ImportReport>
  setView: (view: JobView) => void
  setFilters: (patch: Partial<JobFilters>) => void
  resetFilters: () => void
}

/**
 * `ensureLoaded` 的一次性闸门。
 *
 * 求职进程是首页 Tab 的子视图：首页卡片与 Tab 面板都会在挂载时请求数据，
 * 且每次切回 Tab 都会重新挂载。放开不管会重复打后端。加载失败时复位，
 * 允许用户下次进入 Tab 时重试。
 */
let loadedOnce = false

export const useRecruitStore = create<RecruitState>((set, get) => ({
  jobs: [],
  companies: [],
  settings: DEFAULT_SETTINGS,
  now: Date.now(),
  lastComputedDay: dayKey(Date.now()),

  view: 'list',
  filters: { ...DEFAULT_FILTERS },
  loading: false,
  error: '',
  undo: null,

  load: async () => {
    // 同步置位：并发的 ensureLoaded 不会重复发请求
    loadedOnce = true
    set({ loading: true, error: '' })
    try {
      const [jobs, companies, settings] = await Promise.all([
        listJobs(),
        listCompanies(),
        getJobSettings(),
      ])
      set({ jobs, companies, settings, loading: false, now: Date.now() })
    } catch (err) {
      loadedOnce = false // 失败允许下次重试
      set({ loading: false, error: extractErrorMessage(err) })
    }
  },

  ensureLoaded: () => {
    if (loadedOnce) return
    void get().load()
  },

  /** 每分钟推进一次 now；跨日时同步更新 lastComputedDay 触发重渲染。 */
  tick: () => {
    const now = Date.now()
    if (dayKey(now) !== get().lastComputedDay) set({ now, lastComputedDay: dayKey(now) })
    else set({ now })
  },

  create: async (draft, strategy) => {
    const res = await createJob(draft, strategy)
    if (!res.duplicate) await get().load()
    return res
  },

  update: async (dto) => {
    await updateJob(dto)
    await get().load()
  },

  remove: async (id, cascade) => {
    const job = get().jobs.find((j) => j.id === id)
    const childIds = job ? get().jobs.filter((j) => j.parent_id === id).map((j) => j.id) : []
    await deleteJob(id, cascade)
    if (job) {
      const timer = window.setTimeout(() => get().clearUndo(), 5000)
      set({ undo: { job, childIds, timer } })
    }
    await get().load()
  },

  undoRemove: async () => {
    const buf = get().undo
    if (!buf) return
    window.clearTimeout(buf.timer)
    set({ undo: null })
    const { id: _id, created_at: _c, updated_at: _u, ...draft } = buf.job
    const res = await createJob(draft, 'new')
    if (res.id) {
      for (const cid of buf.childIds) {
        await linkNotice(cid, res.id).catch(() => { /* 子条目已被删除则跳过 */ })
      }
    }
    await get().load()
  },

  clearUndo: () => {
    const buf = get().undo
    if (buf) window.clearTimeout(buf.timer)
    set({ undo: null })
  },

  setStatus: async (id, status) => {
    // 乐观更新：状态切换是高频操作，先改本地再等后端，失败回滚
    const prev = get().jobs
    set({ jobs: prev.map((j) => (j.id === id ? { ...j, status } : j)) })
    try {
      await setJobStatus(id, status)
    } catch (err) {
      set({ jobs: prev, error: extractErrorMessage(err) })
      return
    }
    await get().load()
  },

  parse: (raw, receivedAt) => parseJobText(raw, receivedAt),

  findDup: (dto) => findDuplicates(dto),

  merge: async (targetId, patch) => {
    await mergeJob(targetId, patch)
    await get().load()
  },

  link: async (noticeId, applyId) => {
    await linkNotice(noticeId, applyId)
    await get().load()
  },

  loadCompanies: async () => {
    set({ companies: await listCompanies() })
  },

  saveCompany: async (dto) => {
    await saveCompany(dto)
    await get().loadCompanies()
  },

  removeCompany: async (id) => {
    await deleteCompany(id)
    await get().loadCompanies()
  },

  setSettings: async (patch) => {
    const next = await setJobSettings(patch)
    // 阈值变化会改变「临近」判定，立即重算（now 也要刷新）
    set({ settings: next, now: Date.now(), lastComputedDay: dayKey(Date.now()) })
  },

  exportJobs: (format) => exportJobs(format),

  importJobs: async (strategy) => {
    const report = await importJobs(strategy)
    await get().load()
    return report
  },

  setView: (view) => set({ view }),

  setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),

  resetFilters: () => set({ filters: emptyFilters() }),
}))
