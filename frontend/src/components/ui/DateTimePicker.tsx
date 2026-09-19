import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useT } from '../../lib/i18n'
import { useAppStore } from '../../stores/appStore'

interface Props {
  /** 日期 `YYYY-MM-DD`；空串表示未选。 */
  date: string
  /** 时刻 `HH:mm`；`allDay` 时忽略。 */
  time: string
  /** 日期变化。 */
  onDateChange: (date: string) => void
  /** 时刻变化。 */
  onTimeChange: (time: string) => void
  /** 全天：隐藏时刻选择，面板内显示提示。 */
  allDay?: boolean
  placeholder?: string
  disabled?: boolean
  /** 追加到触发按钮的类名（宽窄由调用方控制，如 flex-1）。 */
  className?: string
}

const PANEL_WIDTH = 268
const VIEWPORT_MARGIN = 8
/** 面板展开方向自适应估算高度（日期网格 + 时刻区 + 底部操作）。 */
const PANEL_EST_HEIGHT = 340

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** 本地今日 `YYYY-MM-DD`（不用 toISOString，避免时区偏移跨日）。 */
function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 解析 `YYYY-MM-DD`；非法返回 null。 */
function parseDay(s: string): { y: number; m: number; d: number } | null {
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!t) return null
  const y = Number(t[1])
  const m = Number(t[2])
  const d = Number(t[3])
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null
  return { y, m, d }
}

/** 某年某月的天数。 */
function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate()
}

/** 星期首列索引：0=周日。 */
function firstWeekday(y: number, m: number): number {
  return new Date(y, m - 1, 1).getDay()
}

/**
 * 日期 + 时刻选择器（求职进程模块使用）。
 *
 * 与 `MonthPicker` 同族、同一套交互与外层观感：
 * - 触发器直接用 `.form-input` 类（与全项目输入框同语言、同圆角胶囊）；
 * - 面板通过 `createPortal` 挂到 `document.body` 并以 `fixed` 定位 ——
 *   不会被模态的 `overflow`/祖先 `transform` 裁剪或错位；
 * - 空间不足自动向上翻转、横向回推到视口内；
 * - 外部点击 / Escape / 滚动 / 窗口尺寸变化时关闭或重新贴合。
 *
 * 与 `MonthPicker` 的差别：本组件是**日粒度 + 当日时刻**，所以
 * 面板 = 年/月导航 + 7 列星期表头 + 月内日期网格 + 时刻区 + 底部操作。
 * ⚠ 不要合并（合并后任一方的粒度语义都会变模糊），两者是并列的两个组件。
 *
 * ⚠ 时刻用「时」「分」两个列选择（原生 `<select>` 风格的自绘列），
 * 而不是 `<input type="time">` —— 后者在各内核下外观不一致，
 * 且无法与玻璃风面板统一。
 */
