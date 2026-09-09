import { useMemo, useRef, useState } from 'react'
import { X, Loader2, Check, AlertTriangle, FileJson, FilePlus2, RefreshCw } from 'lucide-react'
import { callService } from '../../services/backend'
import { extractErrorMessage } from '../../lib/errorUtils'
import { useT } from '../../lib/i18n'
import { useAppStore } from '../../stores/appStore'
import { useResumeStore } from '../../stores/resumeStore'
import { useTemplateStore } from '../../stores/templateStore'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { CustomSelect } from '../ui/CustomSelect'
import { Expandable } from '../ui/Expandable'
import { Modal, type ModalHandle } from '../ui/Modal'
import type { FileParseResult, FileImportResponse } from '../../types/gosume_file'

interface Props {
  preview: FileParseResult
  onClose: () => void
  /** 导入成功后回调（result.mode 为 new → 前端进入编辑器；overwrite → 前端刷新列表）。 */
  onImported: (result: FileImportResponse, finalTemplateId: string) => void
}

type ImportMode = 'new' | 'overwrite'

/**
 * 中间态导入预览对话框（PRD F2：选择文件 → 解析校验 → 预览确认 → 生成简历）。
 *
 * - 预览区：简历名、导出信息、区块条目统计；
 * - 模板区：原模板匹配成功显示绿标；缺失时警示并让用户从当前模板中选择替代
 *   （数据与模板解耦，仅样式换模板，内容不丢失）；
 * - 导入方式：新建（默认）/ 覆盖已有简历（二次确认，危险操作）。
 */
