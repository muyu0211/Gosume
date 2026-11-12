import { useCallback, useEffect, useRef, useState } from 'react'
import { Events } from '@wailsio/runtime'
import {
  AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, FileArchive, Folder,
  HardDrive, Loader2, Upload, X,
} from 'lucide-react'
import { Modal, type ModalHandle } from './Modal'
import { useT } from '../../lib/i18n'
import { extractErrorMessage } from '../../lib/errorUtils'
import { isWails } from '../../services/backend'
import { listDirectory, statFile, type DirectoryListing, type FileStat } from '../../services/filePickerService'

/** 系统文件拖入事件：后端 WindowFilesDropped 钩子按拖放目标广播的负载。 */
const FILE_DROPPED = 'file:dropped'

/** 「此电脑」虚拟根节点：列出本机所有磁盘，磁盘根的上一级回到这里。 */
const FILE_BROWSER_COMPUTER_ROOT = '@root'

type FileSource = 'drop' | 'path'

export interface FilePickerDialogProps {
  /** 模态标题（调用方翻译好传入）。 */
  title: string
  /** 拖放目标标记（data-file-drop-target 属性值），后端据此过滤拖入文件扩展名。 */
  dropTarget: string
  /** 允许的扩展名（小写含点，如 ['.zip']）；同时用于目录列表过滤与路径校验。 */
  accept: string[]
  /** 拖入区标题（调用方翻译好传入，如「拖入 .zip 模板包」）。 */
  dropTitle: string
  /** 确认按钮文案。 */
  confirmLabel: string
  /** 文件体积上限（字节）；缺省用后端默认（10 MB）。 */
  maxBytes?: number
  /** 底部提示文案（可选）。 */
  hint?: string
  onClose: () => void
  /**
   * 用户点击确认按钮后调用。抛错会在模态内展示（模态保持打开），
   * 正常返回即播放退场动画并关闭。
   */
  onPick: (path: string) => Promise<void> | void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * 自封装文件选择模态：全应用统一的「不弹原生文件框」的选文件入口。
 *
 * - 拖入区接收 Wails 系统文件拖放事件（后端按 dropTarget 过滤扩展名后给绝对路径）；
 * - 路径选择区支持直接输入绝对路径，或浏览后端枚举出的目录列表（含「此电脑」跨盘）；
 * - 拖入/选择只负责「选中文件」，用户点击确认按钮后才交给调用方 onPick 处理；
 * - 外壳、按钮、配色全部复用 Modal / btn-* / 主题令牌，与其他模态风格一致。
 */
export function FilePickerDialog({
  title, dropTarget, accept, dropTitle, confirmLabel, maxBytes, hint, onClose, onPick,
}: FilePickerDialogProps) {
  const modalRef = useRef<ModalHandle>(null)
  const t = useT()
  const desktop = isWails()

  const [selected, setSelected] = useState<FileStat | null>(null)
  const [source, setSource] = useState<FileSource>('path')
  const [pathInput, setPathInput] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [working, setWorking] = useState(false)

  const [browseOpen, setBrowseOpen] = useState(false)
  const [listing, setListing] = useState<DirectoryListing | null>(null)
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseError, setBrowseError] = useState('')

  const invalidExtMessage = accept.length > 0
    ? t('filePickerInvalidExt').replace('{exts}', accept.join(' / '))
    : ''

  const matchesAccept = useCallback((path: string) => {
    if (accept.length === 0) return true
    const lower = path.toLowerCase()
    return accept.some((ext) => lower.endsWith(ext.toLowerCase()))
  }, [accept])

  /** 校验并选中一个路径（拖入与路径输入共用）。 */
  const selectPath = useCallback(async (raw: string, from: FileSource) => {
    const value = raw.trim()
    if (!value) return
    if (!matchesAccept(value)) {
      setError(invalidExtMessage)
      return
    }
    setError('')
    setNotice('')
    try {
      const stat = await statFile(value, accept, maxBytes)
      if (!stat) {
        setError(from === 'drop' ? t('filePickerDropFailed') : t('filePickerDesktopOnly'))
        return
      }
      if (!stat.matched) {
        setError(invalidExtMessage)
        return
      }
      setSelected(stat)
      setSource(from)
      setPathInput(stat.path)
    } catch (err) {
      setError(extractErrorMessage(err, from === 'drop' ? t('filePickerDropFailed') : invalidExtMessage))
    }
  }, [accept, invalidExtMessage, matchesAccept, maxBytes, t])

  // 事件回调通过 ref 持有最新的 selectPath / 文案，订阅本身只建立一次。
  const onDroppedRef = useRef<(paths: string[]) => void>(() => {})
  onDroppedRef.current = (paths) => {
    const first = paths[0]
    if (!first) return
    void selectPath(first, 'drop')
    // selectPath 会先清空 notice，因此多文件提示要放在其后设置
    if (paths.length > 1) setNotice(t('filePickerOnlyOne'))
  }

