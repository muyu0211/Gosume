import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Loader2, Eye, EyeOff, CheckCircle, AlertCircle, Sparkles, Check, Zap } from 'lucide-react'
import { Modal, type ModalHandle } from '../ui/Modal'
import { CustomSelect } from '../ui/CustomSelect'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Expandable } from '../ui/Expandable'
import { Tooltip } from '../ui/Tooltip'
import { ProviderLogo } from './ProviderLogo'
import {
  AI_PRESETS,
  AI_MODELS_BY_PROVIDER,
  listAIConfigs,
  saveAIConfig,
  deleteAIConfig,
  setActiveAIConfig,
  testConnection,
  type AIInfo,
  type AIConfigInput,
} from '../../services/aiService'
import { extractErrorMessage } from '../../lib/errorUtils'
import { useT } from '../../lib/i18n'

interface Props {
  onClose: () => void
}

/** 当前编辑表单状态。 */
interface Form {
  id?: string
  name: string
  provider: string
  base_url: string
  api_key: string
  model: string
  hasKey: boolean // 该配置是否已保存过 Key（用于脱敏回显/沿原值）
  keyMasked?: string
}

const emptyForm = (name: string): Form => ({
  name,
  provider: 'custom',
  base_url: '',
  api_key: '',
  model: '',
  hasKey: false,
})

/**
 * AI 配置管理模态：左侧配置列表 + 右侧表单；支持新建 / 编辑 / 删除（含 Key）/
 * 单选当前启用 / 测试连接 / 配置 logo。基于 Modal 外壳，Header/Footer 固定。
 */
