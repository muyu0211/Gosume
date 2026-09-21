import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import type { SelectOption } from './CustomSelect'

interface Props {
  /** 受控文本：自由输入与点选都会走同一个 onChange。 */
  value: string
  onChange: (value: string) => void
  /** 候选列表（展示 label；点选后把 label 写回输入框）。 */
  options: SelectOption[]
  placeholder?: string
  /** 输入框样式（如表单的 inputClass，含低置信度警告描边），由调用方控制视觉。 */
  inputClassName?: string
  ariaLabel?: string
}

/** 面板最大高度（与 CustomSelect 一致）。 */
const PANEL_MAX_HEIGHT = 224
/** 面板最小宽度：窄容器下面板同宽会挤掉选项文字。 */
const PANEL_MIN_WIDTH = 120
/** 面板与视口边缘的最小留白。 */
const VIEWPORT_MARGIN = 8

/**
 * 可输入 + 可下拉选择的组合输入框（combobox）。
 *
 * - 输入框始终可自由键入（新公司名等列表外的值直接落盘，不报错）；
 * - 聚焦或键入时打开候选面板，候选项按输入文本实时过滤（不区分大小写的包含匹配）；
 * - 过滤后无候选 → 面板不展开（或自动收起），纯手动输入路径完全可用；
 * - 点选项把 label 写回输入框；↑↓ 导航、Enter 选中、Escape 关闭；
 * - 面板经 Portal 渲染到 body 并 fixed 定位（同 CustomSelect）：不被模态
 *   overflow 裁剪、下方空间不足自动上翻、滚动/缩放重算定位、点外关闭。
 *
 * 去重由调用方的数据源保证（如 companyOptions 已按 norm 去重）。
 */
export function Combobox({ value, onChange, options, placeholder, inputClassName = '', ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)

  const q = value.trim().toLowerCase()
  const filtered = useMemo(
    () => (q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options),
    [options, q],
  )

  const close = useCallback(() => setOpen(false), [])

  const updatePos = useCallback(() => {
    const input = inputRef.current
    if (!input) return
    const rect = input.getBoundingClientRect()
    const top = rect.bottom + 6
    const width = Math.max(input.offsetWidth, PANEL_MIN_WIDTH)
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN)
    const left = Math.min(Math.max(VIEWPORT_MARGIN, rect.left), maxLeft)
    const availableBelow = Math.max(80, window.innerHeight - rect.bottom - 14)
    const maxHeight = Math.min(PANEL_MAX_HEIGHT, availableBelow)
    setPos({ top, left, width, maxHeight })
  }, [])

  useLayoutEffect(() => {
    if (open) updatePos()
  }, [open, updatePos])

  // 面板展开期间：滚动/缩放重算定位（不关闭）；点外 / Escape 关闭。
  useEffect(() => {
    if (!open) return
    const onScroll = (e: Event) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (inputRef.current?.contains(target)) return
      updatePos()
    }
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (inputRef.current?.contains(target)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onResize = () => updatePos()
    window.addEventListener('scroll', onScroll, true)
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open, close, updatePos])

  // 高亮索引随过滤结果重置（越界保护）。
  useEffect(() => {
    setActive(-1)
  }, [filtered.length])

  /** 根据当前文本判定是否值得开面板：无匹配候选时保持关闭（纯手动输入，不报错）。 */
  const syncOpen = useCallback(
    (text: string) => {
      const nq = text.trim().toLowerCase()
      const has = nq ? options.some((o) => o.label.toLowerCase().includes(nq)) : options.length > 0
      setOpen(has)
    },
    [options],
  )

  const pick = useCallback(
    (opt: SelectOption) => {
      onChange(opt.label)
      close()
      // 选完回焦输入框，便于继续填后续字段。
      inputRef.current?.focus()
    },
    [onChange, close],
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (open && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((i) => (i + 1) % filtered.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => (i <= 0 ? filtered.length - 1 : i - 1))
        return
      }
      if (e.key === 'Enter') {
        // 有高亮项选高亮项；唯一候选时 Enter 直选，否则保留手动输入语义。
        const opt = filtered[active] ?? (filtered.length === 1 ? filtered[0] : null)
        if (opt) {
          e.preventDefault()
          pick(opt)
        }
        return
      }
    }
    if (e.key === 'Escape') close()
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          syncOpen(e.target.value)
        }}
        onFocus={() => syncOpen(value)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName}
      />

      {open && pos && filtered.length > 0 &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
            className="fixed z-[9999] overflow-auto glass-menu animate-dropdown-enter py-1"
            role="listbox"
          >
            {filtered.map((opt, i) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                // 抢在 input blur 之前消费 mousedown，避免面板先被点外逻辑关掉。
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
                className={`glass-menu-item w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors ${
                  opt.value === value
                    ? 'bg-primary-50/60 text-primary-700'
                    : active === i
                      ? 'bg-surface-100 text-surface-700'
                      : 'text-surface-600 hover:bg-surface-100'
                }`}
              >
                <span className="truncate font-medium">{opt.label}</span>
                {opt.value === value && <Check className="size-icon-md shrink-0 text-primary-600" />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