  // 仅在模态挂载期间订阅拖入事件；卸载时注销，避免监听泄漏。
  useEffect(() => {
    if (!desktop) return
    const off = Events.On(FILE_DROPPED, (ev) => {
      const payload = ev.data as { target?: string; paths?: unknown[] } | undefined
      if (payload?.target !== dropTarget) return
      const paths = Array.isArray(payload.paths)
        ? payload.paths.filter((p): p is string => typeof p === 'string' && !!p.trim())
        : []
      onDroppedRef.current(paths)
    })
    return off
  }, [desktop, dropTarget])

  const loadListing = async (path: string) => {
    setBrowseLoading(true)
    setBrowseError('')
    try {
      const result = await listDirectory(path, accept)
      if (!result) {
        setBrowseError(t('filePickerDesktopOnly'))
        return
      }
      setListing(result)
    } catch (err) {
      setBrowseError(extractErrorMessage(err, t('filePickerBrowseFailed')))
    } finally {
      setBrowseLoading(false)
    }
  }

  const toggleBrowse = () => {
    if (browseOpen) {
      setBrowseOpen(false)
      return
    }
    setBrowseOpen(true)
    if (!listing) void loadListing('')
  }

  const handleConfirm = async () => {
    if (!selected || working) return
    setWorking(true)
    setError('')
    try {
      await onPick(selected.path)
      modalRef.current?.close()
    } catch (err) {
      setError(extractErrorMessage(err, t('filePickerFailed')))
    } finally {
      setWorking(false)
    }
  }

  const rootLabel = (key: string) => t(`filePickerRoot${key.charAt(0).toUpperCase()}${key.slice(1)}`)
  const isComputerRoot = listing?.path === FILE_BROWSER_COMPUTER_ROOT

  return (
    <Modal
      ref={modalRef}
      onClose={onClose}
      width="w-[520px]"
      cardClassName="flex flex-col overflow-hidden"
      dismissible={!working}
    >
      {/* Header — 与导入简历 / 导入记录等模态同一套结构 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-surface-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
            <Upload className="size-icon-md text-primary-600" />
          </div>
          <h2 className="text-base font-semibold text-surface-800">{title}</h2>
        </div>
        <button
          onClick={() => modalRef.current?.close()}
          disabled={working}
          className="p-1.5 text-surface-400 hover:text-surface-600 rounded-lg hover:bg-surface-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <X className="size-icon-lg" />
        </button>
      </div>

      {/* Content — 定高滚动区，滚动范围恒等于真实内容高度 */}
      <div className="flex-1 min-h-[360px] max-h-[calc(90vh_-_120px)] overflow-y-auto template-import-scroll px-6 py-5 space-y-4">
        {!desktop && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-surface-200 bg-surface-50 text-xs text-surface-500">
            <AlertCircle className="size-icon-sm shrink-0 mt-0.5" />
            <span>{t('filePickerDesktopOnly')}</span>
          </div>
        )}

        {/* 拖入区：Wails runtime 命中该标记后自动挂 .file-drop-target-active */}
        <div
          data-file-drop-target={dropTarget}
          className="template-import-dropzone flex flex-col items-center justify-center gap-1.5 rounded-glass-card border-2 border-dashed border-surface-300 bg-surface-50/50 px-4 py-6 text-center transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center mb-1">
            <FileArchive className="size-icon-lg text-primary-600" />
          </div>
          <p className="text-sm font-medium text-surface-700">{dropTitle}</p>
          <p className="text-xs text-surface-400">{t('filePickerDropHint')}</p>
        </div>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-surface-200" />
          <span className="text-xs text-surface-400">{t('filePickerOr')}</span>
          <span className="h-px flex-1 bg-surface-200" />
        </div>

