import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  /** 可选次级信息（如更新时间、版本号），显示在 label 下方小字。 */
  hint?: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  emptyText?: string
  disabled?: boolean
  /** 外层宽度控制（默认 w-full）。 */
  className?: string
}

/** 面板最大高度（与 max-h-56 一致），用于展开方向自适应估算。 */
const PANEL_MAX_HEIGHT = 224

/**
 * Gosume 风格的自定义下拉选择器，替代原生 <select>。
 *
 * 面板通过 Portal 渲染到 document.body 并以 fixed 定位，因此：
 * - 不会被子元素 overflow/transform 裁剪，也不会被模态框遮挡（z-[9999]）；
 * - 底部空间不足时自动向上展开；
 * - 外部点击 / Escape / 滚动（含对话框内部滚动）关闭。
 *
 * 视觉语言与全项目一致：白底圆角 + surface 边框 + primary 聚焦环 +
 * 选中项 primary 高亮 + Check 标记，面板使用 animate-dropdown-enter 动画。
 */
export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = '请选择',
  emptyText = '暂无可用选项',
  disabled = false,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)

  const selected = options.find((o) => o.value === value)

  const close = useCallback(() => setOpen(false), [])

  // 基于触发按钮的屏幕坐标计算面板位置（fixed 定位）
  //
  // 始终向下展开：底部空间不足时压缩面板 max-h 自适应，绝不上飘到远处
  // （避免 trigger 接近视口底部时面板跳到对话框上半部这种"飞走了"的视觉错位）。
  const updatePos = useCallback(() => {
    const btn = triggerRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const top = rect.bottom + 6
    const left = rect.left
    const width = rect.width
    const availableBelow = Math.max(80, window.innerHeight - rect.bottom - 14)
    const maxHeight = Math.min(PANEL_MAX_HEIGHT, availableBelow)
    setPos({ top, left, width, maxHeight })
  }, [])

  useLayoutEffect(() => {
    if (open) updatePos()
  }, [open, updatePos])

  // 面板打开期间的滚动处理：
  // - 面板内部滚动（滚轮浏览选项）→ 忽略，保持打开；
  // - 外部滚动（对话框/页面内容滚动）→ 重新定位面板跟随触发按钮，避免 fixed 漂移。
  useEffect(() => {
    if (!open) return
    const onScroll = (e: Event) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      updatePos()
    }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [open, updatePos])

  // 外部点击 / Escape 关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border bg-white transition-all duration-150 ${
          open
            ? 'border-primary-400 ring-2 ring-primary-500/20'
            : 'border-surface-200 hover:border-surface-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} text-left`}
      >
        <span className={`truncate ${selected ? 'text-surface-700' : 'text-surface-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-surface-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
            className="fixed z-[9999] overflow-auto bg-white rounded-lg border border-surface-200 shadow-xl animate-dropdown-enter py-1"
          >
            {options.length === 0 ? (
              <div className="px-3 py-2.5 text-sm text-surface-400">{emptyText}</div>
            ) : (
              options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value)
                    close()
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors ${
                    opt.value === value
                      ? 'bg-primary-50/60 text-primary-700'
                      : 'text-surface-600 hover:bg-surface-100'
                  }`}
                >
                  <span className="flex flex-col min-w-0">
                    <span className="truncate font-medium">{opt.label}</span>
                    {opt.hint && <span className="text-[11px] text-surface-400 truncate">{opt.hint}</span>}
                  </span>
                  {opt.value === value && <Check className="w-4 h-4 shrink-0 text-primary-600" />}
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
