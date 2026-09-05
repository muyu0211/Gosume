import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'
import { useResumeStore } from '../../stores/resumeStore'
import {
  MARGIN_PX_MIN,
  MARGIN_PX_MAX,
  SPACING_PX_MIN,
  SPACING_PX_MAX,
} from '../../lib/layoutPresets'
import { parseCustomCss, DISPLAY_DEFAULT_LAYOUT } from '../../lib/customCss'
import {
  AlignVerticalJustifyStart,
  ChevronsLeftRight,
  Rows3,
  ChevronDown,
} from 'lucide-react'

/**
 * Toolbar layout controls — two consistent dropdowns:
 *
 *   1. 页边距  — two sliders (上下 / 左右), 1px step（成对写入 custom_css）
 *   2. 内容间距 — three sliders (模块 / 条目 / 细节), 1px step（各自独立）
 *
 * Values live in per-resume custom_css（resume.custom_css），nil = 跟随模板原生
 * 外观。拖动立即写入并触发预览刷新（WYSIWYG）。
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

/** 单条拖动条：label + 数值（px）+ range。 */
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
  const resume = useResumeStore((s) => s.resume)
  const updateCustomCss = useResumeStore((s) => s.updateCustomCss)
  const nativeLayout = useResumeStore((s) => s.nativeLayout)
  const style = parseCustomCss(resume?.custom_css ?? '')

  // 页边距成对语义：--resume-padding 简写无法表达"一侧原生一侧自定义"，
  // 故任一滑块拖动都写入整对；未设置一侧取模板原生测量值（nativeLayout）作占位，
  // 使拖动从"当前实际渲染值"起步（避免从硬编码默认值跳到模板值）。测量前回退 DISPLAY_DEFAULT_LAYOUT。
  const marginY = style.pageMarginY ?? nativeLayout?.pageMarginY ?? DISPLAY_DEFAULT_LAYOUT.pageMarginY
  const marginX = style.pageMarginX ?? nativeLayout?.pageMarginX ?? DISPLAY_DEFAULT_LAYOUT.pageMarginX
  const setMargins = (patch: { pageMarginY?: number; pageMarginX?: number }) =>
    updateCustomCss({
      pageMarginY: patch.pageMarginY ?? marginY,
      pageMarginX: patch.pageMarginX ?? marginX,
    })

  const spacingSection = style.spacingSection ?? nativeLayout?.spacingSection ?? DISPLAY_DEFAULT_LAYOUT.spacingSection
  const spacingItem = style.spacingItem ?? nativeLayout?.spacingItem ?? DISPLAY_DEFAULT_LAYOUT.spacingItem
  const spacingDetail = style.spacingDetail ?? nativeLayout?.spacingDetail ?? DISPLAY_DEFAULT_LAYOUT.spacingDetail

  return (
    <>
      <LayoutDropdown icon={<ChevronsLeftRight className="w-3.5 h-3.5" />} label="页边距">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[11px] text-surface-400 flex items-center gap-1.5">
            <ChevronsLeftRight className="w-3 h-3" />
            页边距
          </span>
          <span className="text-[11px] font-mono text-surface-500">{marginY}×{marginX}px</span>
        </div>
        <SliderRow
          label="上下"
          value={marginY}
          min={MARGIN_PX_MIN}
          max={MARGIN_PX_MAX}
          onChange={(v) => setMargins({ pageMarginY: v })}
        />
        <SliderRow
          label="左右"
          value={marginX}
          min={MARGIN_PX_MIN}
          max={MARGIN_PX_MAX}
          onChange={(v) => setMargins({ pageMarginX: v })}
        />
        <p className="text-[10px] text-surface-400 mt-2 leading-relaxed">
          控制页面四周的留白，仅作用于当前简历。
        </p>
      </LayoutDropdown>

      <LayoutDropdown icon={<Rows3 className="w-3.5 h-3.5" />} label="内容间距">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[11px] text-surface-400 flex items-center gap-1.5">
            <AlignVerticalJustifyStart className="w-3 h-3" />
            内容间距
          </span>
          <span className="text-[11px] font-mono text-surface-500">{spacingSection}·{spacingItem}·{spacingDetail}px</span>
        </div>
        <SliderRow
          label="模块"
          value={spacingSection}
          min={SPACING_PX_MIN}
          max={SPACING_PX_MAX}
          onChange={(v) => updateCustomCss({ spacingSection: v })}
        />
        <SliderRow
          label="条目"
          value={spacingItem}
          min={SPACING_PX_MIN}
          max={SPACING_PX_MAX}
          onChange={(v) => updateCustomCss({ spacingItem: v })}
        />
        <SliderRow
          label="细节"
          value={spacingDetail}
          min={SPACING_PX_MIN}
          max={SPACING_PX_MAX}
          onChange={(v) => updateCustomCss({ spacingDetail: v })}
        />
        <p className="text-[10px] text-surface-400 mt-2 leading-relaxed">
          模块=板块之间；条目=板块内单项之间；细节=单项内各行之间。
        </p>
      </LayoutDropdown>
    </>
  )
}
