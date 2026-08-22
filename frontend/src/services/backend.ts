/**
 * Wails v3 backend service binder.
 *
 * In production (Wails runtime), calls Go services via the @wailsio/runtime Call.ByName.
 * In dev mode (vite only), falls back to returning null.
 *
 * ── 统一响应约定（与 pkg/util/response.go 的 Response 对齐）─────────────────────
 *   code === 0   成功，data 为业务负载
 *   code === 300 警告，message 为提示（业务上非致命）
 *   code === 500 失败，message 为面向用户的中文错误消息（无技术细节）
 *
 * callService 统一解析 code：
 *   - code === 0        → resolve data（data 为 null/undefined 时返回 null）
 *   - code !== 0        → reject ApiError（携带后端 message）
 *   - 返回体不含 code 字段 → 原值透传（兼容尚未迁移为 *Response 的旧式方法签名）
 */

import { Call } from '@wailsio/runtime'

/** 统一响应码，与 pkg/util/response.go 保持一致。 */
export const RspCode = {
  /** 成功 */
  Succ: 0,
  /** 警告（非致命，message 用于提示） */
  Warn: 300,
  /** 失败（message 为面向用户的错误消息） */
  Err: 500,
} as const

/** 后端统一响应结构体（pkg/util/response.go 的 Response 的 JSON 形态）。 */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data?: T
}

/**
 * 后端返回非 0 码时抛出的错误。
 * message 为后端面向用户的中文提示，可直接用于界面展示。
 */
export class ApiError extends Error {
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }

  /** 是否为警告（300）：业务上非致命，调用方可按需继续流程。 */
  get isWarn(): boolean {
    return this.code === RspCode.Warn
  }
}

/** 判断 err 是否为后端返回的统一响应错误。 */
export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError
}

let _isWails: boolean | null = null

export function isWails(): boolean {
  if (_isWails !== null) return _isWails
  try {
    // Wails v3 uses _wails, Wails v2 uses __wails__
    const win = window as unknown as Record<string, unknown>
    _isWails = !!(win._wails || win.__wails__)
  } catch {
    _isWails = false
  }
  return _isWails
}

/** 判断返回体是否为统一响应结构（含 number 类型的 code 字段）。 */
function isApiResponse(raw: unknown): raw is ApiResponse {
  return (
    !!raw &&
    typeof raw === 'object' &&
    typeof (raw as ApiResponse).code === 'number'
  )
}

export async function callService<T>(
  serviceName: string,
  methodName: string,
  ...args: unknown[]
): Promise<T | null> {
  // Trace all service calls to diagnose unexpected persistence
  const isMutating = methodName === 'ExplicitSave' || methodName === 'AutoSave' || methodName === 'SetResume'
  if (isMutating) {
    console.trace(`[Backend] 🔴 MUTATING call: ${serviceName}.${methodName}`)
  } else {
    console.debug(`[Backend] ${serviceName}.${methodName}`)
  }

  if (isWails()) {
    try {
      const fullName = `gosume/pkg/resume/service.${serviceName}.${methodName}`
      const raw: unknown = await Call.ByName(fullName, ...args)

      // 统一响应（新约定）：code === 0 解包 data；非 0 抛 ApiError
      if (isApiResponse(raw)) {
        if (raw.code !== RspCode.Succ) {
          throw new ApiError(raw.code, raw.message || `${serviceName}.${methodName} 调用失败`)
        }
        return (raw.data as T | undefined) ?? null
      }

      // 兼容旧式签名（方法尚未迁移为 *Response）：返回裸值或 undefined，原样透传
      return raw as T
    } catch (err) {
      console.error(`[Backend] ${serviceName}.${methodName} failed:`, err)
      throw err
    }
  }
  console.debug(`[Backend] Wails not available, skipping ${serviceName}.${methodName}`)
  return null
}
