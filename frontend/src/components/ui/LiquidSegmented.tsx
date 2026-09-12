import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

export interface SegmentedItem<T extends string = string> {
  value: T
  label: string
  disabled?: boolean
}

interface Props<T extends string> {
  /** 当前选中项的 value（受控组件）。 */
  value: T
  /** 仅在**实际发生切换**时触发；初始化、尺寸重算都不会触发。 */
  onChange: (value: T) => void
  items: SegmentedItem<T>[]
  /** 必填：无障碍标签，如「视图切换」。 */
  ariaLabel: string
  /** 整体禁用。 */
  disabled?: boolean
  /** 追加到外层容器的类名（宽度、外边距等）。 */
  className?: string
}

/**
 * 液态玻璃分段控件（如「编辑 / 预览 / 导出」）。
 *
 * 规范：docs/Gosume液态玻璃/液态玻璃落地规范.md 第 8.4 节
 * 预览：docs/liquid-glass-preview/index.html
 *
 * ## 动画实现方式
 *
 * 选中态**不是**按钮自身背景，而是抽离成一个独立的绝对定位胶囊 `.seg-pill`：
 *
 * - **位移走 transform**：`translate3d(x, y, 0)`，x/y 由 `getBoundingClientRect()`
 *   实测「目标按钮相对容器」的差值算出，因此文字长度不同的选项也能精确贴合。
 * - **宽度必须一起改**：不能用 `scaleX` 缩放——那会把胶囊两端的圆角一起拉扁。
 *   胶囊是 `position:absolute`，改它的 width/height 不会让兄弟按钮重排。
 * - **过渡按需挂载**：过渡写在 `.is-animated` 上，`place(false)` 时不挂该类，
 *   浏览器把「移除过渡 + 改 transform」合并成一次计算，直接跳到位。
 *   首次渲染与 ResizeObserver 重算都传 false，避免页面打开时胶囊从左上角滑入。
 * - **字重宽度预留**：选中态字重 500→600 会撑宽按钮、导致胶囊宽度跳一次。
 *   解法是 `.seg-txt::before` 渲染一份 `height:0` 的隐藏加粗副本
 *   （`content: attr(data-text)`），把加粗后的宽度在常规状态下就预留出来。
 *
 * ## 无障碍
 *
 * roving tabindex：整个控件只占一个 Tab 停靠点，内部用方向键 / Home / End 切换。
 *
 * 注意：这里沿用 `role="tablist" / role="tab"`（与预览页一致）。若用在不控制
 * tabpanel 的纯切换场景，语义上更准确的是 `radiogroup` + `radio` + `aria-checked`，
 * 届时把两个 role 换掉即可，其余逻辑不用动。
 */
export function LiquidSegmented<T extends string = string>({
  value,
  onChange,
  items,
  ariaLabel,
  disabled = false,
  className = '',
}: Props<T>) {
  const rootRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const prevValue = useRef<T | null>(null)

  const activeIndex = useMemo(() => {
    const i = items.findIndex((it) => it.value === value)
    return i >= 0 ? i : 0
  }, [items, value])

  // place 需要保持稳定引用（ResizeObserver 只订阅一次），
  // 因此把会变的数据放进 ref，由 effect 同步。
  const stateRef = useRef({ items, activeIndex })
  useEffect(() => {
    stateRef.current = { items, activeIndex }
  }, [items, activeIndex])

  /** 把胶囊对位到当前选中按钮。animate=false 时瞬间就位（首次渲染 / 尺寸重算）。 */
  const place = useCallback((animate: boolean) => {
    const root = rootRef.current
    const pill = pillRef.current
    if (!root || !pill) return

    const { items: its, activeIndex: ai } = stateRef.current
    const btn = btnRefs.current[its[ai]?.value ?? '']
    if (!btn) {
      pill.style.opacity = '0'
      return
    }

    const rootRect = root.getBoundingClientRect()
    const rect = btn.getBoundingClientRect()
    // 尚未布局（隐藏 / 零宽）时先藏起来，等 ResizeObserver 回调再定位
    if (!rect.width || !rect.height) {
      pill.style.opacity = '0'
      return
    }

    pill.classList.toggle('is-animated', animate)
    pill.style.width = `${rect.width}px`
    pill.style.height = `${rect.height}px`
    pill.style.transform = `translate3d(${rect.left - rootRect.left}px, ${rect.top - rootRect.top}px, 0)`
    pill.style.opacity = '1'
  }, [])

  // 选中项变化：只有真的换了才带动画
  useLayoutEffect(() => {
    const animate = prevValue.current !== null && prevValue.current !== value
    prevValue.current = value
    place(animate)
  }, [value, place])

  // 选项内容变化（中英切换、文案增删）→ 无动画重算
  const itemsKey = useMemo(() => items.map((it) => `${it.value}:${it.label}`).join('|'), [items])
  useLayoutEffect(() => {
    place(false)
  }, [itemsKey, place])

  // 容器尺寸变化 → 无动画重算
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const relayout = () => place(false)

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', relayout)
      return () => window.removeEventListener('resize', relayout)
    }
    const ro = new ResizeObserver(relayout)
    ro.observe(root)
    return () => ro.disconnect()
  }, [place])

  // 字体加载完成后文字宽度会变，重算一次
  useEffect(() => {
    const fonts = document.fonts
    if (fonts?.ready) {
      fonts.ready.then(() => place(false)).catch(() => {})
    }
  }, [place])

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
        case 'ArrowRight':
        case 'ArrowDown':
          target = move(activeIndex, 1)
          break
        case 'ArrowLeft':
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
      btnRefs.current[item.value]?.focus()
      if (item.value !== value) onChange(item.value)
    },
    [activeIndex, disabled, items, move, onChange, value],
  )

  return (
    <div
      ref={rootRef}
      // data-lg：液态玻璃引擎（规范批次 1）的挂载点，引擎落地后自动获得真实折射
      data-lg
      className={`seg ${className}`}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
    >
      <span ref={pillRef} className="seg-pill" aria-hidden="true" />

      {items.map((item, i) => {
        const selected = i === activeIndex
        return (
          <button
            key={item.value}
            ref={(el) => {
              btnRefs.current[item.value] = el
            }}
            type="button"
            role="tab"
            className="seg-btn"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled || item.disabled}
            onClick={() => {
              if (disabled || item.disabled) return
              if (item.value !== value) onChange(item.value)
            }}
          >
            {/* data-text 供 ::before 渲染隐藏的加粗副本，预留加粗后的宽度 */}
            <span className="seg-txt" data-text={item.label}>
              {item.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
