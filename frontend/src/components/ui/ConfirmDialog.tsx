import type { ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

export interface ConfirmDialogProps {
  /** Whether the dialog is shown. */
  open: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  /** Danger style: red confirm button + default alert icon. */
  danger?: boolean
  /** Shows a spinner on the confirm button and disables both buttons. */
  loading?: boolean
  /** Custom icon (defaults to AlertTriangle when `danger`). */
  icon?: ReactNode
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Shared confirmation modal used across the app (delete templates, delete
 * resumes, reset layout presets, …). Replaces the browser's native
 * `window.confirm` with a styled, consistent dialog.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  loading = false,
  icon,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  const resolvedIcon = icon ?? (danger ? <AlertTriangle className="w-5 h-5 text-red-600" /> : null)

  return (
    <div
      className="fixed inset-0 bg-black/20 flex items-center justify-center animate-dialog-overlay-enter z-50"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-2xl p-6 w-[380px] max-w-[90vw] animate-dialog-enter"
      >
        <div className="flex items-start gap-4">
          {resolvedIcon && (
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                danger ? 'bg-red-100' : 'bg-primary-50'
              }`}
            >
              {resolvedIcon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-surface-800">{title}</h3>
            {description && (
              <p className="text-sm text-surface-500 mt-1 whitespace-pre-line">{description}</p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2.5 mt-6">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-surface-600 bg-surface-100 hover:bg-surface-200 rounded-lg transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
