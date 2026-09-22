import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useT } from '../../lib/i18n'
import { Checkbox } from './Checkbox'

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
  confirmText,
  cancelText,
  danger = false,
  loading = false,
  icon,
  showDontAskAgain = false,
  dontAskAgain = false,
  dontAskAgainText,
  onDontAskAgainChange,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // 默认按钮文案走 i18n：多数调用方只传 title/description，
  // 「确认 / 取消 / 本次不再提示」由本组件兜底，语言切换时同步更新。
  const t = useT()
  if (!open) return null

  const resolvedIcon = icon ?? (danger ? <AlertTriangle className="size-icon-lg text-danger-600" /> : null)

  // Portal 到 body：调用方可能处于任何层叠上下文中（如其他模态的子树），
  // 内联渲染会被祖先的 transform/filter 困在低层级、被 Modal 盖住。
  // z-[60] 高于普通模态（z-50），保证确认框叠在其上；同级多个 portal 时按
  // DOM 先后排序，ConfirmDialog 挂载更晚，自然位于所属模态之上。
  return createPortal(
    <div
      className="fixed inset-0 bg-[var(--material-overlay)] backdrop-blur-sm flex items-center justify-center animate-dialog-overlay-enter z-[60]"
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
            <Checkbox
              checked={dontAskAgain}
              onChange={(v) => onDontAskAgainChange?.(v)}
              ariaLabel={dontAskAgainText ?? t('dontAskAgain')}
              label={<span className="text-xs text-surface-500">{dontAskAgainText ?? t('dontAskAgain')}</span>}
            />
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              disabled={loading}
              className="btn btn-secondary"
            >
              {cancelText ?? t('cancel')}
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            >
              {loading && <Loader2 className="size-icon-md animate-spin" />}
              {confirmText ?? t('confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
