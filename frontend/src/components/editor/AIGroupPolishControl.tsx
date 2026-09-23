import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Loader2, Sparkles, Undo2 } from 'lucide-react'
import { useT } from '../../lib/i18n'
import { useResumeStore } from '../../stores/resumeStore'
import { getAIConfig, polishHighlights, type PolishMode } from '../../services/aiService'
import { extractErrorMessage } from '../../lib/errorUtils'
import { Tooltip } from '../ui/Tooltip'

interface Props {
  /** 整组当前内容（快照与非空判定用） */
  highlights: string[]
  /** 条目上下文（公司 · 职位 等），可空 */
  context: string
  /** 整组回写（改写与撤销共用） */
  onApply: (next: string[]) => void
  className?: string
}

/** 整组场景收敛为 3 种模式（语气类双模式不开放，见方案 §3.2）。 */
const MODES: Array<{ value: PolishMode; labelKey: string }> = [
  { value: 'polish', labelKey: 'aiModePolish' },
  { value: 'expand', labelKey: 'aiModeExpand' },
  { value: 'condense', labelKey: 'aiModeCondense' },
]

/**
 * 「关键亮点」整组 AI 润色入口（方案 v0.3）：label 行的 Sparkles 按钮 +
 * 模式下拉菜单 + loading/整组撤销/错误反馈。
 *
 * 与单文本 `AIPolishControl` 的差异：处理单位是整组 bullet——请求携带全部
 * 非空亮点与条目上下文，响应逐条位置对应回写（空结果保留原文）；撤销粒度
 * 为整组快照。菜单定位复用 AIPolishControl 的 Portal + fixed 范式
 * （滚动跟随、外部/Escape 关闭）。
 */
export function AIGroupPolishControl({ highlights, context, onApply, className = '' }: Props) {
  const t = useT()
  const navigate = useNavigate()
  const resumeLang = useResumeStore((s) => s.resume?.meta.language) || 'zh-CN'

  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [configured, setConfigured] = useState<boolean | null>(null)
  /** 改写前的整组快照（用于撤销）；null 表示无待撤销状态。 */
  const [snapshot, setSnapshot] = useState<string[] | null>(null)

  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const hasContent = highlights.some((h) => h.trim() !== '')
  const busy = loading

  // 打开模式菜单：每次点击都即时探测配置（与 AIPolishControl 一致，避免 stale 缓存锁死菜单）
  const handleToggle = async () => {
    if (busy) return
    if (!hasContent) return
    let ok = false
    try {
      const info = await getAIConfig()
      ok = !!(info && info.base_url && info.model && info.key_masked)
    } catch {
      ok = false
    }
    setConfigured(ok)
    if (!ok) {
      setError(t('aiNeedConfigure'))
      setOpen(false)
      return
    }
    setError('')
    setOpen(true)
  }

  const updatePos = () => {
    const btn = btnRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.left })
  }

  useLayoutEffect(() => {
    if (open) updatePos()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onScroll = (e: Event) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      if (btnRef.current?.contains(target)) return
      updatePos()
    }
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      if (btnRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('scroll', onScroll, true)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // 执行整组润色：非空条目按原顺序发送，响应按位置映射回写；改写前快照整组用于撤销。
  const runPolish = async (mode: PolishMode) => {
    setOpen(false)
    if (!hasContent || loading) return
    setLoading(true)
    setError('')
    const snapshot = [...highlights]
    // 非空条目 + 原索引（空 bullet 不参与，回填时原位保留）
    const pairs = highlights
      .map((h, i) => ({ i, text: h.trim() }))
      .filter((p) => p.text !== '')
    try {
      const res = await polishHighlights(pairs.map((p) => p.text), mode, context, resumeLang)
      const results = res?.results ?? []
      const next = [...highlights]
      pairs.forEach((p, i) => {
        // 后端已保证等长；单条空串按约定保留原文
        if (results[i]) next[p.i] = results[i]
      })
      setSnapshot(snapshot)
      onApply(next)
    } catch (e) {
      setError(extractErrorMessage(e, t('aiPolishFailed')))
    } finally {
      setLoading(false)
    }
  }

  const undo = () => {
    if (snapshot == null) return
    onApply(snapshot)
    setSnapshot(null)
    setError('')
  }

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      <Tooltip label={t('aiPolish')} side="bottom">
        <button
          ref={btnRef}
          type="button"
          disabled={!hasContent || busy}
          onClick={handleToggle}
          className={`p-1 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed
            ${loading || open ? 'text-primary-600 bg-primary-50' : 'text-surface-400 hover:text-primary-500 hover:bg-surface-100'}`}
        >
          {loading ? <Loader2 className="size-icon-md animate-spin" /> : <Sparkles className="size-icon-md" />}
        </button>
      </Tooltip>

      {/* 整组撤销：恢复改写前快照 */}
      {snapshot != null && !busy && (
        <button
          type="button"
          onClick={undo}
          className="inline-flex items-center gap-1 text-[11px] px-1.5 py-1 rounded-md text-surface-500 hover:text-primary-600 hover:bg-surface-100 transition-colors"
        >
          <Undo2 className="w-3 h-3" />
          {t('aiUndo')}
        </button>
      )}

      {/* 错误/未配置引导：紧凑红字 + 去设置 */}
      {error !== '' && !open && (
        <span className="text-[11px] text-danger-600 flex items-center gap-1 min-w-0">
          <span className="truncate">{error}</span>
          {!configured && (
            <button type="button" onClick={() => navigate('/settings')} className="underline hover:text-primary-600 shrink-0">
              {t('aiGoSettings')}
            </button>
          )}
        </span>
      )}

      {/* 模式菜单（Portal + fixed，脱离 transform 祖先定位） */}
      {open && pos && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] min-w-[150px] glass-menu py-1 animate-dropdown-enter"
          style={{ top: pos.top, left: pos.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              className="glass-menu-item w-full flex items-center gap-2 px-3 py-1.5 text-sm text-surface-600 hover:bg-surface-100 hover:text-surface-800 text-left"
              onClick={() => runPolish(m.value)}
            >
              {t(m.labelKey)}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
