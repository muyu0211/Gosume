import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Globe, Palette, HardDrive, FolderOpen, Info, ArrowLeft, Loader2, CheckCircle, AlertCircle, Download, Plug, Copy, Check, Wrench, Sparkles, Eye, EyeOff, Settings2, Image as ImageIcon } from 'lucide-react'
import { AnimatedPage } from '../components/ui/AnimatedPage'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { UpdateDialog, type UpdateInfo } from '../components/ui/UpdateDialog'
import { Switch } from '../components/ui/Switch'
import { RadioGroup } from '../components/ui/RadioGroup'
import { ToolsPanel } from '../components/tools/ToolsPanel'
import { AIConfigManagerDialog } from '../components/ai/AIConfigManagerDialog'
import { ProviderLogo } from '../components/ai/ProviderLogo'
import { listAIConfigs, type AIInfo } from '../services/aiService'
import { CustomSelect } from '../components/ui/CustomSelect'
import { Tooltip } from '../components/ui/Tooltip'
import { useThemeStore } from '../stores/themeStore'
import { useAppStore } from '../stores/appStore'
import { callService } from '../services/backend'
import { getAppVersion } from '../services/systemService'
import { extractErrorMessage } from '../lib/errorUtils'
import { useT } from '../lib/i18n'
import type { ThemeMode } from '../lib/theme'
import { BACKGROUND_PRESETS, type BackgroundId } from '../lib/background'

const AUTOSAVE_PREF_KEY = 'resume-craft-autosave-enabled'

/**
 * 左右分栏宽度（%）持久化键与范围。
 * 上限取 50：左栏最多占界面一半，右侧工具箱至少保住另一半，
 * 避免左栏被拖到把工具箱挤成一条缝。
 */
const SPLIT_KEY = 'gosume-settings-split'
const SPLIT_RANGE = { min: 28, max: 50 }
/** 首次打开（无持久化值）时的默认分栏宽度。 */
const DEFAULT_SPLIT = 42

/**
 * 读取持久化的分栏宽度，钳制在 SPLIT_RANGE 内。
 * ⚠ 必须先判断 getItem 的 null：Number(null) === 0 是**有限数**，
 *    直接 Number(getItem()) 会让「没有存过值」走到钳制分支落到 min，
 *    空串同理（Number('') 也是 0），故 null / 空白串 / 非数字一并回落到默认值。
 */
function readSplit(): number {
  const raw = localStorage.getItem(SPLIT_KEY)
  if (raw === null || raw.trim() === '') return DEFAULT_SPLIT
  const v = Number(raw)
  if (!Number.isFinite(v)) return DEFAULT_SPLIT
  return Math.min(SPLIT_RANGE.max, Math.max(SPLIT_RANGE.min, v))
}

function getAutoSavePref(): boolean {
  const v = localStorage.getItem(AUTOSAVE_PREF_KEY)
  if (v === null) return true
  return v === 'true'
}

