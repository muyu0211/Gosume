import { useState, useRef, useEffect, useCallback } from 'react'
import { useResumeStore } from '../../stores/resumeStore'
import { useLayoutSettingsStore } from '../../stores/layoutSettingsStore'
import {
  findMarginTier,
  findSpacingTier,
  marginTierDescription,
  spacingTierDescription,
  DEFAULT_SECTION_SPACING_KEY,
} from '../../lib/layoutPresets'
import { SlidersHorizontal, ChevronDown } from 'lucide-react'

/**
 * Toolbar popover that exposes the page layout controls:
 *
 *   1. Page margin — slider over the margin tiers
 *   2. Section spacing — discrete tier chips
 *
 * Both settings persist tier keys (resume.meta.page_margin /
 * section_spacing); tier lists come from the user-customizable layout
 * settings store (config.json via SystemService) and the mapping to
 * concrete CSS values happens in lib/layoutPresets, not here.
 *
 * Layout:
 *   [ icon | margin label | chevron ]   ← trigger button
 *   ┌──────────────────────────────────┐
 *   │ header "页面布局"                 │
 *   │ 页边距  slider + description      │
 *   │ 内容间距  preset chips            │
 *   └──────────────────────────────────┘
 *
 * Outside-click and Escape close the popover.
 */
export function LayoutPopover() {
  const resume = useResumeStore((s) => s.resume)
  const updateField = useResumeStore((s) => s.updateField)
  const margins = useLayoutSettingsStore((s) => s.margins)
  const spacings = useLayoutSettingsStore((s) => s.spacings)

  const marginTier = findMarginTier(resume?.meta?.page_margin, margins)
  const marginIndex = Math.max(
    0,
    margins.findIndex((t) => t.key === marginTier.key),
  )
  const spacingKey = resume?.meta?.section_spacing || DEFAULT_SECTION_SPACING_KEY
  const spacingTier = findSpacingTier(spacingKey, spacings)

  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const close = useCallback(() => {
    setOpen(false)
    // Delay removal until exit animation finishes
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
      if (ref.current && !ref.current.contains(e.target as Node)) {
        close()
      }
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
          open
            ? 'bg-surface-100 text-surface-700'
            : 'hover:bg-surface-100 text-surface-600'
        }`}
        title="页面布局"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span className="max-w-[64px] truncate tabular-nums">{marginTier.label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {visible && (
        <div
          className={`absolute right-0 top-full mt-1 w-72 bg-white rounded-lg border border-surface-200 shadow-lg z-50 will-change-transform ${
            open ? 'animate-dropdown-enter' : 'animate-dropdown-exit pointer-events-none'
          }`}
        >
          <div className="px-3 pt-3 pb-2">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] text-surface-400 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3 h-3" />
                页面布局
              </span>
            </div>

            {/* Page margin: slider over tiers */}
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-surface-600">页边距</span>
              <span className="text-[11px] font-mono text-surface-500">
                {marginTierDescription(marginTier)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={margins.length - 1}
              step={1}
              value={marginIndex}
              onChange={(e) => {
                const idx = parseInt(e.target.value, 10)
                if (!Number.isNaN(idx)) updateField('meta.page_margin', margins[idx].key)
              }}
              className="w-full margin-range-slider"
            />

            {/* Section spacing: preset chips */}
            <div className="flex items-center justify-between mt-3 mb-1.5">
              <span className="text-[11px] font-medium text-surface-600">内容间距</span>
              <span className="text-[11px] font-medium text-surface-500">
                {spacingTierDescription(spacingTier)}
              </span>
            </div>
            <div className="flex gap-1 flex-wrap">
              {spacings.map((preset) => (
                <button
                  key={preset.key}
                  onClick={() => updateField('meta.section_spacing', preset.key)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all duration-150 ${
                    spacingKey === preset.key
                      ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/25'
                      : 'bg-surface-100 text-surface-500 hover:bg-surface-200 hover:text-surface-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <p className="text-[10px] text-surface-400 mt-2.5 leading-relaxed">
              页边距控制页面四周留白；内容间距控制各板块（如教育背景、工作经历）之间的紧凑程度。
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
