import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  showPresent?: boolean
  minValue?: string
  disabled?: boolean
}

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

export function MonthPicker({ value, onChange, placeholder = '选择日期', showPresent = false, minValue, disabled = false }: Props) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => {
    if (value && /^\d{4}-\d{2}$/.test(value)) return parseInt(value.slice(0, 4))
    return new Date().getFullYear()
  })
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const isMonthDisabled = (month: number, year: number) => {
    if (!minValue) return false
    const minYear = parseInt(minValue.slice(0, 4))
    const minMonth = parseInt(minValue.slice(5, 7))
    return year < minYear || (year === minYear && month < minMonth)
  }

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !popoverRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const popoverHeight = popoverRef.current.offsetHeight
    const viewportHeight = window.innerHeight
    const spaceBelow = viewportHeight - rect.bottom
    const spaceAbove = rect.top

    // Flip to above if not enough space below (need ~280px for the popover)
    const showBelow = spaceBelow >= 270 || spaceBelow > spaceAbove

    setPopoverStyle({
      position: 'fixed',
      zIndex: 9999,
      width: '256px',
      top: showBelow ? rect.bottom + 4 : rect.top - popoverHeight - 4,
      left: Math.min(rect.left, window.innerWidth - 272),
    })
  }, [])

  useEffect(() => {
    if (open) {
      updatePosition()
      window.addEventListener('scroll', updatePosition, true)
      window.addEventListener('resize', updatePosition)
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, updatePosition])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const selectMonth = useCallback((month: number) => {
    const formatted = `${viewYear}-${String(month).padStart(2, '0')}`
    onChange(formatted)
    setOpen(false)
  }, [viewYear, onChange])

  const selectPresent = useCallback(() => {
    onChange('至今')
    setOpen(false)
  }, [onChange])

  const clearDate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setOpen(false)
  }, [onChange])

  const prevYear = () => setViewYear((y) => y - 1)
  const nextYear = () => setViewYear((y) => y + 1)

  const selectedMonth = value && /^\d{4}-\d{2}$/.test(value) ? parseInt(value.slice(5, 7)) : -1
  const selectedYear = value && /^\d{4}-\d{2}$/.test(value) ? parseInt(value.slice(0, 4)) : -1

  const popover = open && (
    <div
      ref={popoverRef}
      style={popoverStyle}
      className="bg-elev rounded-lg border border-surface-200 shadow-lg p-3"
    >
      {/* Year navigation */}
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={prevYear} className="p-1 hover:bg-surface-100 rounded">
          <ChevronLeft className="w-4 h-4 text-surface-500" />
        </button>
        <span className="text-sm font-semibold text-surface-700">{viewYear}年</span>
        <button type="button" onClick={nextYear} className="p-1 hover:bg-surface-100 rounded">
          <ChevronRight className="w-4 h-4 text-surface-500" />
        </button>
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-4 gap-1.5 mb-2">
        {MONTHS.map((label, i) => {
          const month = i + 1
          const isSelected = month === selectedMonth && viewYear === selectedYear
          const disabled = isMonthDisabled(month, viewYear)
          return (
            <button
              key={month}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && selectMonth(month)}
              className={`py-1.5 text-xs rounded-md transition-colors ${
                disabled
                  ? 'text-surface-300 cursor-not-allowed'
                  : isSelected
                    ? 'bg-primary-500 text-white font-semibold'
                    : 'text-surface-600 hover:bg-surface-100'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t border-surface-100 pt-2">
        {showPresent && (
          <button
            type="button"
            onClick={selectPresent}
            className={`flex-1 py-1 text-xs rounded ${
              value === '至今' ? 'bg-primary-500 text-white' : 'text-surface-500 hover:bg-surface-100'
            }`}
          >
            至今
          </button>
        )}
        <button
          type="button"
          onClick={clearDate}
          className="flex-1 py-1 text-xs text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded"
        >
          清除
        </button>
      </div>
    </div>
  )

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          if (value && /^\d{4}-\d{2}$/.test(value)) setViewYear(parseInt(value.slice(0, 4)))
          setOpen(!open)
        }}
        className={`form-input flex items-center gap-2 text-left ${!value ? 'text-surface-400' : ''} ${disabled ? 'opacity-50 cursor-not-allowed bg-surface-100' : ''}`}
      >
        <Calendar className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
        <span className="flex-1 truncate">{value === '至今' ? '至今' : value || placeholder}</span>
        {value && (
          <button type="button" onClick={clearDate} className="flex-shrink-0 opacity-40 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </button>

      {open && createPortal(popover, document.body)}
    </>
  )
}
