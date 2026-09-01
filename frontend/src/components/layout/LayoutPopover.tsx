import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'
import { useLayoutStore } from '../../stores/layoutStore'
import {
  MARGIN_PX_MIN,
  MARGIN_PX_MAX,
  SPACING_PX_MIN,
  SPACING_PX_MAX,
} from '../../lib/layoutPresets'
import { AlignVerticalJustifyStart, ChevronsLeftRight, Rows3, ChevronDown } from 'lucide-react'

/**
 * Toolbar layout controls — two consistent dropdowns (O-1):
 *
 *   1. 页边距  — two sliders (上下 / 左右), 1px step
 *   2. 内容间距 — three sliders (模块 / 条目 / 细节), 1px step
 *
 * Values are global px numbers persisted via the layout store; dragging
 * calls setLayout immediately so live preview refreshes (WYSIWYG).
 * Trigger styling and panel styling are identical for both dropdowns.
 */

interface DropdownProps {
  icon: ReactNode
  label: string
  children: ReactNode
}

function LayoutDropdown({ icon, label, children }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const close = useCallback(() => {
    setOpen(false)
    exitTimerRef.current = setTimeout(() => setVisible(false), 150)
  }, [])

  useEffect(() => {
    if (open) {
      setVisible(true)
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    }
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    }
  }, [open])

  useEffect(() => {
    if (!visible) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
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
  }, [visible, close])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        className={`flex items-center gap-1.5 h-8 px-2 text-xs rounded-md transition-colors ${
          open ? 'bg-surface-100 text-surface-700' : 'hover:bg-surface-100 text-surface-600'
        }`}
      >
        {icon}
        <span>{label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {visible && (
        <div
          className={`absolute right-0 top-full mt-1 w-64 bg-elev rounded-lg border border-surface-200 shadow-lg z-50 will-change-transform ${
            open ? 'animate-dropdown-enter' : 'animate-dropdown-exit pointer-events-none'
          }`}
        >
          <div className="px-3 pt-3 pb-3">{children}</div>
        </div>
      )}
    </div>
  )
}

/** 单条拖动条：label + 数值 + range。 */
function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-medium text-surface-600">{label}</span>
        <span className="text-[11px] font-mono text-surface-500">{value}px</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full margin-range-slider"
      />
    </div>
  )
}

export function LayoutPopover() {
  const layout = useLayoutStore((s) => s.layout)
  const setLayout = useLayoutStore((s) => s.setLayout)

  return (
    <>
      <LayoutDropdown icon={<ChevronsLeftRight className="w-3.5 h-3.5" />} label="页边距">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[11px] text-surface-400 flex items-center gap-1.5">
            <ChevronsLeftRight className="w-3 h-3" />
            页边距
          </span>
          <span className="text-[11px] text-surface-400">{layout.pageMarginY}×{layout.pageMarginX}px</span>
        </div>
        <SliderRow
          label="上下"
          value={layout.pageMarginY}
          min={MARGIN_PX_MIN}
          max={MARGIN_PX_MAX}
          onChange={(v) => setLayout({ pageMarginY: v })}
        />
        <SliderRow
          label="左右"
          value={layout.pageMarginX}
          min={MARGIN_PX_MIN}
          max={MARGIN_PX_MAX}
          onChange={(v) => setLayout({ pageMarginX: v })}
        />
        <p className="text-[10px] text-surface-400 mt-2 leading-relaxed">控制页面四周的留白。</p>
      </LayoutDropdown>

      <LayoutDropdown icon={<Rows3 className="w-3.5 h-3.5" />} label="内容间距">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[11px] text-surface-400 flex items-center gap-1.5">
            <AlignVerticalJustifyStart className="w-3 h-3" />
            内容间距
          </span>
          <span className="text-[11px] text-surface-400">模块/条目/细节</span>
        </div>
        <SliderRow
          label="模块"
          value={layout.spacingSection}
          min={SPACING_PX_MIN}
          max={SPACING_PX_MAX}
          onChange={(v) => setLayout({ spacingSection: v })}
        />
        <SliderRow
          label="条目"
          value={layout.spacingItem}
          min={SPACING_PX_MIN}
          max={SPACING_PX_MAX}
          onChange={(v) => setLayout({ spacingItem: v })}
        />
        <SliderRow
          label="细节"
          value={layout.spacingDetail}
          min={SPACING_PX_MIN}
          max={SPACING_PX_MAX}
          onChange={(v) => setLayout({ spacingDetail: v })}
        />
        <p className="text-[10px] text-surface-400 mt-2 leading-relaxed">
          模块=板块之间；条目=板块内单项之间；细节=单项内各行之间。
        </p>
      </LayoutDropdown>
    </>
  )
}