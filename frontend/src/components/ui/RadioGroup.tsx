import type { ReactNode } from 'react'

export interface RadioOption<T extends string = string> {
  value: T
  label: ReactNode
  /** 仅 layout="card"：显示在 label 下方的辅助描述。 */
  description?: ReactNode
  /** 仅 layout="card"：label 前的图标（直接传 lucide 组件元素，尺寸/选中着色由组件统一处理）。 */
  icon?: ReactNode
  disabled?: boolean
}

interface Props<T extends string> {
  value: T
  onChange: (value: T) => void
  options: RadioOption<T>[]
  ariaLabel: string
  disabled?: boolean
  className?: string
  /**
   * - `inline`（默认）：圆点 + 文字横排，紧凑场景。
   * - `card`：整行卡片（glass-entry + glass-entry-selected），支持 icon / description，
   *   用于设置页选项、对话框格式/方式选择等富内容单选。
   */
  layout?: 'inline' | 'card'
}

/**
 * 通用单选组（替代原生 `input[type=radio]`）。
 *
 * 原生圆点在深色主题下无法令牌化（内核给的默认色），因此自绘：
 * 外圈 `size-icon-md` 圆形 + 选中时内嵌 `primary-600` 实心点。
 * 与 `Checkbox` 同源，尺寸与焦点策略保持一致
 * （键盘焦点光晕由全局 `button:focus-visible` 规则统一承担）。
 *
 * 所有互斥单选必须走本组件，禁止再手写 `input[type=radio]` 或
 * 自绘「选中态按钮组」；富内容卡片行用 `layout="card"`。
 */
export function RadioGroup<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  disabled = false,
  className = '',
  layout = 'inline',
}: Props<T>) {
  if (layout === 'card') {
    return (
      <div role="radiogroup" aria-label={ariaLabel} className={`flex flex-col gap-2 ${className}`}>
        {options.map((opt) => {
          const selected = opt.value === value
          const off = disabled || opt.disabled
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={off}
              onClick={() => onChange(opt.value)}
              className={`glass-entry glass-hover flex items-start gap-3 p-3 text-left transition-all duration-fast ${
                off ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
              } ${selected ? 'glass-entry-selected' : ''}`}
            >
              <span
                className={`mt-0.5 size-icon-md shrink-0 rounded-full border border-hairline flex items-center justify-center transition-colors duration-fast ${
                  selected
                    ? 'border-primary-600 bg-primary-600'
                    : 'border-surface-300 bg-transparent'
                }`}
              >
                {selected && <span className="size-icon-xs rounded-full bg-[rgb(var(--elev))]" />}
              </span>
              {opt.icon && (
                <span
                  className={`mt-0.5 flex shrink-0 [&_svg]:size-icon-lg ${
                    selected ? 'text-primary-500' : 'text-surface-400'
                  }`}
                >
                  {opt.icon}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-surface-700">{opt.label}</span>
                {opt.description && (
                  <span className="mt-0.5 block text-xs text-surface-400">{opt.description}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`flex items-center gap-4 flex-wrap ${className}`}>
      {options.map((opt) => {
        const selected = opt.value === value
        const off = disabled || opt.disabled
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={off}
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center gap-2 text-sm transition-colors duration-fast ${
              off ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
            } ${selected ? 'text-surface-800' : 'text-surface-600 hover:text-surface-700'}`}
          >
            <span
              className={`size-icon-md shrink-0 rounded-full border border-hairline flex items-center justify-center transition-colors duration-fast ${
                selected
                  ? 'border-primary-600 bg-primary-600'
                  : 'border-surface-300 bg-transparent hover:border-surface-400'
              }`}
            >
              {selected && <span className="size-icon-xs rounded-full bg-[rgb(var(--elev))]" />}
            </span>
            <span className="min-w-0 truncate">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
