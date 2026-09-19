import { Check, Minus } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: ReactNode
  ariaLabel?: string
  indeterminate?: boolean
  disabled?: boolean
  className?: string
}

/**
 * 通用复选框（全库唯一的 checkbox 实现，禁用原生 `input[type=checkbox]`）。
 *
 * 原生勾选框在各内核下的方框尺寸、勾形、聚焦环差异很大，且没法用主题令牌
 * 统一样式（深色下观感突兀），因此用 `button + 视觉方块` 自绘：
 * - 勾选区尺寸走 `size-icon-md`、图标走 `size-icon-xs`，与设计档位对齐；
 * - 选中态用 `primary-600` 实底，半选态同底但渲染横杠；
 * - 键盘焦点光晕由全局 `button:focus-visible` 规则统一施加 `--shadow-focus`
 *   （本组件根节点是 button，无需自写焦点类——boxShadow 插件无
 *   focusVisible 变体，在此写 focus-visible:* 类不会生成，实测确认）。
 *
 * 无障碍：`role="checkbox"` + `aria-checked`（半选时为 `mixed`），
 * 受控组件：`checked` + `onChange(checked: boolean)`。
 */
export function Checkbox({
  checked,
  onChange,
  label,
  ariaLabel,
  indeterminate = false,
  disabled = false,
  className = '',
}: Props) {
  const on = checked || indeterminate
  const box =
    'size-icon-md shrink-0 rounded-xs border border-hairline flex items-center justify-center transition-colors duration-fast'

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 text-left text-sm transition-colors duration-fast ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${label ? 'text-surface-700' : ''} ${className}`}
    >
      <span
        className={`${box} ${
          on ? 'bg-primary-600 border-primary-600' : 'bg-transparent border-surface-300 hover:border-surface-400'
        }`}
      >
        {indeterminate ? (
          <Minus className="size-icon-xs text-white" strokeWidth={3} />
        ) : checked ? (
          <Check className="size-icon-xs text-white" strokeWidth={3} />
        ) : null}
      </span>
      {label != null && <span className="min-w-0 truncate">{label}</span>}
    </button>
  )
}
