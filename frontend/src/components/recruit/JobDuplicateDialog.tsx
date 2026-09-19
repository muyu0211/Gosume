import { useRef } from 'react'
import { useT } from '../../lib/i18n'
import { Modal, type ModalHandle } from '../ui/Modal'
import type { DuplicateCandidate } from '../../types/recruit'

interface Props {
  candidate: DuplicateCandidate
  /** 用新值更新原有条目 */
  onUpdate: () => void
  /** 忽略重复，仍然新建 */
  onKeepBoth: () => void
  onCancel: () => void
}

/**
 * 疑似重复确认（PRD §4.1 去重）。
 *
 * 命中强指纹（公司 + 环节 + 轮次 + 日期）时由后端返回候选，
 * 这里只做「更新原有 / 仍然新建 / 取消」三选一，**不自动合并**——
 * 字段差异逐行列出，由用户判断哪边是对的。
 */
export function JobDuplicateDialog({ candidate, onUpdate, onKeepBoth, onCancel }: Props) {
  const t = useT()
  const modalRef = useRef<ModalHandle>(null)
  const act = (fn: () => void) => {
    modalRef.current?.close()
    fn()
  }

  return (
    <Modal ref={modalRef} onClose={onCancel} width="w-[560px]" cardClassName="flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-3">
        <h2 className="text-base font-semibold text-surface-800">{t('dupTitle')}</h2>
        <p className="text-sm text-surface-500 mt-1">
          {t('dupWeakHint').replace('{date}', (candidate.job.event_time ?? candidate.job.deadline ?? '').slice(0, 10))}
        </p>
      </div>

      <div className="gosume-modal-scroll flex-1 overflow-auto px-6 pb-2">
        {candidate.diffs.length === 0 ? (
          <p className="text-sm text-surface-500">{t('dupTitle')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-surface-400">
                <th className="text-left font-medium py-1">{t('dupField')}</th>
                <th className="text-left font-medium py-1">{t('dupCurrent')}</th>
                <th className="text-left font-medium py-1">{t('dupIncoming')}</th>
              </tr>
            </thead>
            <tbody>
              {candidate.diffs.map((d) => (
                <tr key={String(d.field)} className="border-t border-hairline border-surface-300">
                  <td className="py-2 text-surface-500 whitespace-nowrap">{String(d.field)}</td>
                  <td className="py-2 text-surface-600 break-all">{d.current || '—'}</td>
                  <td className="py-2 text-surface-800 break-all">{d.incoming || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="px-6 py-4 flex items-center justify-end gap-2">
        <button type="button" onClick={() => modalRef.current?.close()} className="btn btn-secondary">
          {t('dupCancel')}
        </button>
        <button type="button" onClick={() => act(onKeepBoth)} className="btn btn-secondary">
          {t('dupKeepBoth')}
        </button>
        <button type="button" onClick={() => act(onUpdate)} className="btn btn-primary">
          {t('dupUpdate')}
        </button>
      </div>
    </Modal>
  )
}
