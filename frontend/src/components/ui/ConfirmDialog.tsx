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
  /** 是否展示「本次不再提示」勾选框。 */
  showDontAskAgain?: boolean
  /** 勾选框的受控状态。 */
  dontAskAgain?: boolean
  /** 勾选框文案。 */
  dontAskAgainText?: string
  /** 勾选框状态变更回调。 */
  onDontAskAgainChange?: (checked: boolean) => void
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
  showDontAskAgain = false,
  dontAskAgain = false,
  dontAskAgainText = '本次不再提示',
  onDontAskAgainChange,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  const resolvedIcon = icon ?? (danger ? <AlertTriangle className="size-icon-lg text-danger-600" /> : null)

  return (
    <div
      className="fixed inset-0 bg-[var(--material-overlay)] backdrop-blur-sm flex items-center justify-center animate-dialog-overlay-enter z-50"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass glass-modal p-6 w-[380px] max-w-[90vw] animate-dialog-enter"
      >
        <div className="flex items-start gap-4">
          {resolvedIcon && (
            <div
              className={`size-ctl-xl rounded-full flex items-center justify-center shrink-0 ${
                danger ? 'bg-danger-100' : 'bg-primary-50'
              }`}
            >
              {resolvedIcon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-surface-800">{title}</h3>
            {description && (
              <p className="text-sm text-surface-500 mt-1 whitespace-pre-line break-all break-words">{description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 mt-6">
          {showDontAskAgain ? (
            <label className="flex items-center gap-2 text-xs text-surface-500 cursor-pointer select-none">
              <input
                type="checkbox"
                className="size-icon-sm rounded border-surface-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                checked={dontAskAgain}
                onChange={(e) => onDontAskAgainChange?.(e.target.checked)}
              />
              <span>{dontAskAgainText}</span>
            </label>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              disabled={loading}
              className="btn btn-secondary"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            >
              {loading && <Loader2 className="size-icon-md animate-spin" />}
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
