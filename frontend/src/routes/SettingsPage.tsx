import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Globe, Palette, HardDrive, FolderOpen, Info, ArrowLeft, Loader2, CheckCircle, AlertCircle, Download, Plug, Copy, Check, Wrench } from 'lucide-react'
import { AnimatedPage } from '../components/ui/AnimatedPage'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { UpdateDialog, type UpdateInfo } from '../components/ui/UpdateDialog'
import { ToolsPanel } from '../components/tools/ToolsPanel'
import { useThemeStore } from '../stores/themeStore'
import { useAppStore } from '../stores/appStore'
import { callService } from '../services/backend'
import { getAppVersion } from '../services/systemService'
import { extractErrorMessage } from '../lib/errorUtils'
import { useT } from '../lib/i18n'
import type { ThemeMode } from '../lib/theme'

const AUTOSAVE_PREF_KEY = 'resume-craft-autosave-enabled'

/** 左右分栏宽度（%）持久化键与范围。 */
const SPLIT_KEY = 'gosume-settings-split'
const SPLIT_RANGE = { min: 28, max: 72 }

function readSplit(): number {
  const v = Number(localStorage.getItem(SPLIT_KEY))
  if (!Number.isFinite(v)) return 42
  return Math.min(SPLIT_RANGE.max, Math.max(SPLIT_RANGE.min, v))
}

function getAutoSavePref(): boolean {
  const v = localStorage.getItem(AUTOSAVE_PREF_KEY)
  if (v === null) return true
  return v === 'true'
}

