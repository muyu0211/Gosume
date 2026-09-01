import { type ReactNode } from 'react'

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

/**
 * 统一的主题感知悬浮提示，替代浏览器原生 title。
 *
 * 视觉与全项目一致：随主题取 `bg-elev`/`text-surface-700`/主题边框 + 阴影，
 * hover/键盘聚焦( focus-visible )时淡入。容器为 `relative inline-flex group/tip`，
 * 使用**命名 group** 使提示只在该包裹层内触发——避免宿主（如带 `group` 的卡片）
 * 的通用 `group-hover` 连带动整个 tooltip 一起显示。
 */
export function Tooltip({ label, children, side = 'bottom', className = '' }: TooltipProps) {
  const sideCls: Record<TooltipProps['side'], string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }[side]

  return (
    <span className={`relative inline-flex group/tip ${className}`}>
      {children}
      <span
        className={`absolute z-50 px-2.5 py-1.5 bg-elev text-surface-700 border border-surface-200 text-xs rounded-lg whitespace-nowrap shadow-lg opacity-0 group-hover/tip:opacity-100 group-focus-visible/tip:opacity-100 transition-opacity duration-150 pointer-events-none ${sideCls}`}
      >
        {label}
      </span>
    </span>
  )
}