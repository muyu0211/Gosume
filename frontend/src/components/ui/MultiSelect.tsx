import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { useT } from '../../lib/i18n'

export interface MultiOption {
  value: string
  label: string
}

interface Props {
  value: string[]
  onChange: (value: string[]) => void
  options: MultiOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
}

/** 面板最大高度，用于展开方向自适应。 */
const PANEL_MAX_HEIGHT = 260
const PANEL_MIN_WIDTH = 160
const VIEWPORT_MARGIN = 8

/**
 * 通用多选下拉（筛选栏用）。
 *
 * 交互与 `CustomSelect` 对齐：Portal 到 body + `fixed` + `z-[9999]` + 入场动画，
 * 面板/选项行同样走 `.glass-menu` + `.glass-menu-item` 全局菜单标准（2026-09-19 统一）；
 * 底部空间不足时向上展开，外部点击 / Escape / 滚动关闭。
 * 空数组表示「不限」，触发器显示 placeholder。
 */
export function MultiSelect({
  value,
  onChange,
  options,
  placeholder = '全部',
  disabled = false,
  className = '',
}: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)

  const updatePos = () => {
    const btn = triggerRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const width = Math.max(btn.offsetWidth, PANEL_MIN_WIDTH)
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN)
    const left = Math.min(Math.max(VIEWPORT_MARGIN, r.left), maxLeft)
    const below = window.innerHeight - r.bottom - 14
    const above = r.top - 14
    const openUp = below < Math.min(PANEL_MAX_HEIGHT, 160) && above > below
    const maxHeight = Math.min(PANEL_MAX_HEIGHT, Math.max(120, openUp ? above : below))
    setPos({
      top: openUp ? r.top - 6 - maxHeight : r.bottom + 6,
      left,
      width,
      maxHeight,
    })
  }

  useLayoutEffect(() => {
    if (open) updatePos()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    /** 窗口尺寸变化（含标题栏最大化/还原、窗口拖拽）后重新贴合触发器。 */
    const onResize = () => updatePos()
    const onScroll = (e: Event) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      updatePos()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }

  const summary =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? placeholder)
        : `${placeholder} · ${value.length}`

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`w-full h-ctl-lg px-3 rounded-full bg-surface-600/6 flex items-center gap-1.5 text-sm transition-colors duration-fast ${
          value.length ? 'text-surface-800' : 'text-surface-500'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-surface-600/10'}`}
      >
        <span className="flex-1 min-w-0 truncate text-left">{summary}</span>
        <ChevronDown
          className={`size-icon-sm shrink-0 transition-transform duration-fast ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.75}
        />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
            className="fixed z-[9999] glass-menu overflow-auto animate-dropdown-enter py-1"
          >
            <div className="flex items-center justify-between gap-2 px-3 h-ctl-md ">
              <button
                type="button"
                onClick={() => onChange(options.map((o) => o.value))}
                className="text-xs text-primary-600 hover:text-primary-700 transition-colors duration-fast"
              >
                {t('selectAll')}
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-surface-500 hover:text-surface-700 transition-colors duration-fast"
              >
                {t('clearFilters')}
              </button>
            </div>
            {options.length === 0 ? (
              <p className="px-3 py-3 text-sm text-surface-400">{t('multiNoOptions')}</p>
            ) : (
              options.map((o) => {
                const checked = value.includes(o.value)
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o.value)}
                    className="glass-menu-item h-ctl-lg px-3 flex items-center gap-2 text-left transition-colors duration-fast hover:bg-surface-600/8"
                  >
                    <span
                      className={`size-icon-md shrink-0 rounded-sm border flex items-center justify-center ${
                        checked ? 'bg-primary-600 border-primary-600' : 'border-surface-300'
                      }`}
                    >
                      {checked && <Check className="size-icon-xs text-white" strokeWidth={3} />}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-sm text-surface-700">{o.label}</span>
                  </button>
                )
              })
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