export function DateTimePicker({
  date,
  time,
  onDateChange,
  onTimeChange,
  allDay = false,
  placeholder,
  disabled = false,
  className = '',
}: Props) {
  const t = useT()
  const lang = useAppStore((s) => s.language)
  const placeholderText = placeholder ?? t('dateTimePlaceholder')

  const WEEKDAYS =
    lang === 'en-US'
      ? ['S', 'M', 'T', 'W', 'T', 'F', 'S']
      : ['日', '一', '二', '三', '四', '五', '六']

  const parsed = useMemo(() => parseDay(date), [date])

  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => parsed?.y ?? new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => parsed?.m ?? new Date().getMonth() + 1)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const updatePosition = useCallback(() => {
    const btn = triggerRef.current
    const panel = panelRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const panelHeight = panel?.offsetHeight || PANEL_EST_HEIGHT
    const viewportHeight = window.innerHeight
    const spaceBelow = viewportHeight - rect.bottom
    const spaceAbove = rect.top
    const showBelow = spaceBelow >= panelHeight + 12 || spaceBelow > spaceAbove

    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN)
    setPanelStyle({
      position: 'fixed',
      zIndex: 9999,
      width: `${PANEL_WIDTH}px`,
      top: showBelow ? rect.bottom + 4 : Math.max(VIEWPORT_MARGIN, rect.top - panelHeight - 4),
      left: Math.min(Math.max(VIEWPORT_MARGIN, rect.left), maxLeft),
    })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePosition()
    // 面板自身挂载完成后高度才准，再贴一次
    const raf = requestAnimationFrame(updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, updatePosition])

  // 外部点击 / Escape 关闭
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const openPanel = useCallback(() => {
    setOpen((v) => {
      if (!v) {
        // 每次打开都把视图对齐到当前值（无值则回到本月）
        const p = parseDay(date)
        const now = new Date()
        setViewYear(p?.y ?? now.getFullYear())
        setViewMonth(p?.m ?? now.getMonth() + 1)
      }
      return !v
    })
  }, [date])

  const prevMonth = () => {
    setViewMonth((m) => {
      if (m === 1) {
        setViewYear((y) => y - 1)
        return 12
      }
      return m - 1
    })
  }
  const nextMonth = () => {
    setViewMonth((m) => {
      if (m === 12) {
        setViewYear((y) => y + 1)
        return 1
      }
      return m + 1
    })
  }

  const pickDay = useCallback(
    (d: number) => {
      onDateChange(`${viewYear}-${pad2(viewMonth)}-${pad2(d)}`)
    },
    [viewYear, viewMonth, onDateChange],
  )

  const clear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDateChange('')
      onTimeChange('')
      setOpen(false)
    },
    [onDateChange, onTimeChange],
  )

  const pickToday = useCallback(() => {
    const now = new Date()
    setViewYear(now.getFullYear())
    setViewMonth(now.getMonth() + 1)
    onDateChange(todayKey())
  }, [onDateChange])

  // —— 日历网格：前置空位 + 当月的天 ——
  const cells = useMemo(() => {
    const lead = firstWeekday(viewYear, viewMonth)
    const total = daysInMonth(viewYear, viewMonth)
    const arr: (number | null)[] = []
    for (let i = 0; i < lead; i++) arr.push(null)
    for (let d = 1; d <= total; d++) arr.push(d)
    // 补齐到整行（7 的倍数），避免最后一行高度塌陷
    while (arr.length % 7 !== 0) arr.push(null)
    return arr
  }, [viewYear, viewMonth])

  const today = todayKey()
  const isSelectedDay = (d: number) =>
    parsed != null && parsed.y === viewYear && parsed.m === viewMonth && parsed.d === d

  const [hh, mm] = /^\d{2}:\d{2}$/.test(time) ? time.split(':') : ['', '']

  const panel = open && (
    <div ref={panelRef} style={panelStyle} className="glass glass-card p-3">
      {/* 年 / 月导航 */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={prevMonth}
          aria-label={t('prevMonth')}
          className="p-1 rounded hover:bg-surface-100"
        >
          <ChevronLeft className="size-icon-md text-surface-500" />
        </button>
        <span className="text-sm font-semibold text-surface-700">
          {viewYear}
          {t('yearSuffix')} {viewMonth}
          {t('monthSuffix')}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          aria-label={t('nextMonth')}
          className="p-1 rounded hover:bg-surface-100"
        >
          <ChevronRight className="size-icon-md text-surface-500" />
        </button>
      </div>

      {/* 星期表头 */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="py-1 text-center text-xs text-surface-400 select-none">
            {w}
          </span>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d == null) return <span key={i} />
          const selected = isSelectedDay(d)
          const isToday = today === `${viewYear}-${pad2(viewMonth)}-${pad2(d)}`
          return (
            <button
              key={i}
              type="button"
              onClick={() => pickDay(d)}
              className={`py-1.5 text-xs rounded-md transition-colors ${
                selected
                  ? 'bg-primary-500 text-white font-semibold'
                  : isToday
                    ? 'text-primary-600 font-medium hover:bg-surface-100'
                    : 'text-surface-600 hover:bg-surface-100'
              }`}
            >
              {d}
            </button>
          )
        })}
      </div>

      {/* 时刻区 */}
      <div className="mt-2 border-t border-surface-100 pt-2">
        {allDay ? (
          <p className="px-1 py-1 text-xs text-surface-400">{t('allDayNoTime')}</p>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-surface-500 shrink-0">{t('fieldTime')}</span>
            <select
              value={hh}
              onChange={(e) => onTimeChange(`${e.target.value || '00'}:${mm || '00'}`)}
              aria-label={t('fieldTime')}
              className="flex-1 min-w-0 rounded-md border border-surface-200 bg-elev px-2 py-1 text-xs text-surface-700 focus:outline-none focus:border-primary-500 focus:shadow-focus"
            >
              {Array.from({ length: 24 }, (_, h) => {
                const v = pad2(h)
                return (
                  <option key={v} value={v}>
                    {v}
                  </option>
                )
              })}
            </select>
            <span className="text-xs text-surface-400">:</span>
            <select
              value={mm}
              onChange={(e) => onTimeChange(`${hh || '00'}:${e.target.value || '00'}`)}
              aria-label={t('fieldTime')}
              className="flex-1 min-w-0 rounded-md border border-surface-200 bg-elev px-2 py-1 text-xs text-surface-700 focus:outline-none focus:border-primary-500 focus:shadow-focus"
            >
              {Array.from({ length: 60 }, (_, i) => {
                const v = pad2(i)
                return (
                  <option key={v} value={v}>
                    {v}
                  </option>
                )
              })}
            </select>
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="mt-2 flex gap-2 border-t border-surface-100 pt-2">
        <button
          type="button"
          onClick={pickToday}
          className={`flex-1 py-1 text-xs rounded transition-colors ${
            date === today ? 'bg-primary-500 text-white' : 'text-surface-500 hover:bg-surface-100'
          }`}
        >
          {t('summaryToday')}
        </button>
        <button
          type="button"
          onClick={clear}
          className="flex-1 py-1 text-xs text-surface-400 rounded transition-colors hover:text-surface-600 hover:bg-surface-100"
        >
          {t('clear')}
        </button>
      </div>
    </div>
  )

  // 触发器展示：日期 [+ 时刻]，全天只出日期
  const display = parsed
    ? allDay || !time
      ? `${date}`
      : `${date} ${time}`
    : ''

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          openPanel()
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`form-input flex items-center gap-2 text-left ${className} ${
          !display ? 'text-surface-400' : ''
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-surface-100' : ''}`}
      >
        <Calendar className="size-icon-sm flex-shrink-0 opacity-50" />
        <span className="flex-1 min-w-0 truncate">{display || placeholderText}</span>
        {display && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            onClick={clear}
            className="flex-shrink-0 opacity-40 hover:opacity-100"
          >
            <X className="size-icon-sm" />
          </span>
        )}
      </button>

      {open && createPortal(panel, document.body)}
    </>
  )
}
