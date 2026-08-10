import { useState, useRef, useEffect, useCallback } from 'react'
import { useResumeStore } from '../../stores/resumeStore'
import {
  MARGIN_PRESETS,
  getMarginPresetIndex,
  DEFAULT_MARGIN_KEY,
} from '../../lib/marginPresets'
import { SlidersHorizontal, ChevronDown } from 'lucide-react'

/**
 * Toolbar popover that exposes the page-margin preset slider.
 *
 * Layout:
 *   [ icon | "紧凑/较窄/标准/较宽/宽松" | chevron ]   ← trigger button
 *   ┌──────────────────────────────────┐
 *   │ header                           │
 *   │ range slider                     │
 *   │ preset chips                     │
 *   │ detail                           │
 *   └──────────────────────────────────┘
 *
 * Outside-click and Escape close the popover.
 */
export function MarginPopover() {
  const resume = useResumeStore((s) => s.resume)
  const updateField = useResumeStore((s) => s.updateField)

  const currentKey = resume?.meta?.page_margin || DEFAULT_MARGIN_KEY
  const currentIndex = getMarginPresetIndex(currentKey)
  const currentPreset = MARGIN_PRESETS[currentIndex]

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
        title="页边距"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span className="max-w-[64px] truncate tabular-nums">{currentPreset.label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {visible && (
        <div
          className={`absolute right-0 top-full mt-1 w-72 bg-white rounded-lg border border-surface-200 shadow-lg z-50 will-change-transform ${
            open ? 'animate-dropdown-enter' : 'animate-dropdown-exit pointer-events-none'
          }`}
        >
          <div className="px-3 pt-3 pb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-surface-400 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3 h-3" />
                页边距档位
              </span>
              <span className="text-[11px] font-medium text-surface-500">
                {currentPreset.label}
              </span>
            </div>

            {/* Range slider */}
            <input
              type="range"
              min={0}
              max={MARGIN_PRESETS.length - 1}
              step={1}
              value={currentIndex}
              onChange={(e) => {
                const idx = parseInt(e.target.value, 10)
                updateField('meta.page_margin', MARGIN_PRESETS[idx].key)
              }}
              className="w-full margin-range-slider"
            />

            {/* Preset chips */}
            <div className="flex gap-1 mt-2.5 flex-wrap">
              {MARGIN_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  onClick={() => updateField('meta.page_margin', preset.key)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all duration-150 ${
                    currentKey === preset.key
                      ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/25'
                      : 'bg-surface-100 text-surface-500 hover:bg-surface-200 hover:text-surface-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Detail */}
            <div className="mt-3 px-2.5 py-2 rounded-md bg-surface-50 border border-surface-100">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-surface-500">上下 / 左右</span>
                <span className="text-[11px] font-mono text-surface-700">
                  {currentPreset.description}
                </span>
              </div>
            </div>

            <p className="text-[10px] text-surface-400 mt-2 leading-relaxed">
              边距越小，单页可容纳内容越多；边距越大，视觉留白更舒适。
            </p>
          </div>
        </div>
      )}
    </div>
  )
}