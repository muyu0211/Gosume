/**
 * Extracts a user-facing error message from any error shape.
 * Handles Error objects, plain strings, and Wails-serialized Go errors (JSON).
 */
export function extractErrorMessage(err: unknown, fallback = '操作失败'): string {
  if (!err) return fallback
  if (typeof err === 'string') return err
  if (err instanceof Error) {
    const msg = err.message?.trim()
    if (!msg) return fallback
    // Wails v3 may serialize Go errors as JSON strings
    if (msg.startsWith('{') && msg.endsWith('}')) {
      try {
        const parsed = JSON.parse(msg)
        if (parsed?.message && typeof parsed.message === 'string') {
          return parsed.message
        }
      } catch { /* not valid JSON, use raw message */ }
    }
    return msg
  }
  // Handle objects with a message property
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message) || fallback
  }
  return fallback
}
