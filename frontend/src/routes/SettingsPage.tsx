import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Globe, Palette, HardDrive, FolderOpen, Info, ArrowLeft, Loader2, CheckCircle, AlertCircle, Download } from 'lucide-react'
import { AnimatedPage } from '../components/ui/AnimatedPage'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { UpdateDialog, type UpdateInfo } from '../components/ui/UpdateDialog'
import { useResumeStore } from '../stores/resumeStore'
import { useThemeStore } from '../stores/themeStore'
import { callService } from '../services/backend'
import { getAppVersion } from '../services/systemService'
import { extractErrorMessage } from '../lib/errorUtils'
import type { ThemeMode } from '../lib/theme'

const AUTOSAVE_PREF_KEY = 'resume-craft-autosave-enabled'

function getAutoSavePref(): boolean {
  const v = localStorage.getItem(AUTOSAVE_PREF_KEY)
  if (v === null) return true
  return v === 'true'
}

export function SettingsPage() {
  const navigate = useNavigate()
  const resume = useResumeStore((s) => s.resume)
  const updateField = useResumeStore((s) => s.updateField)
  const language = resume?.meta?.language || 'zh-CN'
  const [autoSave, setAutoSave] = useState(getAutoSavePref)

  // 主题选项（跟随系统/经典/麦色/深色），切换即时生效并持久化。
  const themeMode = useThemeStore((s) => s.mode)
  const handleThemeChange = async (mode: ThemeMode) => {
    await useThemeStore.getState().setMode(mode)
  }
  const themeOptions: Array<{ value: ThemeMode; title: string; desc: string }> = [
    { value: 'system', title: '跟随系统', desc: '系统浅色用麦色，系统深色用深色' },
    { value: 'wheat', title: '麦色', desc: '象牙纸暖色，艺术编辑风' },
    { value: 'obsidian', title: '深色', desc: '黑曜石深色，与宣传前端呼应' },
    { value: 'classic', title: '经典', desc: '现有默认亮色风格' },
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
        setUpdateMsg('当前环境不支持在线检查更新')
        return
      }

      // 存在更新
      if (info.has_update) {
        setUpdateInfo(info)
      } else {
        setUpdateStatus('latest')
        setUpdateMsg(info.tips || '当前已是最新版本')
      }
    } catch (err) {
      setUpdateStatus('error')
      setUpdateMsg(extractErrorMessage(err, '检查更新失败，请稍后重试'))
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

  const handleLanguageChange = (lang: string) => {
    updateField('meta.language', lang)
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
          title="返回"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Settings className="w-5 h-5 text-surface-500" />
        <h1 className="text-lg font-semibold text-surface-800">设置</h1>
      </header>

      {/* Settings Content */}
      <div className="flex-1 overflow-auto p-6 max-w-2xl">
        {/* Language */}
        <section className="form-section">
          <div className="form-section-header">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-surface-400" />
              <span className="form-section-title">语言</span>
            </div>
          </div>
          <div className="space-y-3">
            <label className="flex items-center gap-3 p-3 rounded-lg border border-surface-200 cursor-pointer hover:bg-surface-50">
              <input
                type="radio"
                name="language"
                value="zh-CN"
                checked={language === 'zh-CN'}
                onChange={() => handleLanguageChange('zh-CN')}
                className="accent-primary-600"
              />
              <div>
                <p className="text-sm font-medium text-surface-700">简体中文</p>
                <p className="text-xs text-surface-400">使用中文界面</p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-lg border border-surface-200 cursor-pointer hover:bg-surface-50">
              <input
                type="radio"
                name="language"
                value="en-US"
                checked={language === 'en-US'}
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
              <span className="form-section-title">外观</span>
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
                  <p className="text-sm font-medium text-surface-700">{opt.title}</p>
                  <p className="text-xs text-surface-400">{opt.desc}</p>
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
              <span className="form-section-title">自动保存</span>
            </div>
          </div>
          <label className="flex items-center justify-between p-3 rounded-lg border border-surface-200">
            <div>
              <p className="text-sm font-medium text-surface-700">启用自动保存</p>
              <p className="text-xs text-surface-400">每30秒自动保存当前项目</p>
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
              <span className="form-section-title">数据目录</span>
            </div>
          </div>
          <div className="p-3 rounded-lg border border-surface-200 space-y-3">
            <div>
              <p className="text-xs text-surface-400 mb-1">当前数据存储位置</p>
              <p className="text-sm text-surface-700 font-mono break-all">{dataDir || '加载中...'}</p>
            </div>
            <button
              onClick={handleChangeDataDir}
              disabled={isChangingDir}
              className="btn-secondary btn-sm inline-flex items-center gap-1.5"
            >
              {isChangingDir ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> 迁移中...</>
              ) : (
                '更改目录'
              )}
            </button>
            {dirStatus === 'success' && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> 数据目录已更新
              </p>
            )}
            {dirStatus === 'error' && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {dirErrorMsg}
              </p>
            )}
          </div>
        </section>

        {/* About */}
        <section className="form-section">
          <div className="form-section-header">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-surface-400" />
              <span className="form-section-title">关于</span>
            </div>
          </div>
          <div className="p-3 text-sm text-surface-600 space-y-1">
            <p><span className="font-medium">Gosume</span> {appVersion ? `v${appVersion}` : ''}</p>
            <p className="text-xs text-surface-400">桌面级简历制作工具</p>
            <p className="text-xs text-surface-400 mt-2">基于 Wails v3构建</p>
            <div className="pt-2">
              <button
                onClick={handleCheckUpdate}
                disabled={checkingUpdate}
                className="btn-secondary btn-sm inline-flex items-center gap-1.5"
              >
                {checkingUpdate ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 检查中...</>
                ) : (
                  <><Download className="w-4 h-4" /> 检查更新</>
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
        title="更改数据目录"
        description={`确认将数据目录更改为：\n${pendingDir}\n\n现有数据将被完整迁移到新位置，迁移后无需重启即可生效。`}
        confirmText="确认迁移"
        loading={isChangingDir}
        icon={<FolderOpen className="w-5 h-5 text-primary-600" />}
        onConfirm={confirmChangeDataDir}
        onCancel={() => setPendingDir(null)}
      />
    </AnimatedPage>
  )
}
