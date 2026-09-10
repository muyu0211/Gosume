import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Globe, Palette, HardDrive, FolderOpen, Info, ArrowLeft, Loader2, CheckCircle, AlertCircle, Download, Plug, Copy, Check, Wrench, Sparkles, Eye, EyeOff } from 'lucide-react'
import { AnimatedPage } from '../components/ui/AnimatedPage'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { UpdateDialog, type UpdateInfo } from '../components/ui/UpdateDialog'
import { ToolsPanel } from '../components/tools/ToolsPanel'
import { CustomSelect } from '../components/ui/CustomSelect'
import { useThemeStore } from '../stores/themeStore'
import { useAppStore } from '../stores/appStore'
import { callService } from '../services/backend'
import { getAppVersion } from '../services/systemService'
import { AI_PRESETS, AI_MODELS_BY_PROVIDER, getAIConfig, saveAIConfig, testConnection, type AIConfigInput } from '../services/aiService'
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

  // ---- AI 服务：配置管理 + 连通性测试（为后续 AI 能力准备）----
  const [aiForm, setAiForm] = useState<AIConfigInput>({ provider: 'custom', base_url: '', model: '', api_key: '', enabled: false })
  const [savedKeyMasked, setSavedKeyMasked] = useState('') // 已持久化的脱敏 Key（作 placeholder 提示）
  const [aiCustomMode, setAiCustomMode] = useState(false) // 处于「自定义模型」模式时展开手输输入框
  const [showKey, setShowKey] = useState(false)
  const [aiSaving, setAiSaving] = useState(false)
  const [aiTesting, setAiTesting] = useState(false)
  const [aiSaveStatus, setAiSaveStatus] = useState<'' | 'success' | 'error'>('')
  const [aiSaveMsg, setAiSaveMsg] = useState('')
  const [aiTestStatus, setAiTestStatus] = useState<'' | 'success' | 'error'>('')
  const [aiTestMsg, setAiTestMsg] = useState('')
  const [aiTestLatency, setAiTestLatency] = useState(0)

  // 供应商下拉选项（预设 + 自定义），hint 展示对应 Base URL
  const providerOptions = useMemo(
    () => [
      ...AI_PRESETS.map((p) => ({ value: p.value, label: p.label, hint: p.baseUrl })),
      { value: 'custom', label: t('aiCustomProvider') },
    ],
    [t],
  )

  // 加载已保存配置（Key 脱敏回显，provider 缺省回退「自定义」）
  useEffect(() => {
    getAIConfig()
      .then((info) => {
        if (!info) return
        setSavedKeyMasked(info.key_masked)
        // 已保存的模型名不在该供应商预设候选中时，恢复为「自定义模式」并回填输入框
        const presets = AI_MODELS_BY_PROVIDER[info.provider || 'custom'] ?? []
        setAiCustomMode(info.model !== '' && !presets.includes(info.model))
        setAiForm({
          provider: info.provider || 'custom',
          base_url: info.base_url,
          model: info.model,
          api_key: '',
          enabled: info.enabled,
        })
      })
      .catch(() => { })
  }, [])

  // 选择预设时联动填充 base_url 与默认模型（退出自定义模型模式，回到预设模型）
  const handleProviderChange = (value: string) => {
    setAiForm((f) => ({ ...f, provider: value }))
    setAiCustomMode(false)
    const preset = AI_PRESETS.find((p) => p.value === value)
    if (preset) {
      setAiForm(() => ({ provider: value, base_url: preset.baseUrl, model: preset.model, api_key: '', enabled: false }))
    }
  }

  // 模型候选：按当前 provider 提供常用模型，末尾附「自定义…」供手输
  const modelOptions = useMemo(
    () => [
      ...(AI_MODELS_BY_PROVIDER[aiForm.provider] ?? []).map((m) => ({ value: m, label: m })),
      { value: '__custom__', label: t('aiCustomModel') },
    ],
    [aiForm.provider, t],
  )
  // 下拉受控显示值：自定义模式下显示「自定义…」；命中候选显示该项；未选择为空（显示 placeholder）
  const modelSelectValue = aiCustomMode ? '__custom__' : aiForm.model

  // 选择模型：命中预设候选直接写入并退出自定义模式；自定义则展开输入框
  const handleModelSelect = (value: string) => {
    if (value === '__custom__') {
      setAiCustomMode(true)
      return
    }
    setAiCustomMode(false)
    setAiForm((f) => ({ ...f, model: value }))
  }

  // 校验（轻量，贴合设置页现有 useState 风格）：URL 格式 / 模型非空 / Key 非空（含沿用脱敏值）
  const validateAiForm = (): string | null => {
    if (!/^https?:\/\//.test(aiForm.base_url.trim())) return t('aiInvalidUrl')
    if (!aiForm.model.trim()) return t('aiModelRequired')
    if (!aiForm.api_key.trim() && !savedKeyMasked) return t('aiKeyRequired')
    return null
  }

  const buildAiPayload = (): AIConfigInput => ({
    provider: aiForm.provider || 'custom',
    base_url: aiForm.base_url.trim(),
    model: aiForm.model.trim(),
    // 输入为空且已有保存的 Key 时，回传脱敏串，后端据此沿用原 Key
    api_key: aiForm.api_key.trim() || savedKeyMasked,
    enabled: aiForm.enabled,
  })

  const handleSaveAI = async () => {
    const err = validateAiForm()
    if (err) {
      setAiSaveStatus('error')
      setAiSaveMsg(err)
      return
    }
    setAiSaving(true)
    setAiSaveStatus('')
    try {
      await saveAIConfig(buildAiPayload())
      setSavedKeyMasked(maskPreview(aiForm.api_key.trim() || savedKeyMasked))
      setAiForm((f) => ({ ...f, api_key: '' }))
      setAiSaveStatus('success')
      setAiSaveMsg(t('aiSaveSuccess'))
    } catch (e) {
      setAiSaveStatus('error')
      setAiSaveMsg(extractErrorMessage(e, t('aiSaveFailed')))
    } finally {
      setAiSaving(false)
    }
  }

  // 测试连接：先保存当前表单，再对已保存配置发最小请求
  const handleTestAI = async () => {
    const err = validateAiForm()
    if (err) {
      setAiSaveStatus('error')
      setAiSaveMsg(err)
      return
    }
    setAiTesting(true)
    setAiTestStatus('')
    try {
      await saveAIConfig(buildAiPayload())
      const r = await testConnection()
      if (!r) {
        setAiTestStatus('error')
        setAiTestMsg(t('aiNotConfigured'))
      } else if (r.ok) {
        setAiTestStatus('success')
        setAiTestLatency(r.latency_ms ?? 0)
      } else {
        setAiTestStatus('error')
        setAiTestMsg(r.message || t('aiConnectionFail').replace('{msg}', ''))
      }
    } catch (e) {
      setAiTestStatus('error')
      setAiTestMsg(extractErrorMessage(e, t('aiConnectionFail').replace('{msg}', '')))
    } finally {
      setAiTesting(false)
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

        {/* AI 服务：配置大模型，为后续 AI 能力准备 */}
        <section className="form-section">
          <div className="form-section-header">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-surface-400" />
              <span className="form-section-title">{t('aiSection')}</span>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-xs text-surface-400">{t('aiSectionDesc')}</p>

            <div>
              <label className="form-label">{t('aiProvider')}</label>
              <CustomSelect value={aiForm.provider} onChange={handleProviderChange} options={providerOptions} />
            </div>

            <div>
              <label className="form-label">{t('aiBaseUrl')}</label>
              <input
                className="form-input"
                type="text"
                placeholder={t('aiBaseUrlPlaceholder')}
                value={aiForm.base_url}
                onChange={(e) => setAiForm((f) => ({ ...f, base_url: e.target.value }))}
              />
            </div>

            <div>
              <label className="form-label">{t('aiModel')}</label>
              {/* 模型下拉：预设候选 + 「自定义…」；选中自定义后展开输入框手输 */}
              <CustomSelect
                value={modelSelectValue}
                onChange={handleModelSelect}
                options={modelOptions}
                placeholder={t('aiModelPlaceholder')}
                emptyText={t('aiModelEmpty')}
              />
              {/* 自定义模型输入：选「自定义…」后渲染，供手输模型名。
                不使用省略高度折叠容器（overflow-hidden 会裁掉 form-input 的 hover 阴影），
                直接条件渲染以保证 hover 效果与其他输入框完全一致。 */}
              {aiCustomMode && (
                <input
                  className="form-input mt-2"
                  type="text"
                  placeholder={t('aiModelPlaceholder')}
                  value={aiForm.model}
                  onChange={(e) => setAiForm((f) => ({ ...f, model: e.target.value }))}
                />
              )}
            </div>

            <div>
              <label className="form-label">{t('aiApiKey')}</label>
              <div className="relative">
                <input
                  className="form-input pr-10"
                  type={showKey ? 'text' : 'password'}
                  placeholder={savedKeyMasked ? t('aiKeySavedHint').replace('{key}', savedKeyMasked) : t('aiApiKeyPlaceholder')}
                  value={aiForm.api_key}
                  onChange={(e) => setAiForm((f) => ({ ...f, api_key: e.target.value }))}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  title={showKey ? t('hidden') : t('unhideHint')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleTestAI}
                disabled={aiSaving || aiTesting}
                className="btn-secondary btn-sm inline-flex items-center gap-1.5"
              >
                {aiTesting ? (<><Loader2 className="w-4 h-4 animate-spin" /> {t('aiTesting')}</>) : t('aiTest')}
              </button>
              <button
                onClick={handleSaveAI}
                disabled={aiSaving || aiTesting}
                className="btn-secondary btn-sm inline-flex items-center gap-1.5"
              >
                {aiSaving ? (<><Loader2 className="w-4 h-4 animate-spin" /> {t('aiSaving')}</>) : t('aiSave')}
              </button>
            </div>

            {/* 保存 / 测试结果：grid 0fr↔1fr 渐变展开（对齐检查更新） */}
            <div className={`grid transition-all duration-200 ${aiSaveStatus || aiTestStatus ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
              <div className="overflow-hidden">
                {aiSaveStatus !== '' && (
                  <p className={`mt-2 text-xs flex items-center gap-1 ${aiSaveStatus === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                    {aiSaveStatus === 'error' ? <AlertCircle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                    {aiSaveMsg}
                  </p>
                )}
                {aiTestStatus !== '' && (
                  <p className={`mt-2 text-xs flex items-center gap-1 ${aiTestStatus === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                    {aiTestStatus === 'error' ? <AlertCircle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                    {aiTestStatus === 'success' ? t('aiConnectionOk').replace('{ms}', String(aiTestLatency)) : aiTestMsg}
                  </p>
                )}
              </div>
            </div>
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

/** 对 API Key 做预览脱敏（保留前 4 与后 4 位），与后端 ai.MaskKey 保持一致。 */
function maskPreview(key: string): string {
  if (!key) return ''
  return key.length > 8 ? `${key.slice(0, 4)}****${key.slice(-4)}` : '****'
}
