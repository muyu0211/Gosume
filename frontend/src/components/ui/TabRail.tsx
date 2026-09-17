import { useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface TabRailItem<T extends string = string> {
  value: T
  /** 已过 i18n 的展示文案。 */
  label: string
  icon: LucideIcon
  /** 右侧角标（如简历数量）；undefined 不渲染。 */
  badge?: number
  disabled?: boolean
}

interface Props<T extends string> {
  value: T
  /** 仅在**实际发生切换**时触发。 */
  onChange: (value: T) => void
  items: TabRailItem<T>[]
  /** 必填：无障碍标签，如「首页视图切换」。 */
  ariaLabel: string
  /** 整体禁用。 */
  disabled?: boolean
  /** 追加到外层容器的类名（宽度、内边距等），不在组件内写死尺寸。 */
  className?: string
}

/**
 * 通用竖向 Tab 栏（首页「我的简历 / 简历模板」，后续可直接加项）。
 *
 * 与水平分段控件 `LiquidSegmented` 的差异：
 * - 纵向排布、每项「图标 + 文案 + 可选角标」，宽度由调用方通过 className 控制；
 * - 无独立滑动胶囊（竖向整块移动会与文字换行冲突），选中态用底色 + 主色文字表达；
 * - 交互纪律同 `LiquidSegmented`：hover 只变颜色/背景，禁止位移与缩放。
 *
 * 无障碍：roving tabindex（整个控件一个 Tab 停靠点），上下方向键 / Home / End 切换。
 */
export function TabRail<T extends string = string>({
  value,
  onChange,
  items,
  ariaLabel,
  disabled = false,
  className = '',
}: Props<T>) {
  const activeIndex = Math.max(
    0,
    items.findIndex((it) => it.value === value),
  )

  /** 从 from 出发按 step 找下一个可用项（跳过 disabled），找不到返回 -1。 */
  const move = useCallback(
    (from: number, step: number) => {
      const n = items.length
      if (!n) return -1
      let i = from
      for (let k = 0; k < n; k++) {
        i = (i + step + n) % n
        if (!items[i].disabled) return i
      }
      return -1
    },
    [items],
  )

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (disabled) return
      let target = -1
      switch (e.key) {
        case 'ArrowDown':
          target = move(activeIndex, 1)
          break
        case 'ArrowUp':
          target = move(activeIndex, -1)
          break
        case 'Home':
          target = move(-1, 1)
          break
        case 'End':
          target = move(items.length, -1)
          break
        default:
          return
      }
      if (target < 0) return
      e.preventDefault()
      const item = items[target]
      if (item.value !== value) onChange(item.value)
    },
    [activeIndex, disabled, items, move, onChange, value],
  )

  return (
    <div
      className={`flex flex-col gap-1 ${className}`}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="vertical"
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
    >
      {items.map((item, i) => {
        const selected = i === activeIndex
        const Icon = item.icon
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled || item.disabled}
            onClick={() => {
              if (disabled || item.disabled) return
              if (item.value !== value) onChange(item.value)
            }}
            className={`flex items-center gap-2 w-full h-ctl-xl px-3 rounded-lg text-left transition-colors duration-fast ${
              selected
                ? 'bg-primary-600/10 text-primary-700'
                : 'text-surface-500 hover:bg-surface-600/6 hover:text-surface-700'
            }`}
          >
            <Icon className="size-icon-md shrink-0" strokeWidth={selected ? 2.25 : 1.75} />
            <span className={`flex-1 min-w-0 truncate text-sm ${selected ? 'font-medium' : ''}`}>
              {item.label}
            </span>
            {item.badge != null && (
              <span
                className={`shrink-0 text-xs tabular-nums ${
                  selected ? 'text-primary-600' : 'text-surface-400'
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
