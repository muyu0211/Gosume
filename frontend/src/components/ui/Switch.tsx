interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** 必填：开关本体没有可见文字，无障碍标签靠它提供。 */
  label: string
  disabled?: boolean
  /** 追加到开关本体上的样式（宽度/对齐等）。 */
  className?: string
}

/**
 * 液态玻璃开关（iOS 风格 toggle）。
 *
 * 规范：docs/Gosume液态玻璃/液态玻璃落地规范.md 第 8.5 节
 *
 * - **胶囊轨道 + 玻璃材质**：底色走 `--lg-tint` 系列，高光/描边/投影复用 `--glass-layers`。
 *   开启态用实色 `--primary-600`（与主按钮同一策略：语义色打底，只叠玻璃高光）。
 * - **刻意不加 `backdrop-filter`**：开关常与其它控件同行摆放，加了会重蹈
 *   「hover 串扰」bug（相邻元素互相采样，见 globals.css `.glass-blur` 的说明）。
 *   且开启态是实色，模糊本来也看不见。
 * - 圆角胶囊（`--radius-full`），开启态旋钮位移 18px，过渡走 `--ease-apple-out`。
 * - 无障碍：`role="switch"` + `aria-checked` + 必填 `label`；本体是 `<button>`，
 *   天然支持 Enter/Space 触发与 Tab 聚焦，焦点环走全局 `--shadow-focus`。
 *
 * 替代了设置页原先的 `<input type="checkbox">`（原生勾选框在深色下观感突兀，
 * 且与全项目的胶囊语言不一致）。
 */
export function Switch({ checked, onChange, label, disabled = false, className = '' }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`gosume-switch ${checked ? 'gosume-switch-on' : ''} ${className}`}
    >
      <span className="gosume-switch-knob" aria-hidden="true" />
    </button>
  )
}
