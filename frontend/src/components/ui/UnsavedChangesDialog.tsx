import { AlertTriangle, Loader2, X } from 'lucide-react'
import { Tooltip } from './Tooltip'

interface Props {
  open: boolean
  /** 「保存并继续」进行中，按钮置灰并显示 loading。 */
  saving: boolean
  /** 保存并继续（确认）。 */
  onSaveAndContinue: () => void
  /** 不保存并继续（取消）。 */
  onDiscardAndContinue: () => void
  /** 关闭弹窗，不执行（点遮罩 / Esc / X）。 */
  onClose: () => void
}

/**
 * 未保存更改确认对话框（离开编辑页 / 关闭窗口前的二确）。
 *
 * 三个出口与用户语义一一对应：
 * - 「保存并继续」→ 保存后执行挂起的离开动作
 * - 「不保存并继续」→ 丢弃更改并执行挂起的离开动作
 * - 关闭弹窗（遮罩 / X / Esc）→ 什么都不做，停留在原处
 */
export function UnsavedChangesDialog({ open, saving, onSaveAndContinue, onDiscardAndContinue, onClose }: Props) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-[var(--material-overlay)] backdrop-blur-sm flex items-center justify-center animate-dialog-overlay-enter z-50"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass glass-modal p-6 w-[400px] max-w-[90vw] animate-dialog-enter"
      >
        <div className="flex items-start gap-4">
          <div className="size-ctl-xl rounded-full bg-warning-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="size-icon-lg text-warning-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-surface-800">未保存的更改</h3>
            <p className="text-sm text-surface-500 mt-1 leading-relaxed">
              当前简历有尚未保存的修改，是否先保存再离开？
            </p>
          </div>
          <Tooltip label="取消操作，停留在当前页面">
            <button
              onClick={onClose}
              disabled={saving}
              className="p-1 -m-1 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-100 transition-colors disabled:opacity-50"
              aria-label="关闭"
            >
              <X className="size-icon-md" />
            </button>
          </Tooltip>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onDiscardAndContinue}
            disabled={saving}
            className="btn btn-secondary"
          >
            不保存
          </button>
          <button
            onClick={onSaveAndContinue}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving && <Loader2 className="size-icon-md animate-spin" />}
            {saving ? '保存中...' : '保存并继续'}
          </button>
        </div>
      </div>
    </div>
  )
}
