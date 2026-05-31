/**
 * Wails v3 backend service binder.
 *
 * In production (Wails runtime), calls Go services via the @wailsio/runtime Call.ByName.
 * In dev mode (vite only), falls back to returning null.
 */

import { Call } from '@wailsio/runtime'

let _isWails: boolean | null = null

export function isWails(): boolean {
  if (_isWails !== null) return _isWails
  try {
    // Wails v3 uses _wails, Wails v2 uses __wails__
    const win = window as Record<string, unknown>
    _isWails = !!(win._wails || win.__wails__)
  } catch {
    _isWails = false
  }
  return _isWails
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
      const fullName = `gosume/pkg/service.${serviceName}.${methodName}`
      return await Call.ByName(fullName, ...args) as T
    } catch (err) {
      console.error(`[Backend] ${serviceName}.${methodName} failed:`, err)
      throw err
    }
  }
  console.debug(`[Backend] Wails not available, skipping ${serviceName}.${methodName}`)
  return null
}
