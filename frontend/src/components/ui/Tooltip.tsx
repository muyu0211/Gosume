import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

interface TooltipProps {
  /** 提示内容。 */
  label: ReactNode
  /** 触发元素（按钮/图标等）。 */
  children: ReactNode
  /** 出现方位，默认 bottom。 */
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** 追加到外层容器上的类名（用于布局微调）。 */
  className?: string
}

/** 触发元素与提示之间的间隙（px）。 */
const GAP = 8

interface TipPos {
  top: number
  left: number
  x: string // 水平 transform（-50% 相对自身居中 / -100% 反向对齐）
  y: string // 垂直 transform
}

/**
 * 统一的主题感知悬浮提示，替代浏览器原生 title。
 *
 * 提示本体通过 **Portal 渲染到 document.body 并以 fixed 定位**，因此不会被父组件
 * 的 overflow / transform 祖先裁剪（此前 absolute + group-hover 会被遮挡）。
 * hover / 键盘聚焦时淡入，滚动（面板内部小滚动除外）时跟随触发元素重算位置。
 * 用 `translate(-50%)` 在垂直于开口方向居中，避免依赖自身尺寸测量。
 */
export function Tooltip({ label, children, side = 'bottom', className = '' }: TooltipProps) {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<TipPos | null>(null)

  // 依据触发元素当前视口位置计算提示定位。
  const calc = (): TipPos | null => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r || (r.width === 0 && r.height === 0)) return null
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    switch (side) {
      case 'bottom':
        return { top: r.bottom + GAP, left: cx, x: '-50%', y: '0' }
      case 'top':
        return { top: r.top - GAP, left: cx, x: '-50%', y: '-100%' }
      case 'right':
        return { top: cy, left: r.right + GAP, x: '0', y: '-50%' }
      case 'left':
        return { top: cy, left: r.left - GAP, x: '-100%', y: '-50%' }
    }
  }

  const reveal = () => {
    const p = calc()
    if (p) setPos(p)
    setOpen(true)
  }

  // 打开时先定位（useLayoutEffect 避免闪烁）。
  useLayoutEffect(() => {
    if (open) {
      const p = calc()
      if (p) setPos(p)
    }
  }, [open])

  // 滚动跟随：面板内部滚动（target 在 wrap 内）不重算，其余滚动时跟随避免 fixed 漂移。
  useEffect(() => {
    if (!open) return
    const onScroll = (e: Event) => {
      if (wrapRef.current?.contains(e.target as Node)) return
      const p = calc()
      if (p) setPos(p)
    }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [open])

  return (
    <span
      ref={wrapRef}
      className={`relative inline-flex ${className}`}
      onMouseEnter={reveal}
      onMouseLeave={() => setOpen(false)}
      onFocus={reveal}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open &&
        pos &&
        createPortal(
          <span
            className="fixed z-[9999] px-2.5 py-1.5 bg-elev text-surface-700 border border-surface-200 text-xs rounded-lg whitespace-nowrap shadow-lg pointer-events-none animate-dropdown-enter"
            style={{ top: pos.top, left: pos.left, transform: `translate(${pos.x}, ${pos.y})` }}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  )
}