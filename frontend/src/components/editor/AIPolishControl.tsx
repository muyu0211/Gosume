import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Loader2, Undo2 } from 'lucide-react'
import { getAIConfig, polishText, type PolishMode } from '../../services/aiService'
import { useResumeStore } from '../../stores/resumeStore'
import { extractErrorMessage } from '../../lib/errorUtils'
import { useT } from '../../lib/i18n'
import { Tooltip } from '../ui/Tooltip'

/** 润色模式菜单选项（label 走 i18n）。 */
const MODES: Array<{ value: PolishMode; labelKey: string }> = [
  { value: 'polish', labelKey: 'aiModePolish' },
  { value: 'expand', labelKey: 'aiModeExpand' },
  { value: 'condense', labelKey: 'aiModeCondense' },
  { value: 'formal', labelKey: 'aiModeFormal' },
  { value: 'concise', labelKey: 'aiModeConcise' },
]

interface AIPolishControlProps {
  /** 当前字段原文（空时禁用入口）。 */
  text: string
  /** 语义类型：summary/job/project/education/award/custom/highlight/extra（与后端 prompts 对齐）。 */
  semantic: string
  /** 润色成功（或撤销）后就地写回的回调。 */
  onPolish: (result: string) => void
  /** 追加样式（如对齐类）。 */
  className?: string
}

/**
 * 就地 AI 润色入口：字段旁的图标按钮 + 模式下拉菜单 + 加载/撤销/错误反馈。
 * 未配置 AI 时点击提示并引导到设置页；润色后可一键撤销回原文。
 * 菜单定位复用 RichTextField 的锚点下拉范式（fixed + Portal，滚动跟随、外部/Escape 关闭）。
 */
export function AIPolishControl({ text, semantic, onPolish, className = '' }: AIPolishControlProps) {
  const t = useT()
  const navigate = useNavigate()
  const resumeLang = useResumeStore((s) => s.resume?.meta.language) || 'zh-CN'

  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  /** 本次润色前的原文（用于撤销）；null 表示无待撤销状态。 */
  const [original, setOriginal] = useState<string | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)

  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const hasText = !!text.trim()
  const busy = loading

  // 打开/切换模式菜单：每次点击都即时检测配置，避免 stale 缓存把菜单永久锁死。
  // 配置有效才展开菜单（可反复切换模式）；未配置则提示并引导设置页。
  const handleToggle = async () => {
    if (busy) return
    if (!hasText) return
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

  // 执行润色：记住原文用于撤销，成功后就地回填。
  const runPolish = async (mode: PolishMode) => {
    setOpen(false)
    if (!hasText || loading) return
    setLoading(true)
    setError('')
    setOriginal(text)
    try {
      const res = await polishText(text, mode, semantic, resumeLang)
      if (res) onPolish(res.result)
    } catch (e) {
      setOriginal(null)
      setError(extractErrorMessage(e, t('aiPolishFailed')))
    } finally {
      setLoading(false)
    }
  }

  const undo = () => {
    if (original == null) return
    onPolish(original)
    setOriginal(null)
    setError('')
  }

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      <Tooltip label={t('aiPolish')} side="bottom">
        <button
          ref={btnRef}
          type="button"
          disabled={!hasText || busy}
          onClick={handleToggle}
          className={`p-1 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed
            ${loading || open ? 'text-primary-600 bg-primary-50' : 'text-surface-400 hover:text-primary-500 hover:bg-surface-100'}`}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        </button>
      </Tooltip>

      {/* 撤销回原文 */}
      {original != null && !busy && (
        <button
          type="button"
          onClick={undo}
          title={t('aiUndo')}
          className="inline-flex items-center gap-1 text-[11px] px-1.5 py-1 rounded-md text-surface-500 hover:text-primary-600 hover:bg-surface-100 transition-colors"
        >
          <Undo2 className="w-3 h-3" />
          {t('aiUndo')}
        </button>
      )}

      {/* 错误/未配置引导：紧凑红字 + 去设置 */}
      {error !== '' && !open && (
        <span className="text-[11px] text-red-600 flex items-center gap-1">
          {error}
          {!configured && (
            <button type="button" onClick={() => navigate('/settings')} className="underline hover:text-primary-600">
              {t('aiGoSettings')}
            </button>
          )}
        </span>
      )}

      {/* 模式菜单（Portal + fixed，脱离 transform 祖先定位） */}
      {open && pos && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] min-w-[150px] bg-elev border border-surface-200 rounded-lg shadow-lg py-1 animate-dropdown-enter"
          style={{ top: pos.top, left: pos.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-surface-600 hover:bg-surface-100 hover:text-surface-800 text-left"
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