export function SettingsPage() {
  const navigate = useNavigate()
  // 设置页「语言」控制应用 UI 语言（应用界面），与简历语言（resume.meta.language）解耦；
  // 简历语言由编辑页顶部「中英切换」单独控制。
  const appLang = useAppStore((s) => s.language)
  const setAppLang = useAppStore((s) => s.setLanguage)
  const t = useT()
  const [autoSave, setAutoSave] = useState(getAutoSavePref)

  // 左右分栏拖拽：根据指针在容器内的横向偏移换算百分比，钳制在 SPLIT_RANGE 内并持久化。
  const containerRef = useRef<HTMLDivElement>(null)
  const [split, setSplit] = useState(readSplit)
  const handleSplitDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = containerRef.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    if (rect.width === 0) return
    const pct = Math.min(SPLIT_RANGE.max, Math.max(SPLIT_RANGE.min, ((e.clientX - rect.left) / rect.width) * 100))
    setSplit(pct)
    localStorage.setItem(SPLIT_KEY, String(pct))
  }

  // 主题选项（跟随系统/经典/麦色/深色），切换即时生效并持久化。
  const themeMode = useThemeStore((s) => s.mode)
  const handleThemeChange = async (mode: ThemeMode) => {
    await useThemeStore.getState().setMode(mode)
  }
  const themeOptions: Array<{ value: ThemeMode; titleKey: string; descKey: string }> = [
    { value: 'system', titleKey: 'themeSystem', descKey: 'themeSystemDesc' },
    { value: 'wheat', titleKey: 'themeWheat', descKey: 'themeWheatDesc' },
    { value: 'obsidian', titleKey: 'themeObsidian', descKey: 'themeObsidianDesc' },
    { value: 'classic', titleKey: 'themeClassic', descKey: 'themeClassicDesc' },
  ]

  const [appVersion, setAppVersion] = useState('')

  // 应用版本号来自后端 SystemService.GetAppVersion（编译期嵌入的 app.yaml）
  useEffect(() => {
    let cancelled = false
    getAppVersion().then((version) => {
      if (!cancelled) setAppVersion(version)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Data directory state
  const [dataDir, setDataDir] = useState('')
  const [isChangingDir, setIsChangingDir] = useState(false)
  const [dirStatus, setDirStatus] = useState<'' | 'success' | 'error'>('')
  const [dirErrorMsg, setDirErrorMsg] = useState('')
  const [pendingDir, setPendingDir] = useState<string | null>(null)

  // Update check state
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<'' | 'latest' | 'error'>('')
  const [updateMsg, setUpdateMsg] = useState('')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)

  // 检查更新：拉取服务端 appcast 并与当前版本比较
  const handleCheckUpdate = async () => {
    setCheckingUpdate(true)
    setUpdateStatus('')
    try {
      const info = await callService<UpdateInfo | null>('UpdateService', 'CheckUpdate')
      if (!info) {
        setUpdateStatus('error')
        setUpdateMsg(t('updateCheckUnsupported'))
        return
      }

      // 存在更新
      if (info.has_update) {
        setUpdateInfo(info)
      } else {
        setUpdateStatus('latest')
        setUpdateMsg(info.tips || t('upToDate'))
      }
    } catch (err) {
      setUpdateStatus('error')
      setUpdateMsg(extractErrorMessage(err, t('updateCheckFailed')))
    } finally {
      setCheckingUpdate(false)
    }
  }

  useEffect(() => {
    callService<string>('SystemService', 'GetDataDir')
      .then((dir) => {
        if (dir) setDataDir(dir)
      })
      .catch(() => { })
  }, [])

  // ---- 一键填入本地桥：展示配对码供浏览器扩展使用 ----
  type AutofillStatus = { running: boolean; port: number; token: string; resume_name?: string }
  const [autofill, setAutofill] = useState<AutofillStatus | null>(null)
  const [pairCopied, setPairCopied] = useState(false)

  useEffect(() => {
    callService<AutofillStatus>('AutofillService', 'GetStatus')
      .then((s) => s && setAutofill(s))
      .catch(() => { })
  }, [])

  const pairingCode = autofill?.port && autofill?.token
    ? `gosume://autofill?port=${autofill.port}&token=${autofill.token}`
    : ''

  const handleCopyPair = async () => {
    if (!pairingCode) return
    try {
      await navigator.clipboard.writeText(pairingCode)
      setPairCopied(true)
      setTimeout(() => setPairCopied(false), 1500)
    } catch {
      /* clipboard 不可用时静默失败 */
    }
  }

  const handleLanguageChange = (lang: string) => {
    // 设置页语言 = 应用 UI 语言；不写 resume.meta.language（简历语言由编辑页切换）
    setAppLang(lang as 'zh-CN' | 'en-US')
  }

  const handleAutoSaveChange = (enabled: boolean) => {
    setAutoSave(enabled)
    localStorage.setItem(AUTOSAVE_PREF_KEY, String(enabled))
  }

  const handleChangeDataDir = async () => {
    setDirStatus('')
    setDirErrorMsg('')

    // Step 1: Open native folder picker
    try {
      const dir = await callService<string>('SystemService', 'PickDataDir')
      if (!dir) return // user cancelled

      // Step 2: 弹出确认模态（复用 ConfirmDialog，替代 window.confirm）
      setPendingDir(dir)
    } catch (err: any) {
      setDirStatus('error')
      setDirErrorMsg(err?.message || String(err))
    }
  }

  const confirmChangeDataDir = async () => {
    if (!pendingDir) return
    const dir = pendingDir

    // Step 3: Migrate（迁移期间模态保持打开并显示 loading）
    setIsChangingDir(true)
    try {
      await callService('SystemService', 'SetDataDir', dir)
      setDataDir(dir)
      setDirStatus('success')
      setTimeout(() => setDirStatus(''), 3000)
    } catch (err: any) {
      setDirStatus('error')
      setDirErrorMsg(err?.message || String(err))
    } finally {
      setIsChangingDir(false)
      setPendingDir(null)
    }
  }

  return (
    <AnimatedPage className="h-full flex flex-col bg-surface-50">
      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-4 bg-elev border-b border-surface-100">
        <button
          onClick={() => navigate(-1)}
          className="btn-ghost btn-sm"
          title={t('back')}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Settings className="w-5 h-5 text-surface-500" />
        <h1 className="text-lg font-semibold text-surface-800">{t('settings')}</h1>
      </header>

      {/* Settings Content: left = base settings, right = toolbox, split is draggable */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        <div className="min-w-0 overflow-y-auto p-6" style={{ flexBasis: `${split}%`, flexShrink: 0 }}>
          {/* Language */}
        <section className="form-section">
          <div className="form-section-header">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-surface-400" />
              <span className="form-section-title">{t('languageSection')}</span>
            </div>
          </div>
          <div className="space-y-3">
            <label className="flex items-center gap-3 p-3 rounded-lg border border-surface-200 cursor-pointer hover:bg-surface-50">
              <input
                type="radio"
                name="language"
                value="zh-CN"
                checked={appLang === 'zh-CN'}
                onChange={() => handleLanguageChange('zh-CN')}
                className="accent-primary-600"
              />
              <div>
                <p className="text-sm font-medium text-surface-700">简体中文</p>
                <p className="text-xs text-surface-400">{t('useZhInterface')}</p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-lg border border-surface-200 cursor-pointer hover:bg-surface-50">
              <input
                type="radio"
                name="language"
                value="en-US"
                checked={appLang === 'en-US'}
                onChange={() => handleLanguageChange('en-US')}
                className="accent-primary-600"
              />
              <div>
                <p className="text-sm font-medium text-surface-700">English</p>
                <p className="text-xs text-surface-400">Use English interface</p>
              </div>
            </label>
          </div>
        </section>

        {/* Appearance: theme mode (follow system / classic / wheat / obsidian) */}
        <section className="form-section">
          <div className="form-section-header">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-surface-400" />
              <span className="form-section-title">{t('appearance')}</span>
            </div>
          </div>
          <div className="space-y-2">
            {themeOptions.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-3 p-3 rounded-lg border border-surface-200 cursor-pointer hover:bg-surface-50"
              >
                <input
                  type="radio"
                  name="theme"
                  value={opt.value}
                  checked={themeMode === opt.value}
                  onChange={() => handleThemeChange(opt.value)}
                  className="accent-primary-600"
                />
                <div>
                  <p className="text-sm font-medium text-surface-700">{t(opt.titleKey)}</p>
                  <p className="text-xs text-surface-400">{t(opt.descKey)}</p>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Auto Save */}
        <section className="form-section">
          <div className="form-section-header">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-surface-400" />
              <span className="form-section-title">{t('autosaveSection')}</span>
            </div>
          </div>
          <label className="flex items-center justify-between p-3 rounded-lg border border-surface-200">
            <div>
              <p className="text-sm font-medium text-surface-700">{t('enableAutosave')}</p>
              <p className="text-xs text-surface-400">{t('autosaveEvery30s')}</p>
            </div>
            <input
              type="checkbox"
              checked={autoSave}
              onChange={(e) => handleAutoSaveChange(e.target.checked)}
              className="w-5 h-5 rounded accent-primary-600"
            />
          </label>
        </section>

        {/* Data Directory */}
        <section className="form-section">
          <div className="form-section-header">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-surface-400" />
              <span className="form-section-title">{t('dataDirSection')}</span>
            </div>
          </div>
          <div className="p-3 rounded-lg border border-surface-200 space-y-3">
            <div>
              <p className="text-xs text-surface-400 mb-1">{t('dataDirCurrent')}</p>
              <p className="text-sm text-surface-700 font-mono break-all">{dataDir || t('loading')}</p>
            </div>
            <button
              onClick={handleChangeDataDir}
              disabled={isChangingDir}
              className="btn-secondary btn-sm inline-flex items-center gap-1.5"
            >
              {isChangingDir ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {t('migrating')}</>
              ) : (
                t('changeDir')
              )}
            </button>
            {dirStatus === 'success' && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> {t('dataDirUpdated')}
              </p>
            )}
            {dirStatus === 'error' && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {dirErrorMsg}
              </p>
            )}
          </div>
        </section>

        {/* One-click autofill: local bridge pairing code for the browser extension */}
        <section className="form-section">
          <div className="form-section-header">
            <div className="flex items-center gap-2">
              <Plug className="w-4 h-4 text-surface-400" />
              <span className="form-section-title">{t('autofillSection')}</span>
            </div>
          </div>
          <div className="p-3 rounded-lg border border-surface-200 space-y-3">
            <p className="text-xs text-surface-400">{t('autofillDesc')}</p>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${autofill?.running ? 'bg-green-500' : 'bg-surface-300'}`} />
              <span className="text-xs text-surface-500">
                {autofill?.running
                  ? `${t('localBridgeRunning')} ${autofill.port}）`
                  : t('localBridgeStopped')}
              </span>
            </div>
            {pairingCode && (
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] font-mono text-surface-600 break-all bg-surface-50 px-2 py-1.5 rounded">
                  {pairingCode}
                </code>
                <button
                  onClick={handleCopyPair}
                  className="btn-secondary btn-sm inline-flex items-center gap-1 shrink-0"
                  title={t('copyPairCode')}
                >
                  {pairCopied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  {pairCopied ? t('copied') : t('copy')}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* About */}
        <section className="form-section">
          <div className="form-section-header">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-surface-400" />
              <span className="form-section-title">{t('aboutSection')}</span>
            </div>
          </div>
          <div className="p-3 text-sm text-surface-600 space-y-1">
            <p><span className="font-medium">Gosume</span> {appVersion ? `v${appVersion}` : ''}</p>
            <p className="text-xs text-surface-400">{t('desktopResumeTool')}</p>
            <p className="text-xs text-surface-400 mt-2">{t('builtByWails')}</p>
            <div className="pt-2">
              <button
                onClick={handleCheckUpdate}
                disabled={checkingUpdate}
                className="btn-secondary btn-sm inline-flex items-center gap-1.5"
              >
                {checkingUpdate ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {t('checking')}</>
                ) : (
                  <><Download className="w-4 h-4" /> {t('checkUpdate')}</>
                )}
              </button>
              {/* 检查结果：grid 行高 0fr↔1fr + 淡入淡出，展开/收起带 200ms 高度渐变（对齐模态窗口动画） */}
              <div
                className={`grid transition-all duration-200 ${updateStatus !== '' ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
              >
                <div className="overflow-hidden">
                  {updateMsg && (
                    <p className={`mt-2 text-xs flex items-center gap-1 ${updateStatus === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                      {updateStatus === 'error' ? <AlertCircle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                      {updateMsg}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
        </div>

        {/* 分栏拖拽手柄：捕获指针后按 e.buttons>0 跟随拖拽，抬起自动放掉捕获 */}
        <div
          className="w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-primary-200/70 active:bg-primary-300 transition-colors touch-none"
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={(e) => { if (e.buttons > 0) handleSplitDrag(e) }}
        />

        {/* Right column: toolbox */}
        <div className="flex-1 min-w-0 overflow-y-auto p-6 border-l border-surface-100">
          <div className="form-section-header mb-4">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-surface-400" />
              <span className="form-section-title">{t('toolbox')}</span>
            </div>
          </div>
          <ToolsPanel />
        </div>
      </div>

      {/* Update dialog: pops up when a new version is found; internal state
          machine covers download progress / install / retry. */}
      {updateInfo && (
        <UpdateDialog
          info={updateInfo}
          onClose={() => setUpdateInfo(null)}
        />
      )}

      {/* Change data directory confirmation dialog */}
      <ConfirmDialog
        open={!!pendingDir}
        title={t('changeDataDirTitle')}
        description={`${t('changeDirConfirm')}\n${pendingDir}\n\n${t('migrateNote')}`}
        confirmText={t('confirmMigrate')}
        loading={isChangingDir}
        icon={<FolderOpen className="w-5 h-5 text-primary-600" />}
        onConfirm={confirmChangeDataDir}
        onCancel={() => setPendingDir(null)}
      />
    </AnimatedPage>
  )
}