        {/* 路径选择：直接输入 + 模态内目录浏览（均不拉起原生文件框） */}
        <div>
          <label className="form-label">{t('filePickerPathLabel')}</label>
          <div className="flex items-center gap-2">
            <input
              className="form-input flex-1 min-w-0"
              value={pathInput}
              placeholder={t('filePickerPathPlaceholder')}
              disabled={!desktop || working}
              onChange={(e) => { setPathInput(e.target.value); setError('') }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void selectPath(pathInput, 'path')
                }
              }}
            />
            <button
              className="btn-secondary btn-sm shrink-0"
              disabled={!desktop || working || !pathInput.trim()}
              onClick={() => void selectPath(pathInput, 'path')}
            >
              {t('filePickerCheck')}
            </button>
            <button
              className="btn-secondary btn-sm shrink-0"
              disabled={!desktop || working}
              onClick={toggleBrowse}
            >
              {browseOpen ? t('filePickerHideBrowse') : t('filePickerBrowse')}
            </button>
          </div>
        </div>

        {browseOpen && (
          <div className="hairline-frame rounded-glass-card bg-surface-50/50 overflow-hidden">
            <div className="flex items-center gap-1.5 px-2 py-2 border-b border-surface-100 flex-wrap">
              {(listing?.roots ?? []).map((root) => (
                <button
                  key={root.key}
                  className="px-2 py-0.5 text-[11px] rounded-full bg-elev hairline-frame text-surface-600 hover:text-primary-600 transition-colors"
                  onClick={() => void loadListing(root.path)}
                >
                  {rootLabel(root.key)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-100">
              <button
                className="p-1 text-surface-400 hover:text-surface-600 rounded-md hover:bg-surface-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                disabled={!listing?.parent}
                title={t('filePickerParent')}
                onClick={() => { if (listing?.parent) void loadListing(listing.parent) }}
              >
                <ChevronLeft className="size-icon-sm" />
              </button>
              <span className="flex-1 min-w-0 truncate text-xs text-surface-500" title={listing?.path}>
                {isComputerRoot ? t('filePickerRootComputer') : (listing?.path ?? '…')}
              </span>
              {browseLoading && <Loader2 className="size-icon-sm animate-spin text-primary-500" />}
            </div>
            <div className="max-h-[180px] overflow-y-auto template-import-scroll py-1">
              {browseError ? (
                <p className="px-3 py-4 text-xs text-danger-500 text-center">{browseError}</p>
              ) : !browseLoading && (listing?.entries.length ?? 0) === 0 ? (
                <p className="px-3 py-4 text-xs text-surface-400 text-center">{t('filePickerEmptyDir')}</p>
              ) : (
                (listing?.entries ?? []).map((entry) => (
                  <button
                    key={entry.path}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-100 transition-colors"
                    onClick={() => {
                      if (entry.isDir) {
                        void loadListing(entry.path)
                      } else {
                        void selectPath(entry.path, 'path')
                        setBrowseOpen(false)
                      }
                    }}
                  >
                    {isComputerRoot
                      ? <HardDrive className="size-icon-sm shrink-0 text-primary-500" />
                      : entry.isDir
                        ? <Folder className="size-icon-sm shrink-0 text-primary-500" />
                        : <FileArchive className="size-icon-sm shrink-0 text-surface-400" />}
                    <span className="flex-1 min-w-0 truncate text-sm text-surface-700">{entry.name}</span>
                    {entry.isDir
                      ? <ChevronRight className="size-icon-sm shrink-0 text-surface-300" />
                      : <span className="shrink-0 text-[10px] text-surface-400">{formatSize(entry.size)}</span>}
                  </button>
                ))
              )}
            </div>
            {listing?.truncated && (
              <p className="px-3 py-1.5 border-t border-surface-100 text-[10px] text-surface-400">
                {t('filePickerTruncated')}
              </p>
            )}
          </div>
        )}

        {selected && (
          <div className="hairline-frame rounded-glass-card bg-success-50/40 px-3 py-2.5 flex items-center gap-3">
            <CheckCircle2 className="size-icon-lg shrink-0 text-success-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-surface-700 truncate">{selected.name}</p>
              <p className="text-[11px] text-surface-400 truncate" title={selected.path}>
                {formatSize(selected.size)} · {source === 'drop' ? t('filePickerFromDrop') : t('filePickerFromPath')} · {selected.path}
              </p>
            </div>
            <button
              className="btn-ghost btn-sm shrink-0"
              disabled={working}
              onClick={() => { setSelected(null); setError('') }}
            >
              {t('filePickerReplace')}
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-danger-200 bg-danger-50 text-xs text-danger-700">
            <AlertCircle className="size-icon-sm shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {notice && !error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-surface-200 bg-surface-50 text-xs text-surface-500">
            <AlertCircle className="size-icon-sm shrink-0 mt-0.5" />
            <span>{notice}</span>
          </div>
        )}
      </div>

      {/* Footer — 固定底部，保持与现有模态一致的操作区结构 */}
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-t border-surface-100 flex-shrink-0">
        <p className="flex-1 min-w-0 truncate text-[11px] text-surface-400">
          {hint}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            className="btn-secondary btn-sm"
            disabled={working}
            onClick={() => modalRef.current?.close()}
          >
            {t('cancel')}
          </button>
          <button
            className="btn-primary btn-sm"
            disabled={!desktop || !selected || working}
            onClick={() => void handleConfirm()}
          >
            {working ? <Loader2 className="size-icon-sm animate-spin" /> : <Upload className="size-icon-sm" />}
            {working ? t('filePickerWorking') : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
