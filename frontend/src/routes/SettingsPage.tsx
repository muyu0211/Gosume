import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Globe, HardDrive, FolderOpen, Info, ArrowLeft, Loader2, CheckCircle, AlertCircle, SlidersHorizontal, Plus, Trash2, RotateCcw } from 'lucide-react'
import { AnimatedPage } from '../components/ui/AnimatedPage'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { useResumeStore } from '../stores/resumeStore'
import { useLayoutSettingsStore } from '../stores/layoutSettingsStore'
import { callService } from '../services/backend'
import type { LayoutPresetSettings, MarginTier, SpacingTier } from '../lib/layoutPresets'

const AUTOSAVE_PREF_KEY = 'resume-craft-autosave-enabled'

function getAutoSavePref(): boolean {
  const v = localStorage.getItem(AUTOSAVE_PREF_KEY)
  if (v === null) return true
  return v === 'true'
}

/** Generates a unique key for user-added tiers. */
function newTierKey(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

const inputCls = 'w-16 px-1.5 py-1 text-xs border border-surface-200 rounded-md focus:outline-none focus:border-primary-500 tabular-nums'
const labelInputCls = 'w-20 px-1.5 py-1 text-xs border border-surface-200 rounded-md focus:outline-none focus:border-primary-500'

export function SettingsPage() {
  const navigate = useNavigate()
  const resume = useResumeStore((s) => s.resume)
  const updateField = useResumeStore((s) => s.updateField)
  const language = resume?.meta?.language || 'zh-CN'
  const [autoSave, setAutoSave] = useState(getAutoSavePref)

  // Layout preset tiers (page margin + section spacing), editable as a
  // local draft; persisted to config.json via SystemService on save.
  const layoutSettings = useLayoutSettingsStore()
  const [draft, setDraft] = useState<LayoutPresetSettings>(() => ({
    margins: structuredClone(layoutSettings.margins),
    spacings: structuredClone(layoutSettings.spacings),
  }))
  const [layoutSaving, setLayoutSaving] = useState(false)
  const [layoutStatus, setLayoutStatus] = useState<'' | 'success' | 'error'>('')
  const [layoutErrorMsg, setLayoutErrorMsg] = useState('')
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [deleteTierTarget, setDeleteTierTarget] = useState<{ type: 'margin' | 'spacing'; idx: number; label: string } | null>(null)

  // Sync the draft when the store loads its persisted values (app start
  // loads asynchronously) or after reset.
  useEffect(() => {
    setDraft({
      margins: structuredClone(layoutSettings.margins),
      spacings: structuredClone(layoutSettings.spacings),
    })
  }, [layoutSettings.margins, layoutSettings.spacings])

  const layoutDirty =
    JSON.stringify(draft) !==
    JSON.stringify({
      margins: layoutSettings.margins,
      spacings: layoutSettings.spacings,
    })

  const patchMargin = (idx: number, patch: Partial<MarginTier>) => {
    setDraft((d) => ({
      ...d,
      margins: d.margins.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }))
  }
  const patchSpacing = (idx: number, patch: Partial<SpacingTier>) => {
    setDraft((d) => ({
      ...d,
      spacings: d.spacings.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }))
  }
  const addMargin = () => {
    setDraft((d) => ({
      ...d,
      margins: [...d.margins, { key: newTierKey(), label: '新档位', padding_y: 10, padding_x: 12 }],
    }))
  }
  const addSpacing = () => {
    setDraft((d) => ({
      ...d,
      spacings: [
        ...d.spacings,
        { key: newTierKey(), label: '新档位', section_gap: 10, item_gap: 6, detail_gap: 2 },
      ],
    }))
  }
  const removeMargin = (idx: number) => {
    setDraft((d) => ({ ...d, margins: d.margins.filter((_, i) => i !== idx) }))
  }
  const removeSpacing = (idx: number) => {
    setDraft((d) => ({ ...d, spacings: d.spacings.filter((_, i) => i !== idx) }))
  }

  const confirmDeleteTier = () => {
    if (!deleteTierTarget) return
    if (deleteTierTarget.type === 'margin') {
      removeMargin(deleteTierTarget.idx)
    } else {
      removeSpacing(deleteTierTarget.idx)
    }
    setDeleteTierTarget(null)
  }

  const handleSaveLayout = async () => {
    setLayoutStatus('')
    setLayoutErrorMsg('')
    setLayoutSaving(true)
    try {
      await layoutSettings.save(draft)
      setLayoutStatus('success')
      setTimeout(() => setLayoutStatus(''), 3000)
    } catch (err: any) {
      setLayoutStatus('error')
      setLayoutErrorMsg(err?.message || String(err))
    } finally {
      setLayoutSaving(false)
    }
  }

  const handleResetLayout = async () => {
    setShowResetConfirm(false)
    setLayoutStatus('')
    setLayoutErrorMsg('')
    setLayoutSaving(true)
    try {
      await layoutSettings.reset()
      setLayoutStatus('success')
      setTimeout(() => setLayoutStatus(''), 3000)
    } catch (err: any) {
      setLayoutStatus('error')
      setLayoutErrorMsg(err?.message || String(err))
    } finally {
      setLayoutSaving(false)
    }
  }

  // Data directory state
  const [dataDir, setDataDir] = useState('')
  const [isChangingDir, setIsChangingDir] = useState(false)
  const [dirStatus, setDirStatus] = useState<'' | 'success' | 'error'>('')
  const [dirErrorMsg, setDirErrorMsg] = useState('')
  const [pendingDir, setPendingDir] = useState<string | null>(null)

  useEffect(() => {
    callService<string>('SystemService', 'GetDataDir').then((dir) => {
      if (dir) setDataDir(dir)
    })
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
    const dir = await callService<string>('SystemService', 'PickDataDir')
    if (!dir) return // user cancelled

    // Step 2: 弹出确认模态（复用 ConfirmDialog，替代 window.confirm）
    setPendingDir(dir)
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
      <header className="flex items-center gap-3 px-6 py-4 bg-white border-b border-surface-100">
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

        {/* Layout Presets */}
        <section className="form-section">
          <div className="form-section-header">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-surface-400" />
              <span className="form-section-title">布局档位</span>
            </div>
          </div>
          <div className="p-3 rounded-lg border border-surface-200 space-y-4">
            <p className="text-xs text-surface-400 leading-relaxed">
              自定义页边距与内容间距的档位数值和数量，保存后对所有简历的布局调整生效。
              “标准”档为回退选项不可删除；内容间距的“标准”档为模板内置节奏，数值不可修改。
            </p>

            {/* Margin tiers */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-surface-700">页边距档位（mm）</span>
                <button onClick={addMargin} className="btn-ghost btn-sm inline-flex items-center gap-1 text-xs">
                  <Plus className="w-3.5 h-3.5" /> 添加档位
                </button>
              </div>
              <div className="space-y-1.5">
                {draft.margins.map((tier, idx) => (
                  <div key={tier.key} className="flex items-center gap-2">
                    <input
                      value={tier.label}
                      onChange={(e) => patchMargin(idx, { label: e.target.value })}
                      className={labelInputCls}
                      aria-label="档位名称"
                    />
                    <label className="flex items-center gap-1 text-xs text-surface-500">
                      上下
                      <input
                        type="number"
                        min={5}
                        max={30}
                        step={0.5}
                        value={tier.padding_y}
                        onChange={(e) => patchMargin(idx, { padding_y: Number(e.target.value) })}
                        className={inputCls}
                      />
                    </label>
                    <label className="flex items-center gap-1 text-xs text-surface-500">
                      左右
                      <input
                        type="number"
                        min={5}
                        max={30}
                        step={0.5}
                        value={tier.padding_x}
                        onChange={(e) => patchMargin(idx, { padding_x: Number(e.target.value) })}
                        className={inputCls}
                      />
                    </label>
                    <span className="flex-1 text-[11px] text-surface-400 truncate">
                      {tier.key === 'normal' ? '回退档位，不可删除' : ''}
                    </span>
                    {tier.key !== 'normal' && (
                      <button
                        onClick={() => setDeleteTierTarget({ type: 'margin', idx, label: tier.label })}
                        className="p-1 rounded-md text-surface-400 hover:text-red-500 hover:bg-red-50"
                        title="删除档位"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Spacing tiers */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-surface-700">内容间距档位（pt）</span>
                <button onClick={addSpacing} className="btn-ghost btn-sm inline-flex items-center gap-1 text-xs">
                  <Plus className="w-3.5 h-3.5" /> 添加档位
                </button>
              </div>
              <div className="space-y-1.5">
                {draft.spacings.map((tier, idx) => {
                  const isNormal = tier.key === 'normal'
                  return (
                    <div key={tier.key} className="flex items-center gap-2">
                      <input
                        value={tier.label}
                        onChange={(e) => patchSpacing(idx, { label: e.target.value })}
                        className={labelInputCls}
                        aria-label="档位名称"
                      />
                      {(['section_gap', 'item_gap', 'detail_gap'] as const).map((field, fi) => (
                        <label key={field} className="flex items-center gap-1 text-xs text-surface-500">
                          {['模块', '条目', '细节'][fi]}
                          <input
                            type="number"
                            min={0}
                            max={40}
                            step={0.5}
                            disabled={isNormal}
                            placeholder={isNormal ? '默认' : ''}
                            value={tier[field] ?? ''}
                            onChange={(e) =>
                              patchSpacing(idx, { [field]: e.target.value === '' ? null : Number(e.target.value) } as Partial<SpacingTier>)
                            }
                            className={`${inputCls} ${isNormal ? 'bg-surface-50 text-surface-300' : ''}`}
                          />
                        </label>
                      ))}
                      <span className="flex-1 text-[11px] text-surface-400 truncate">
                        {isNormal ? '模板内置节奏，不可修改或删除' : ''}
                      </span>
                      {!isNormal && (
                        <button
                          onClick={() => setDeleteTierTarget({ type: 'spacing', idx, label: tier.label })}
                          className="p-1 rounded-md text-surface-400 hover:text-red-500 hover:bg-red-50"
                          title="删除档位"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleSaveLayout}
                disabled={!layoutDirty || layoutSaving}
                className="btn-primary btn-sm inline-flex items-center gap-1.5"
              >
                {layoutSaving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 保存中...</>
                ) : (
                  '保存设置'
                )}
              </button>
              <button
                onClick={() => setShowResetConfirm(true)}
                disabled={layoutSaving}
                className="btn-secondary btn-sm"
              >
                恢复默认
              </button>
              {layoutStatus === 'success' && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> 已保存
                </p>
              )}
              {layoutStatus === 'error' && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {layoutErrorMsg}
                </p>
              )}
            </div>
          </div>
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
            <p><span className="font-medium">Gosume</span> v1.0.0</p>
            <p className="text-xs text-surface-400">桌面级简历制作工具</p>
            <p className="text-xs text-surface-400 mt-2">基于 Wails v3构建</p>
          </div>
        </section>
      </div>

      {/* Delete tier confirmation dialog */}
      <ConfirmDialog
        open={!!deleteTierTarget}
        title="删除档位"
        description={`确定要删除档位「${deleteTierTarget?.label}」吗？`}
        confirmText="删除"
        danger
        onConfirm={confirmDeleteTier}
        onCancel={() => setDeleteTierTarget(null)}
      />

      {/* Reset layout presets confirmation dialog */}
      <ConfirmDialog
        open={showResetConfirm}
        title="恢复默认布局档位"
        description="页边距与内容间距的所有档位将恢复为内置默认值，自定义档位会被移除。此操作不可撤销。"
        confirmText="恢复默认"
        icon={<RotateCcw className="w-5 h-5 text-primary-600" />}
        onConfirm={handleResetLayout}
        onCancel={() => setShowResetConfirm(false)}
      />

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
