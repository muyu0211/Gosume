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

/** 提示与视口边缘的最小间距（px）。 */
const EDGE_MARGIN = 6

interface TipPos {
  top: number
  left: number
}

/**
 * 统一的主题感知悬浮提示，替代浏览器原生 title。
 *
 * 提示本体通过 **Portal 渲染到 document.body 并以 fixed 定位**，因此不会被父组件
 * 的 overflow / transform 祖先裁剪。定位为**动态计算**：
 * - 先按 side 与触发元素锚点取基准位置，再读取提示自身尺寸，
 *   将 left/top **钳制在视口内**（贴近窗口边缘时自动内收，不再被裁）；
 * - hover / 键盘聚焦时显示，滚动（面板内部小滚动除外）时跟随触发元素重算。
 * useLayoutEffect 在绘制前完成定位，避免闪烁。
 */
export function Tooltip({ label, children, side = 'bottom', className = '' }: TooltipProps) {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<TipPos>({ top: 0, left: 0 })

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

  // 依据触发元素与提示自身尺寸计算定位，并钳制在视口内。
  const updatePos = () => {
    const r = wrapRef.current?.getBoundingClientRect()
    const tip = tipRef.current
    if (!r || (r.width === 0 && r.height === 0) || !tip) return
    const tw = tip.offsetWidth
    const th = tip.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2

    let top = 0
    let left = 0
    switch (side) {
      case 'bottom':
        left = clamp(cx - tw / 2, EDGE_MARGIN, vw - tw - EDGE_MARGIN)
        top = r.bottom + GAP
        break
      case 'top':
        left = clamp(cx - tw / 2, EDGE_MARGIN, vw - tw - EDGE_MARGIN)
        top = r.top - GAP - th
        break
      case 'right':
        top = clamp(cy - th / 2, EDGE_MARGIN, vh - th - EDGE_MARGIN)
        left = r.right + GAP
        break
      case 'left':
        top = clamp(cy - th / 2, EDGE_MARGIN, vh - th - EDGE_MARGIN)
        left = r.left - GAP - tw
        break
    }
    setPos({ top, left })
  }

  const reveal = () => {
    setOpen(true)
    // 先以当前（或占位）位置渲染，useLayoutEffect 在绘制前完成真实定位
  }

  // 打开时在绘制前定位（此时提示已挂载可测尺寸）。
  useLayoutEffect(() => {
    if (open) updatePos()
    // updatePos 为稳定闭包，仅依赖 open/side
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, side])

  // 滚动跟随：面板内部滚动（target 在 wrap 内）不重算，其余滚动时跟随避免 fixed 漂移。
  useEffect(() => {
    if (!open) return
    const onScroll = (e: Event) => {
      if (wrapRef.current?.contains(e.target as Node)) return
      updatePos()
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
            ref={tipRef}
            className="fixed z-[9999] px-2.5 py-1.5 bg-elev text-surface-700 border border-surface-200 text-xs rounded-lg whitespace-nowrap shadow-lg pointer-events-none animate-dropdown-enter"
            style={{ top: pos.top, left: pos.left }}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  )
}