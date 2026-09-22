/**
 * 求职进程 · 后端服务封装。
 *
 * 两点约定：
 * 1. **新服务必须登记包路径**：Wails 绑定全名为 `package.Struct.Method`，本服务位于
 *    `pkg/recruit/service`，故在模块加载时 `registerServicePackage`，不去改 backend.ts
 *    的硬编码表（避免污染既有服务）。Go 侧结构体名必须叫 `RecruitService`。
 * 2. **文件 IO 全在后端**：导出/导入由后端弹原生对话框并读写（含 CSV BOM），
 *    前端只触发与展示结果，规避 CSP 与编码问题。
 */
import { callService, isWails, registerServicePackage } from './backend'
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
import {
  mockCreateJob,
  mockDeleteCompany,
  mockDeleteJob,
  mockExportJobs,
  mockFindDuplicates,
  mockGetCompany,
  mockGetJob,
  mockGetSettings,
  mockImportJobs,
  mockLinkNotice,
  mockListCompanies,
  mockListJobs,
  mockMergeJob,
  mockParse,
  mockSaveCompany,
  mockSetSettings,
  mockSetStatus,
  mockUpdateJob,
} from './recruitMock'

registerServicePackage('RecruitService', 'gosume/pkg/recruit/service')

/** 强制 Mock：`?mock=1` 查询参数（Wails 下也走 Mock，便于联调前演示）。 */
const FORCE_MOCK =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('mock') === '1'

/** 是否走 Mock：显式开关，或非 Wails 环境（纯 Vite 开发）。 */
export const USE_MOCK = FORCE_MOCK || !isWails()

const S = 'RecruitService'

// ───────────────────────────── 条目 ─────────────────────────────

export function listJobs(): Promise<JobProcess[]> {
  if (USE_MOCK) return mockListJobs()
  return callService<JobProcess[]>(S, 'ListJobs').then((d) => d ?? [])
}

export function getJob(id: string): Promise<JobProcess | null> {
  if (USE_MOCK) return mockGetJob(id)
  return callService<JobProcess>(S, 'GetJob', id)
}

export function createJob(
  draft: JobProcessDraft,
  strategy?: 'update' | 'new',
): Promise<CreateJobResult> {
  if (USE_MOCK) return mockCreateJob(draft, strategy)
  return callService<CreateJobResult>(S, 'CreateJob', draft, strategy ?? null).then(
    (d) => d ?? { id: '' },
  )
}

export function updateJob(dto: JobProcess): Promise<{ id: string }> {
  if (USE_MOCK) return mockUpdateJob(dto)
  return callService<{ id: string }>(S, 'UpdateJob', dto).then((d) => d ?? { id: dto.id })
}

export function deleteJob(id: string, cascade?: boolean): Promise<DeleteJobResult> {
  if (USE_MOCK) return mockDeleteJob(id, cascade)
  return callService<DeleteJobResult>(S, 'DeleteJob', id, cascade === true).then((d) => d ?? {})
}

export function setJobStatus(id: string, status: JobStatus): Promise<{ id: string }> {
  if (USE_MOCK) return mockSetStatus(id, status)
  return callService<{ id: string }>(S, 'SetStatus', id, status).then((d) => d ?? { id })
}

export function parseJobText(raw: string, receivedAt: string | null): Promise<ParseResult> {
  if (USE_MOCK) return mockParse(raw, receivedAt)
  return callService<ParseResult>(S, 'Parse', raw, receivedAt).then(
    (d) => d ?? { fields: {}, confidence: {}, warnings: [], received_at: null },
  )
}

/** 取消进行中的粘贴解析（幂等：无进行中任务时后端为空操作）。
 *  录入弹窗关闭（Modal onClose）时调用，终止后台 LLM 调用与重试循环。 */
export function cancelParse(): void {
  if (USE_MOCK) return
  void callService(S, 'CancelParse').catch(() => { /* 忽略：取消失败不影响关闭流程 */ })
}

export function findDuplicates(dto: JobProcessDraft): Promise<DuplicateCandidate[]> {
  if (USE_MOCK) return mockFindDuplicates(dto)
  return callService<DuplicateCandidate[]>(S, 'FindDuplicates', dto).then((d) => d ?? [])
}

export function mergeJob(targetId: string, patch: Partial<JobProcess>): Promise<{ id: string }> {
  if (USE_MOCK) return mockMergeJob(targetId, patch)
  return callService<{ id: string }>(S, 'MergeJob', targetId, patch).then((d) => d ?? { id: targetId })
}

export function linkNotice(noticeId: string, applyId: string | null): Promise<{ id: string }> {
  if (USE_MOCK) return mockLinkNotice(noticeId, applyId)
  return callService<{ id: string }>(S, 'LinkNotice', noticeId, applyId).then(
    (d) => d ?? { id: noticeId },
  )
}

// ───────────────────────────── 公司档案 ─────────────────────────────

export function listCompanies(): Promise<JobCompany[]> {
  if (USE_MOCK) return mockListCompanies()
  return callService<JobCompany[]>(S, 'ListCompanies').then((d) => d ?? [])
}

export function getCompany(id: string): Promise<JobCompany | null> {
  if (USE_MOCK) return mockGetCompany(id)
  return callService<JobCompany>(S, 'GetCompany', id)
}

export function saveCompany(dto: JobCompany): Promise<{ id: string }> {
  if (USE_MOCK) return mockSaveCompany(dto)
  return callService<{ id: string }>(S, 'SaveCompany', dto).then((d) => d ?? { id: dto.id })
}

export function deleteCompany(id: string): Promise<null> {
  if (USE_MOCK) return mockDeleteCompany(id)
  return callService<null>(S, 'DeleteCompany', id)
}

// ───────────────────────────── 设置 / 导入导出 ─────────────────────────────

export function getJobSettings(): Promise<JobSettings> {
  if (USE_MOCK) return mockGetSettings()
  return callService<JobSettings>(S, 'GetSettings').then(
    (d) => d ?? { nearThresholdHours: 48, saveRawText: false },
  )
}

export function setJobSettings(patch: Partial<JobSettings>): Promise<JobSettings> {
  if (USE_MOCK) return mockSetSettings(patch)
  return callService<JobSettings>(S, 'SetSettings', patch).then(
    (d) => d ?? { nearThresholdHours: 48, saveRawText: false, ...patch },
  )
}

/** 由后端弹另存对话框并写盘；返回路径仅用于提示。 */
export function exportJobs(format: 'csv' | 'json'): Promise<{ path: string }> {
  if (USE_MOCK) return mockExportJobs(format)
  return callService<{ path: string }>(S, 'ExportJobs', format).then((d) => d ?? { path: '' })
}

/** 由后端弹选择框并读文件；返回条数报告供前端展示。 */
export function importJobs(strategy: 'skip' | 'overwrite' | 'new'): Promise<ImportReport> {
  if (USE_MOCK) return mockImportJobs(strategy)
  return callService<ImportReport>(S, 'ImportJobs', strategy).then(
    (d) => d ?? { created: 0, skipped: 0, overwritten: 0 },
  )
}
