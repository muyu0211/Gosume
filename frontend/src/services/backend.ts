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
 *
 * ── 服务包路径探测 ──────────────────────────────────────────────────────────
 * Wails 绑定名为 `package.Struct.Method`，而后端 service 分散在多个 Go 包下
 * （pkg/resume/service、pkg/autofill/service …）。callService 不写死单一路径，
 * 而是按 SERVICE_PACKAGES 顺序探测，命中后缓存；仅「方法不在该包」的
 * ReferenceError 会继续探测下一个包，真实业务错误立即抛出。
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

/**
 * 后端 service 的 Go 包路径解析（Wails 绑定全名格式 `package.Struct.Method`）。
 *
 * 绝大多数服务都在 `pkg/resume/service`，个别服务分散在其他包（例如
 * `AutofillService` 位于 `pkg/autofill/service`）。这里用**确定性映射**直接拿到
 * 每个服务的包路径，而不是靠「尝试多个候选包 + 解析错误文本」的运行时探测——
 * 后者会在每次首次调用时对不存在的包发起一次绑定请求，既产生误导性的
 * `Binding call failed` 日志，也依赖 Wails 的错误措辞。
 *
 * 注意：绑定全名第三段是「结构体名」而非 ServiceName() 的返回值（Wails 取
 * reflect 的 NamedType.Name()），因此 Go 侧结构体名必须与 ServiceName() 一致。
 */
const DEFAULT_SERVICE_PACKAGE = 'gosume/pkg/resume/service'

/** 例外服务 → 其所在 Go 包路径。AUTOFILL 有且仅在不默认包时登记在此。 */
const SERVICE_PACKAGE_OVERRIDES: Record<string, string> = {
  AutofillService: 'gosume/pkg/autofill/service',
}

/** 运行时追加服务包映射（新增服务目录时调用，避免改动硬编码表）。 */
export function registerServicePackage(serviceName: string, pkg: string): void {
  if (serviceName && pkg) SERVICE_PACKAGE_OVERRIDES[serviceName] = pkg
}

/** 拿到某服务对应的绑定包路径。 */
function packageForService(serviceName: string): string {
  return SERVICE_PACKAGE_OVERRIDES[serviceName] ?? DEFAULT_SERVICE_PACKAGE
}

/** 解包 Wails 返回值：统一响应按 code 处理，旧式裸值原样透传。 */
function unwrapResponse<T>(raw: unknown, serviceName: string, methodName: string): T | null {
  if (isApiResponse(raw)) {
    if (raw.code !== RspCode.Succ) {
      throw new ApiError(raw.code, raw.message || `${serviceName}.${methodName} 调用失败`)
    }
    return (raw.data as T | undefined) ?? null
  }
  // 兼容旧式签名（方法尚未迁移为 *Response）：返回裸值或 undefined，原样透传
  return raw as T
}

/** 按服务名解析出的绑定全名直接调用，不再做多包探测。 */
async function callBoundMethod<T>(
  serviceName: string,
  methodName: string,
  args: unknown[],
): Promise<T | null> {
  const fullName = `${packageForService(serviceName)}.${serviceName}.${methodName}`
  const raw: unknown = await Call.ByName(fullName, ...args)
  return unwrapResponse<T>(raw, serviceName, methodName)
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
      return await callBoundMethod<T>(serviceName, methodName, args)
    } catch (err) {
      console.error(`[Backend] ${serviceName}.${methodName} failed:`, err)
      throw err
    }
  }
  console.debug(`[Backend] Wails not available, skipping ${serviceName}.${methodName}`)
  return null
}