export function SettingsPage() {
  const navigate = useNavigate()

  // AI 配置管理模态开关（配置细节在独立模态中编辑）
  const [showAIConfig, setShowAIConfig] = useState(false)
  // 当前启用 AI 配置（设置页仅作展示，不展开编辑），关闭管理模态后重新拉取同步
  const [activeAI, setActiveAI] = useState<AIInfo | null>(null)
  const loadActiveAI = useCallback(() => {
    listAIConfigs()
      .then((res) => {
        if (!res) return
        setActiveAI(res.configs.find((c) => c.id === res.active_id) ?? null)
      })
      .catch(() => { })
  }, [])
  useEffect(() => {
    loadActiveAI()
  }, [loadActiveAI])
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
  // 背景壁纸：选项写入 appStore（持久化 localStorage + 立即写入 <html data-app-bg>），
  // 切换后当前页面即刻变化，无需刷新。
  const background = useAppStore((s) => s.background)
  const setBackground = useAppStore((s) => s.setBackground)
  const handleBackgroundChange = (id: BackgroundId) => {
    setBackground(id)
  }

  const themeOptions: Array<{ value: ThemeMode; titleKey: string; descKey: string }> = [
    { value: 'system', titleKey: 'themeSystem', descKey: 'themeSystem' },
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

      // 检查是否存在更新
      if (info.has_update) {
        setUpdateInfo(info)
      } else {
        setUpdateStatus('latest')
        setUpdateMsg(t('upToDate'))
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
    <AnimatedPage className="h-full flex flex-col app-canvas">
      {/* Header：底色走 .glass-shell（= rgb(var(--elev) / var(--lg-tint-panel)) + 背景模糊），
          与社区页顶栏、编辑页 Toolbar 同一套 —— 不再用不透明的 bg-elev，
          否则启用壁纸后顶部会压出一块不透的实色，与页面整体割裂。
          返回按钮 / 标题文字用的都是主题文字令牌，对比度不受影响。 */}
      <header className="flex items-center gap-3 px-6 py-4 glass-shell border-b border-surface-100">
        <Tooltip label={t('back')}>
          <button
            onClick={() => navigate(-1)}
            className="btn-ghost btn-sm"
          >
            <ArrowLeft className="size-icon-lg" />
          </button>
        </Tooltip>
        <Settings className="size-icon-lg text-surface-500" />
        <h1 className="text-lg font-semibold text-surface-800">{t('settings')}</h1>
      </header>

      {/* Settings Content: left = base settings, right = toolbox, split is draggable */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        <div className="min-w-0 overflow-y-auto p-6" style={{ flexBasis: `${split}%`, flexShrink: 0 }}>
          {/* Language */}
        <section className="form-section">
          <div className="form-section-header">
            <div className="flex items-center gap-2">
              <Globe className="size-icon-md text-surface-400" />
              <span className="form-section-title">{t('languageSection')}</span>
            </div>
          </div>
          <RadioGroup<'zh-CN' | 'en-US'>
            layout="card"
            value={appLang}
            onChange={handleLanguageChange}
            ariaLabel={t('languageSection')}
            options={[
              { value: 'zh-CN', label: '简体中文', description: t('useZhInterface') },
              { value: 'en-US', label: 'English', description: 'Use English interface' },
            ]}
          />
        </section>

        {/* Appearance: theme mode (follow system / classic / wheat / obsidian) */}
        <section className="form-section">
          <div className="form-section-header">
            <div className="flex items-center gap-2">
              <Palette className="size-icon-md text-surface-400" />
              <span className="form-section-title">{t('appearance')}</span>
            </div>
          </div>
          <RadioGroup<ThemeMode>
            layout="card"
            value={themeMode}
            onChange={(mode) => void handleThemeChange(mode)}
            ariaLabel={t('appearance')}
            options={themeOptions.map((opt) => ({
              value: opt.value,
              label: t(opt.titleKey),
              description: t(opt.descKey),
            }))}
          />
        </section>

        {/* 背景壁纸：纯 CSS 渐变铺在界面底层，选中即时生效，本页即可实时预览 */}
        <section className="form-section">
          <div className="form-section-header">
            <div className="flex items-center gap-2">
              <ImageIcon className="size-icon-md text-surface-400" />
              <span className="form-section-title">{t('bgSection')}</span>
            </div>
          </div>
          <p className="text-xs text-surface-400 mb-3">{t('bgDesc')}</p>
          <div className="grid grid-cols-4 gap-3">
            {BACKGROUND_PRESETS.map((preset) => {
              const on = background === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => handleBackgroundChange(preset.id)}
                  className="flex flex-col items-center gap-1.5"
                >
                  {/* 色板直接吃 --bg-image，与应用真实背景同源（不存在两份配色） */}
                  <span
                    data-app-bg={preset.id}
                    className={on ? 'app-bg-swatch app-bg-swatch-on' : 'app-bg-swatch'}
                  />
                  <span className={`text-xs truncate ${on ? 'font-medium text-primary-600' : 'text-surface-500'}`}>
                    {t(preset.labelKey)}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* Auto Save */}
        <section className="form-section">
          <div className="form-section-header">
            <div className="flex items-center gap-2">
              <HardDrive className="size-icon-md text-surface-400" />
              <span className="form-section-title">{t('autosaveSection')}</span>
            </div>
          </div>
          <label className="glass-entry flex items-center justify-between p-3">
            <div>
              <p className="text-sm font-medium text-surface-700">{t('enableAutosave')}</p>
              <p className="text-xs text-surface-400">{t('autosaveEvery30s')}</p>
            </div>
            <Switch
              checked={autoSave}
              onChange={handleAutoSaveChange}
              label={t('enableAutosave')}
            />
          </label>
        </section>

        {/* Data Directory */}
        <section className="form-section">
          <div className="form-section-header">
            <div className="flex items-center gap-2">
              <FolderOpen className="size-icon-md text-surface-400" />
              <span className="form-section-title">{t('dataDirSection')}</span>
            </div>
          </div>
          <div className="glass-entry p-3 space-y-3">
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
                <><Loader2 className="size-icon-md animate-spin" /> {t('migrating')}</>
              ) : (
                t('changeDir')
              )}
            </button>
            {dirStatus === 'success' && (
              <p className="text-xs text-success-600 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> {t('dataDirUpdated')}
              </p>
            )}
            {dirStatus === 'error' && (
              <p className="text-xs text-danger-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {dirErrorMsg}
              </p>
            )}
          </div>
        </section>

        {/* One-click autofill: local bridge pairing code for the browser extension */}
        <section className="form-section">
          <div className="form-section-header">
            <div className="flex items-center gap-2">
              <Plug className="size-icon-md text-surface-400" />
              <span className="form-section-title">{t('autofillSection')}</span>
            </div>
          </div>
          <div className="glass-entry p-3 space-y-3">
            <p className="text-xs text-surface-400">{t('autofillDesc')}</p>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${autofill?.running ? 'bg-success-500' : 'bg-surface-300'}`} />
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
                >
                  {pairCopied ? <Check className="size-icon-md text-success-600" /> : <Copy className="size-icon-md" />}
                  {pairCopied ? t('copied') : t('copy')}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* AI 服务：配置管理入口，配置细节在独立模态中编辑 */}
        <section className="form-section">
          <div className="form-section-header">
            <div className="flex items-center gap-2">
              <Sparkles className="size-icon-md text-surface-400" />
              <span className="form-section-title">{t('aiSection')}</span>
            </div>
          </div>
          <div className="glass-entry p-3 space-y-3">
            <p className="text-xs text-surface-400">{t('aiSectionDesc')}</p>
            {/* 当前启用配置一览 */}
            <div className="flex items-center gap-2">
              <ProviderLogo provider={activeAI?.provider || 'custom'} size={28} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-surface-700 truncate">
                  <span className="text-surface-400">{t('aiActivePrefix')}</span>
                  {activeAI?.model || t('aiNoActive')}
                </p>
                <p className="text-[11px] text-surface-400 truncate">{activeAI?.provider || ''}</p>
              </div>
            </div>
            <button
              onClick={() => setShowAIConfig(true)}
              className="btn-secondary btn-sm inline-flex items-center gap-1.5"
            >
              <Settings2 className="size-icon-md" />
              {t('aiManageConfig')}
            </button>
          </div>
        </section>

        {/* AI 配置管理模态 */}
        {showAIConfig && (
          <AIConfigManagerDialog
            onClose={() => {
              setShowAIConfig(false)
              loadActiveAI() // 关闭模态后同步设置页的当前启用配置
            }}
          />
        )}

        {/* About */}
        <section className="form-section">
          <div className="form-section-header">
            <div className="flex items-center gap-2">
              <Info className="size-icon-md text-surface-400" />
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
                  <><Loader2 className="size-icon-md animate-spin" /> {t('checking')}</>
                ) : (
                  <><Download className="size-icon-md" /> {t('checkUpdate')}</>
                )}
              </button>
              {/* 检查结果：grid 行高 0fr↔1fr + 淡入淡出，展开/收起带 200ms 高度渐变（对齐模态窗口动画） */}
              <div
                className={`grid transition-all duration-200 ${updateStatus !== '' ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
              >
                <div className="overflow-hidden">
                  {updateMsg && (
                    <p className={`mt-2 text-xs flex items-center gap-1 ${updateStatus === 'error' ? 'text-danger-600' : 'text-success-600'}`}>
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
              <Wrench className="size-icon-md text-surface-400" />
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
        icon={<FolderOpen className="size-icon-lg text-primary-600" />}
        onConfirm={confirmChangeDataDir}
        onCancel={() => setPendingDir(null)}
      />
    </AnimatedPage>
  )
}

/** 对 API Key 做预览脱敏（保留前 4 与后 4 位），与后端 ai.MaskKey 保持一致。 */
function maskPreview(key: string): string {
  if (!key) return ''
  return key.length > 8 ? `${key.slice(0, 4)}****${key.slice(-4)}` : '****'
}
