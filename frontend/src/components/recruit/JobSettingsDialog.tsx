import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { useT } from '../../lib/i18n'
import { Modal, type ModalHandle } from '../ui/Modal'
import { CustomSelect } from '../ui/CustomSelect'
import { Checkbox } from '../ui/Checkbox'
import { RadioGroup } from '../ui/RadioGroup'
import { useRecruitStore } from '../../stores/recruitStore'
import { extractErrorMessage } from '../../lib/errorUtils'
import type { ImportReport } from '../../types/recruit'

interface Props {
  onClose: () => void
}

const THRESHOLDS = [12, 24, 48, 72]

/** 导入重复处理策略。 */
type ImportStrategy = 'skip' | 'overwrite' | 'new'

/**
 * 求职进程模块设置：临近阈值、原文保存开关、导出 / 导入。
 *
 * 用 Modal 而非浮层：导出/导入有结果反馈与策略选择，浮层承载不下。
 *
 * 版式纪律：分组之间只用一条 `--hairline` 分隔线，**不给分组再套矩形边框**——
 * 边框 + 玻璃材质会叠加出「双层描边」的脏感；复选框与单选都用自绘组件
 * （原生控件在深色主题下无法令牌化）。
 */
export function JobSettingsDialog({ onClose }: Props) {
  const t = useT()
  const modalRef = useRef<ModalHandle>(null)
  const settings = useRecruitStore((s) => s.settings)
  const setSettings = useRecruitStore((s) => s.setSettings)
  const exportJobs = useRecruitStore((s) => s.exportJobs)
  const importJobs = useRecruitStore((s) => s.importJobs)

  const [strategy, setStrategy] = useState<ImportStrategy>('skip')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)

  const run = async (fn: () => Promise<string>) => {
    setBusy(true)
    setMessage('')
    setFailed(false)
    try {
      setMessage(await fn())
    } catch (err) {
      setFailed(true)
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleExport = (format: 'csv' | 'json') =>
    run(async () => {
      const res = await exportJobs(format)
      return t('jobExportDone').replace('{path}', res.path)
    })

  const handleImport = () =>
    run(async () => {
      const r: ImportReport = await importJobs(strategy)
      return t('importReport')
        .replace('{created}', String(r.created))
        .replace('{skipped}', String(r.skipped))
        .replace('{overwritten}', String(r.overwritten))
    })

  return (
    <Modal ref={modalRef} onClose={onClose} width="w-[480px]" cardClassName="flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <h2 className="text-base font-semibold text-surface-800">{t('settings')}</h2>
      </div>

      <div className="gosume-modal-scroll flex-1 overflow-auto px-6 pb-2">
        {/* 提醒 */}
        <Section title={t('settingsNearThreshold')}>
          <CustomSelect
            value={String(settings.nearThresholdHours)}
            onChange={(v) =>
              setSettings({ nearThresholdHours: Number.parseInt(v, 10) }).catch((err) => {
                setFailed(true)
                setMessage(extractErrorMessage(err))
              })
            }
            options={THRESHOLDS.map((h) => ({
              value: String(h),
              label: t('thresholdHours').replace('{count}', String(h)),
            }))}
          />
          <Checkbox
            className="mt-3"
            checked={settings.saveRawText}
            onChange={(v) =>
              setSettings({ saveRawText: v }).catch((err) => {
                // 后端保存失败（如绑定缺失）必须可见：否则勾选状态纹丝不动像「点不动」
                setFailed(true)
                setMessage(extractErrorMessage(err))
              })
            }
            label={t('settingsSaveRaw')}
          />
        </Section>

        <Divider />

        {/* 导出 */}
        <Section title={t('export')}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleExport('csv')}
              className="btn btn-secondary"
            >
              <Download className="size-icon-md" strokeWidth={1.75} />
              {t('exportCsv')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleExport('json')}
              className="btn btn-secondary"
            >
              <Download className="size-icon-md" strokeWidth={1.75} />
              {t('exportJson')}
            </button>
          </div>
        </Section>

        <Divider />

        {/* 导入 */}
        <Section title={t('importJson')}>
          <p className="text-xs text-surface-400 mb-2">{t('importStrategy')}</p>
          <RadioGroup<ImportStrategy>
            value={strategy}
            onChange={setStrategy}
            ariaLabel={t('importStrategy')}
            options={[
              { value: 'skip', label: t('importSkip') },
              { value: 'overwrite', label: t('importOverwrite') },
              { value: 'new', label: t('importNew') },
            ]}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleImport()}
            className="btn btn-secondary mt-3"
          >
            <Upload className="size-icon-md" strokeWidth={1.75} />
            {t('importJson')}
          </button>
        </Section>

        {message && (
          <p className={`mt-4 text-sm break-all ${failed ? 'text-danger-600' : 'text-surface-600'}`}>
            {message}
          </p>
        )}
      </div>

      <div className="px-6 py-4 flex justify-end">
        <button type="button" onClick={() => modalRef.current?.close()} className="btn btn-primary">
          {t('ok')}
        </button>
      </div>
    </Modal>
  )
}

/** 设置分组：小标题 + 内容，间距走固定阶梯。 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-3">
      <h3 className="text-xs text-surface-500 mb-2">{title}</h3>
      {children}
    </section>
  )
}

/** 分组分隔线：用 hairline 令牌，不用满边框。 */
function Divider() {
  return <div className="border-t border-hairline border-surface-300" />
}