export function AIConfigManagerDialog({ onClose }: Props) {
  const t = useT()
  const modalRef = useRef<ModalHandle>(null)
  const [configs, setConfigs] = useState<AIInfo[]>([])
  const [activeId, setActiveId] = useState('')
  const [selectedId, setSelectedId] = useState<string>('') // '' 表示新建态
  const [form, setForm] = useState<Form>(() => emptyForm('配置1'))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [aiCustom, setAiCustom] = useState(false)
  const [status, setStatus] = useState<'' | 'success' | 'error'>('')
  const [statusMsg, setStatusMsg] = useState('')
  const [testMsg, setTestMsg] = useState<'' | 'success' | 'error'>('')
  const [testDetail, setTestDetail] = useState('')
  const [pendingDelete, setPendingDelete] = useState<AIInfo | null>(null)

  // 供删除确认对话框使用
  const confirmDelete = !!pendingDelete

  // 加载配置列表
  const refresh = async (keepSelected?: string) => {
    const res = await listAIConfigs()
    if (!res) return
    setConfigs(res.configs)
    setActiveId(res.active_id)
    const target = keepSelected && res.configs.some((c) => c.id === keepSelected) ? keepSelected : res.active_id
    if (target && res.configs.some((c) => c.id === target)) {
      selectConfig(res.configs.find((c) => c.id === target)!)
    } else if (res.configs.length > 0) {
      selectConfig(res.configs[0])
    } else {
      setSelectedId('')
      setForm(emptyForm('配置1'))
    }
  }

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        await refresh()
      } catch {
        /* 展示层失败静默 */
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 选中某配置 → 回填表单
  const selectConfig = (info: AIInfo) => {
    setSelectedId(info.id)
    setShowKey(false)
    setForm({
      id: info.id,
      name: info.name,
      provider: info.provider,
      base_url: info.base_url,
      model: info.model,
      // 完整 Key 直接保留在输入框中（后端配置文件管理列表已下发明文），
      // 默认加密显示，眼睛按钮切换明文/密文可见。需清空则删除整套配置。
      api_key: info.key || info.key_masked || '',
      hasKey: !!info.key_masked || !!info.key,
      keyMasked: info.key_masked,
    })
    setStatus('')
    setTestMsg('')
  }

  // 新建配置
  const startNew = () => {
    const n = configs.length + 1
    setSelectedId('')
    setShowKey(false)
    setForm(emptyForm(t('aiConfigDefaultName').replace('{n}', String(n))))
    setStatus('')
    setTestMsg('')
  }

  // provider 下拉选项（预设 + 自定义）
  const providerOptions = useMemo(
    () => [
      ...AI_PRESETS.map((p) => ({ value: p.value, label: p.label, hint: p.baseUrl })),
      { value: 'custom', label: t('aiCustomProvider') },
    ],
    [t],
  )

  const onProviderChange = (value: string) => {
    setForm((f) => ({ ...f, provider: value }))
    const preset = AI_PRESETS.find((p) => p.value === value)
    if (preset) {
      setAiCustom(false)
      setForm({ ...form, provider: value, base_url: preset.baseUrl, model: preset.model })
    }
  }

  // 模型候选 + 自定义
  const modelOptions = useMemo(
    () => [
      ...(AI_MODELS_BY_PROVIDER[form.provider] ?? []).map((m) => ({ value: m, label: m })),
      { value: '__custom__', label: t('aiCustomModel') },
    ],
    [form.provider, t],
  )
  const modelValue = aiCustom ? '__custom__' : form.model
  const onModelChange = (value: string) => {
    if (value === '__custom__') {
      setAiCustom(true)
      return
    }
    setAiCustom(false)
    setForm((f) => ({ ...f, model: value }))
  }

  // 校验
  const validate = (): string | null => {
    if (!/^https?:\/\//.test(form.base_url.trim())) return t('aiInvalidUrl')
    if (!form.model.trim()) return t('aiModelRequired')
    if (!form.api_key.trim() && !form.hasKey) return t('aiKeyRequired')
    return null
  }

  // 保存（新增或更新）
  const handleSave = async () => {
    const err = validate()
    if (err) {
      setStatus('error')
      setStatusMsg(err)
      return
    }
    setSaving(true)
    setStatus('')
    try {
      const payload: AIConfigInput = {
        id: form.id,
        name: form.name.trim() || undefined,
        provider: form.provider || 'custom',
        base_url: form.base_url.trim(),
        model: form.model.trim(),
        // 空输入且已有 Key 时回传脱敏串，后端沿用原 Key
        api_key: form.api_key.trim() || form.keyMasked || '',
      }
      const saved = await saveAIConfig(payload)
      const newId = saved?.id || form.id
      setForm((f) => ({ ...f, id: newId }))
      await refresh(newId)
      setStatus('success')
      setStatusMsg(t('aiSaveSuccess'))
    } catch (e) {
      setStatus('error')
      setStatusMsg(extractErrorMessage(e, t('aiSaveFailed')))
    } finally {
      setSaving(false)
    }
  }

  // 测试连接（当前表单；新建未保存则先提示）
  const handleTest = async () => {
    if (!form.id) {
      setTestMsg('error')
      setTestDetail(t('aiTestNeedSave'))
      return
    }
    setTesting(true)
    setTestMsg('')
    try {
      const r = await testConnection(form.id)
      if (r?.ok) {
        setTestMsg('success')
        setTestDetail(t('aiConnectionOk').replace('{ms}', String(r.latency_ms ?? 0)))
      } else {
        setTestMsg('error')
        setTestDetail(r?.message || t('aiConnectionFail').replace('{msg}', ''))
      }
    } catch (e) {
      setTestMsg('error')
      setTestDetail(extractErrorMessage(e, t('aiConnectionFail').replace('{msg}', '')))
    } finally {
      setTesting(false)
    }
  }

  // 删除整套
  const handleDelete = async () => {
    if (!pendingDelete) return
    try {
      const res = await deleteAIConfig(pendingDelete.id)
      const p = pendingDelete.id
      setPendingDelete(null)
      if (res) {
        setConfigs(res.configs)
        setActiveId(res.active_id)
        const next = res.configs.find((c) => c.id === (selectedId === p ? '' : selectedId)) || res.configs[0]
        if (next) selectConfig(next)
        else {
          setSelectedId('')
          setForm(emptyForm('配置1'))
        }
      } else {
        await refresh()
      }
    } catch (e) {
      setStatus('error')
      setStatusMsg(extractErrorMessage(e, t('aiDeleteFailed')))
      setPendingDelete(null)
    }
  }

  // 设为当前启用
  const handleSetActive = async (id: string) => {
    await setActiveAIConfig(id)
    setActiveId(id)
  }

  const formValid = form.base_url.trim() !== '' && form.model.trim() !== ''

  return (
    <>
      <Modal ref={modalRef} onClose={onClose} width="w-[900px]" cardClassName="flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-surface-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary-600" />
            <span className="text-sm font-semibold text-surface-800">{t('aiSection')}</span>
            <span className="text-[11px] text-surface-400">{t('aiConfigHeldCount').replace('{n}', String(configs.length))}</span>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip label={t('aiNewConfig')}>
              <button type="button" onClick={startNew} className="p-1 rounded-md text-surface-400 hover:text-primary-500 hover:bg-surface-100 transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* 当前启用栏 */}
        <div className="px-6 py-2.5 bg-surface-50/60 border-b border-surface-100 flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {(() => {
                const act = configs.find((c) => c.id === activeId)
                return (
                  <>
                    <ProviderLogo provider={act?.provider || 'custom'} size={20} />
                    <span className="text-xs text-surface-600 truncate">
                      {t('aiActivePrefix')} {act ? act.name : `— ${t('aiNoActive')}`}
                    </span>
                    {act && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-primary-700 bg-primary-50 rounded">
                        <Check className="w-2.5 h-2.5" />
                        {t('aiActiveNow')}
                      </span>
                    )}
                  </>
                )
              })()}
            </div>
            {configs.length > 0 && (
              <div className="w-52 shrink-0">
                <CustomSelect
                  value={activeId}
                  onChange={handleSetActive}
                  options={configs.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder={t('aiSwitchActive')}
                />
              </div>
            )}
          </div>
        </div>

        {/* Body：左列表 + 右表单（稳定高度，随内容在各自滚动区展示） */}
        <div className="flex flex-1 overflow-hidden">
          {/* 列表 */}
          <div className="w-[240px] border-r border-surface-100 overflow-y-auto p-2 flex-shrink-0">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-surface-300">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : configs.length === 0 ? (
              <p className="text-xs text-surface-400 px-3 py-6 text-center">{t('aiEmpty')}</p>
            ) : (
              configs.map((c) => (
                <div
                  key={c.id}
                  onClick={() => selectConfig(c)}
                  className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors border-l-2 ${
                    selectedId === c.id
                      ? 'bg-surface-50 border-l-primary-500'
                      : 'border-l-transparent hover:bg-surface-50'
                  }`}
                >
                  <ProviderLogo provider={c.provider} size={22} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-surface-700 truncate">{c.name}</p>
                    <p className="text-[11px] text-surface-400 truncate">{c.provider}</p>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Tooltip label={t('aiTest')}>
                      <button
                        type="button"
                        className="p-1 rounded-md text-surface-400 hover:text-primary-500 hover:bg-surface-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          selectConfig(c)
                          void (async () => {
                            setTesting(true)
                            setTestMsg('')
                            try {
                              const r = await testConnection(c.id)
                              setTestMsg(r?.ok ? 'success' : 'error')
                              setTestDetail(
                                r?.ok ? t('aiConnectionOk').replace('{ms}', String(r.latency_ms ?? 0)) : r?.message || '',
                              )
                            } catch (err) {
                              setTestMsg('error')
                              setTestDetail(extractErrorMessage(err, t('aiConnectionFail').replace('{msg}', '')))
                            } finally {
                              setTesting(false)
                            }
                          })()
                        }}
                      >
                        <Zap className="w-3.5 h-3.5" />
                      </button>
                    </Tooltip>
                    <Tooltip label={t('aiDelete')}>
                      <button
                        type="button"
                        className="p-1 rounded-md text-red-400 hover:bg-red-100 hover:text-red-600"
                        onClick={(e) => {
                          e.stopPropagation()
                          setPendingDelete(c)
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              ))
            )}
            <button
              type="button"
              onClick={startNew}
              className="w-full mt-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-sm text-primary-600 hover:bg-primary-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('aiNewConfig')}
            </button>
          </div>

          {/* 表单 */}
          <div className="flex-1 overflow-y-auto p-5 min-h-[380px]">
            <div className="space-y-3">
              <div className="flex items-center gap-3 mb-1">
                <ProviderLogo provider={form.provider} size={28} />
                <div className="flex-1">
                  <label className="form-label mb-1">{t('aiConfigName')}</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder={t('aiConfigNamePlaceholder')}
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="form-label">{t('aiProvider')}</label>
                <CustomSelect value={form.provider} onChange={onProviderChange} options={providerOptions} />
              </div>

              <div>
                <label className="form-label">{t('aiBaseUrl')}</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder={t('aiBaseUrlPlaceholder')}
                  value={form.base_url}
                  onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
                />
              </div>

              <div>
                <label className="form-label">{t('aiModel')}</label>
                <CustomSelect value={modelValue} onChange={onModelChange} options={modelOptions} placeholder={t('aiModelPlaceholder')} emptyText={t('aiModelEmpty')} />
                <Expandable show={aiCustom} gapTop={8}>
                  <input
                    className="form-input"
                    type="text"
                    placeholder={t('aiModelPlaceholder')}
                    value={form.model}
                    onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                  />
                </Expandable>
              </div>

              <div>
                <label className="form-label">{t('aiApiKey')}</label>
                <div className="relative">
                  <input
                    type="text"
                    autoComplete="off"
                    className={`form-input pr-10 ${showKey ? '' : '[-webkit-text-security:disc]'}`}
                    placeholder={t('aiApiKeyPlaceholder')}
                    value={form.api_key}
                    onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                  />
                  <Tooltip className="absolute right-2 top-1/2 -translate-y-1/2" label={showKey ? t('hidden') : t('unhideHint')}>
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="p-1 rounded-md text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </Tooltip>
                </div>
                {form.hasKey && <p className="text-[11px] text-surface-400 mt-1">{t('aiKeyLockedHint')}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Footer (固定；左侧常驻保存/测试状态提示，右侧操作按钮) */}
        <div className="flex items-center gap-3 px-6 py-3 border-t border-surface-100 flex-shrink-0">
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <Expandable show={status !== ''}>
              {status !== '' && (
                <p className={`text-xs flex items-center gap-1 ${status === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                  {status === 'error' ? <AlertCircle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                  {statusMsg}
                </p>
              )}
            </Expandable>
            <Expandable show={testMsg !== ''}>
              {testMsg !== '' && (
                <p className={`text-xs flex items-center gap-1 ${testMsg === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                  {testMsg === 'error' ? <AlertCircle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                  {testDetail}
                </p>
              )}
            </Expandable>
          </div>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || saving || !formValid}
            className="btn-secondary btn-sm inline-flex items-center gap-1.5"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t('aiTest')}
          </button>
          <button type="button" onClick={() => modalRef.current?.close()} className="btn-secondary btn-sm">
            {t('cancel')}
          </button>
          <button type="button" onClick={handleSave} disabled={saving || testing} className="btn-primary btn-sm inline-flex items-center gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t('aiSave')}
          </button>
        </div>
      </Modal>

      {/* 删除二次确认 */}
      <ConfirmDialog
        open={confirmDelete}
        title={t('aiDeleteTitle')}
        description={`${t('aiDeleteConfirm')}\n${pendingDelete?.name ?? ''}\n\n${t('aiDeleteKeyNote')}`}
        confirmText={t('aiDelete')}
        icon={<Trash2 className="w-5 h-5 text-red-600" />}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  )
}