import { Download, FileText, Image, Loader2, Check, XCircle } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { useT } from '../../lib/i18n'
import type { BatchExportFormat } from '../../hooks/useResumeBatch'

interface Props {
  /** 选中份数（用于文案占位）。 */
  count: number
  format: BatchExportFormat
  onFormatChange: (format: BatchExportFormat) => void
  scale: number
  onScaleChange: (scale: number) => void
  /** 进度 0-100；null 表示尚未开始。 */
  progress: number | null
  exporting: boolean
  done: boolean
  /** 用户取消了原生保存对话框：导出已中止，文案需与「导出完成」区分。 */
  canceled?: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * 批量导出弹窗（首页一级简历区与全部简历抽屉共用）。
 * 文案与选项沿用原抽屉实现，外壳改为 `Modal` 以符合模态窗口规范。
 */
export function BatchExportDialog({
  count,
  format,
  onFormatChange,
  scale,
  onScaleChange,
  progress,
  exporting,
  done,
  canceled = false,
  onCancel,
  onConfirm,
}: Props) {
  const t = useT()

  return (
    <Modal onClose={onCancel} width="w-[400px]" cardClassName="p-6">
      <div className="flex items-start gap-4 mb-5">
        <div className="size-ctl-xl rounded-full bg-primary-100 flex items-center justify-center">
          <Download className="size-icon-lg text-primary-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-surface-800">{t('batchExportTitle')}</h3>
          <p className="text-sm text-surface-500 mt-1">
            {t('batchExportDesc').replace('{count}', String(count))}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* 格式选择 */}
        <div>
          <label className="text-sm font-medium text-surface-600 mb-2 block">{t('chooseFormat')}</label>
          <div className="flex gap-2">
            {[
              { id: 'pdf' as const, label: 'PDF', icon: FileText },
              { id: 'png' as const, label: 'PNG', icon: Image },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => onFormatChange(id)}
                disabled={exporting}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm rounded-lg border-2 transition-all duration-150 disabled:opacity-50 ${
                  format === id
                    ? 'border-primary-400 bg-primary-50 text-primary-700 font-medium'
                    : 'border-surface-200 text-surface-600 hover:border-surface-300'
                }`}
              >
                <Icon className="size-icon-md" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {format === 'png' && (
          <div>
            <label className="text-sm font-medium text-surface-600 mb-2 block">{t('clarity')}</label>
            <div className="flex gap-2">
              {[
                { value: 1, label: '1x' },
                { value: 1.5, label: '1.5x' },
                { value: 2, label: '2x' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => onScaleChange(value)}
                  disabled={exporting}
                  className={`px-4 py-2 text-sm rounded-lg border-2 transition-all duration-150 disabled:opacity-50 ${
                    scale === value
                      ? 'border-primary-400 bg-primary-50 text-primary-700 font-medium'
                      : 'border-surface-200 text-surface-600 hover:border-surface-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 导出进度条：由后端 export:progress 事件驱动，导出完成后保持显示 */}
      {progress != null && (
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-surface-500 mb-1.5">
            <span className="flex items-center gap-1.5">
              {exporting ? (
                <Loader2 className="size-icon-sm text-primary-500 animate-spin" />
              ) : canceled ? (
                <XCircle className="size-icon-sm text-surface-400" />
              ) : (
                <Check className="size-icon-sm text-success-500" />
              )}
              {exporting
                ? t('exportingStatus')
                : canceled
                  ? t('exportCanceledStatus')
                  : t('exportFinishedStatus')}{' '}
              {t('piecesCount').replace(
                '{n}',
                `${Math.min(Math.round(((progress / 100) * count)), count)}/${count}`,
              )}
            </span>
            <span className="tabular-nums font-medium text-surface-600">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-surface-100 overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 mt-6">
        <button onClick={onCancel} disabled={exporting} className="btn btn-secondary">
          {t('cancel')}
        </button>
        <button onClick={onConfirm} disabled={exporting} className="btn btn-primary">
          {exporting ? (
            <>
              <Loader2 className="size-icon-md animate-spin" />
              {t('exportingElipsis')}
            </>
          ) : done ? (
            canceled ? t('close') : t('exportDoneLabel')
          ) : (
            t('exportFormat').replace('{format}', format.toUpperCase())
          )}
        </button>
      </div>
    </Modal>
  )
}
