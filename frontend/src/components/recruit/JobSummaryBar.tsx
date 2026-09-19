import { CalendarClock, AlertTriangle, Clock3, Timer } from 'lucide-react'
import type { Urgency } from '../../types/recruit'
import type { SummaryCounts } from '../../lib/recruit/stats'
import { useT } from '../../lib/i18n'
import { urgencyMeta } from '../../lib/recruit/urgency'

interface Props {
  counts: SummaryCounts
  /** 当前生效的告警快捷筛选（null = 未筛选） */
  active: Urgency | null
  onPick: (u: Urgency) => void
}

/**
 * 顶部摘要条：今日 / 临近 / 已过期 / 时间待定 四类计数，点击即筛选。
 *
 * 计数与首页【求职进程】卡片**同源**（共用 `stats.summaryCounts`），
 * 保证两处数字永远一致（AC-32）。
 *
 * 无障碍：颜色之外必须同时有文字标签与图标，不能只靠色点表达状态。
 */
export function JobSummaryBar({ counts, active, onPick }: Props) {
  const t = useT()
  const items: Array<{ key: Urgency; n: number; icon: typeof Timer }> = [
    { key: 'today', n: counts.today, icon: CalendarClock },
    { key: 'near', n: counts.near, icon: Timer },
    { key: 'overdue', n: counts.overdue, icon: AlertTriangle },
    { key: 'unknown', n: counts.unknown, icon: Clock3 },
  ]

  return (
    <div className="glass glass-card rounded-lg px-4 py-3 flex items-center gap-2 flex-wrap">
      {items.map(({ key, n, icon: Icon }) => {
        const meta = urgencyMeta(key)
        const selected = active === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onPick(key)}
            aria-pressed={selected}
            // 圆角走控件档胶囊 --radius-full（= h/2），与本页其余交互控件
            // （LiquidSegmented / CustomSelect 触发器 / .btn）统一；
            // 选中与未选中只换底色与文字色，圆角恒定，切换时不跳形。
            // 三态：默认 = 无底透明；hover = 灰底；选中 = 语义色底；focus-visible = --shadow-focus 环。
            className={`flex items-center gap-1.5 h-ctl-md px-3 rounded-full transition-colors duration-fast focus:outline-none focus-visible:shadow-focus ${
              selected
                ? `${meta.chipClass} ${meta.textClass}`
                : 'text-surface-500 hover:bg-surface-600/6 hover:text-surface-700'
            }`}
          >
            <Icon className="size-icon-sm shrink-0" strokeWidth={1.75} />
            <span className="text-sm truncate">{t(meta.labelKey)}</span>
            <span className="text-sm font-medium tabular-nums">{n}</span>
          </button>
        )
      })}
    </div>
  )
}