export function ImportPreviewDialog({ preview, onClose, onImported }: Props) {
  const t = useT()
  const lang = useAppStore((s) => s.language)
  const resumeList = useResumeStore((s) => s.resumeList)
  const templates = useTemplateStore((s) => s.templates)

  const [mode, setMode] = useState<ImportMode>('new')
  const [targetId, setTargetId] = useState('')
  const [chosenTemplateId, setChosenTemplateId] = useState('')
  const [importing, setImporting] = useState(false)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  const [error, setError] = useState('')
  const modalRef = useRef<ModalHandle>(null)

  const templateMatched = preview.template.matched

  // 匹配成功时优先展示匹配模板名称；模板列表未加载时回退显示 id
  const matchedTemplateName = useMemo(() => {
    if (!preview.template.matched_id) return ''
    return templates.find((t) => t.id === preview.template.matched_id)?.name ?? preview.template.matched_id
  }, [templates, preview.template.matched_id])

  const targetName = useMemo(
    () => resumeList.find((r) => r.id === targetId)?.name ?? '',
    [resumeList, targetId],
  )

  const finalTemplateId = templateMatched
    ? preview.template.matched_id || preview.resume.meta.template_id
    : chosenTemplateId

  const canImport =
    !importing &&
    !!finalTemplateId &&
    (mode === 'new' || (mode === 'overwrite' && !!targetId))

  const doImport = async () => {
    setImporting(true)
    setError('')
    try {
      const result = await callService<FileImportResponse>('FileService', 'ImportFile', {
        resume: preview.resume,
        target_id: mode === 'overwrite' ? targetId : '',
        template_id: finalTemplateId,
      })
      if (result) {
        onImported(result, finalTemplateId)
      }
    } catch (err) {
      console.error('Import gosume file failed:', err)
      setError(extractErrorMessage(err, t('importFailedRetry')))
    } finally {
      setImporting(false)
      setConfirmOverwrite(false)
    }
  }

  const handleImport = () => {
    if (!canImport) return
    // 覆盖是危险操作：先弹二次确认（PRD F2 / 风险表「覆盖误操作」）
    if (mode === 'overwrite') {
      setConfirmOverwrite(true)
      return
    }
    void doImport()
  }

  const summary = preview.summary
  const stats = [
    { label: t('statJobs'), value: summary.jobs },
    { label: t('statEducation'), value: summary.education },
    { label: t('statProjects'), value: summary.projects },
    { label: t('statSkills'), value: summary.skills },
    { label: t('statLanguages'), value: summary.languages },
    { label: t('statAwards'), value: summary.awards },
  ]

  return (
    <>
      <Modal ref={modalRef} onClose={onClose} width="w-[520px]" cardClassName="flex flex-col overflow-hidden">
        {/* Header — 固定在顶部，不参与滚动 */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-surface-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
              <FileJson className="w-4 h-4 text-primary-600" />
            </div>
            <h2 className="text-base font-semibold text-surface-800">{t('importResume')}</h2>
          </div>
          <button
            onClick={() => modalRef.current?.close()}
            disabled={importing}
            className="p-1.5 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content — 中间唯一可滚动区域 */}
        <div className="p-6 space-y-5 flex-1 overflow-auto">
          {/* 预览摘要 */}
          <div className="rounded-xl border border-surface-200 bg-surface-50/50 p-4">
            <p className="text-base font-semibold text-surface-800 truncate">
              {summary.name || t('resumeTitlePlaceholder')}
            </p>
            <p className="text-xs text-surface-400 mt-1">
                {new Date(preview.exported_at).toLocaleString(lang === 'en-US' ? 'en-US' : 'zh-CN')}
                {preview.app_version ? ` · Gosume v${preview.app_version}` : ''}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {stats.map(({ label, value }) => (
                  <span
                    key={label}
                    className="px-2 py-0.5 text-[12px] rounded-full bg-elev border border-surface-200 text-surface-600"
                  >
                    {label} {value}
                  </span>
                ))}
              </div>
            </div>

            {/* 模板区 */}
            <div>
              <label className="text-sm font-medium text-surface-600 mb-2 block">{t('template')}</label>
              {templateMatched ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-sm text-emerald-700">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{t('originalTemplateAvailable').replace('{name}', matchedTemplateName)}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-100 text-sm text-amber-700">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      {t('originalTemplateMissing').replace('{name}', preview.template.referenced_name || t('unknownTemplate'))}
                    </span>
                  </div>
                  <CustomSelect
                    value={chosenTemplateId}
                    onChange={setChosenTemplateId}
                    options={preview.template.available.map((av) => ({
                      value: av.id,
                      label: av.name,
                      hint: av.is_builtin ? t('builtinTemplate') : t('userTemplateVersion').replace('{version}', av.version || ''),
                    }))}
                    placeholder={t('selectReplacementTemplate')}
                    emptyText={t('noAvailableTemplates')}
                  />
                </div>
              )}
            </div>

            {/* 导入方式 */}
            <div>
              <label className="text-sm font-medium text-surface-600 mb-2 block">{t('importMethod')}</label>
              <div className="space-y-2">
                <label
                  className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                    mode === 'new' ? 'border-primary-400 bg-primary-50/40' : 'border-surface-200 hover:border-surface-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="import-mode"
                    checked={mode === 'new'}
                    onChange={() => setMode('new')}
                    className="mt-0.5 accent-primary-600"
                  />
                  <FilePlus2 className={`w-5 h-5 mt-0.5 ${mode === 'new' ? 'text-primary-500' : 'text-surface-400'}`} />
                  <div>
                    <p className="text-sm font-medium text-surface-700">{t('newResumeOption')}</p>
                    <p className="text-xs text-surface-400 mt-0.5">{t('newResumeDesc')}</p>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                    mode === 'overwrite' ? 'border-primary-400 bg-primary-50/40' : 'border-surface-200 hover:border-surface-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="import-mode"
                    checked={mode === 'overwrite'}
                    onChange={() => setMode('overwrite')}
                    className="mt-0.5 accent-primary-600"
                  />
                  <RefreshCw className={`w-5 h-5 mt-0.5 ${mode === 'overwrite' ? 'text-primary-500' : 'text-surface-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-700">{t('overwriteResumeOption')}</p>
                    <p className="text-xs text-surface-400 mt-0.5">{t('overwriteResumeDesc')}</p>
                  </div>
                </label>
                <Expandable show={mode === 'overwrite'} className="pl-8" gapTop={8}>
                  <CustomSelect
                    value={targetId}
                    onChange={setTargetId}
                    options={resumeList.map((r) => ({
                      value: r.id,
                      label: r.name || t('resumeTitlePlaceholder'),
                      hint: new Date(r.updated_at).toLocaleString(lang === 'en-US' ? 'en-US' : 'zh-CN'),
                    }))}
                    placeholder={t('selectTargetResume')}
                    emptyText={t('noResumeToOverwrite')}
                  />
                </Expandable>
              </div>
            </div>

            <Expandable show={!!error} gapTop={20}>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            </Expandable>

            <Expandable show={importing} gapTop={20}>
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-blue-50 border border-blue-100">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                <span className="text-sm text-blue-700">{t('importingElipsis')}</span>
              </div>
            </Expandable>
          </div>

          {/* Footer — 固定在底部，不参与滚动 */}
          <div className="flex justify-end gap-2.5 px-6 py-3 border-t border-surface-100 flex-shrink-0 bg-elev">
            <button onClick={() => modalRef.current?.close()} className="btn-secondary" disabled={importing}>
              {t('cancel')}
            </button>
            <button
              onClick={handleImport}
              disabled={!canImport}
              className="btn-primary gap-2"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'overwrite' ? <RefreshCw className="w-4 h-4" /> : <FilePlus2 className="w-4 h-4" />}
              {mode === 'overwrite' ? t('overwriteImportBtn') : t('newImportBtn')}
            </button>
          </div>
      </Modal>

      {/* 覆盖二次确认（危险操作） */}
      <ConfirmDialog
        open={confirmOverwrite}
        title={t('overwriteResumeOption')}
        description={t('overwriteConfirmDesc').replace('{name}', targetName)}
        confirmText={t('confirmOverwriteBtn')}
        danger
        loading={importing}
        onConfirm={() => void doImport()}
        onCancel={() => setConfirmOverwrite(false)}
      />
    </>
  )
}
