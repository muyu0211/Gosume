import { useEffect, useMemo } from 'react'
import { CalendarClock, ChevronRight } from 'lucide-react'
import { useT } from '../../lib/i18n'
import { useRecruitStore } from '../../stores/recruitStore'
import { useAppStore } from '../../stores/appStore'
import { summaryCounts } from '../../lib/recruit/stats'

/**
 * 首页【求职进程】卡片（Q15：简历卡片区上方独立一行）。
 *
 * 计数与【求职进程】Tab 摘要条**同源**——共用 `stats.summaryCounts` 与同一个
 * store，保证两处数字永远一致（AC-32）。
 *
 * 点击只切首页 Tab（`setHomeTab('jobs')`）**不做路由跳转**：求职进程是首页
 * 子视图，没有独立路由，刷新后统一停在【我的简历】。
 */
export function JobSummaryCard() {
  const t = useT()
  const setHomeTab = useAppStore((s) => s.setHomeTab)
  const jobs = useRecruitStore((s) => s.jobs)
  const now = useRecruitStore((s) => s.now)
  const settings = useRecruitStore((s) => s.settings)
  const ensureLoaded = useRecruitStore((s) => s.ensureLoaded)

  useEffect(() => {
    ensureLoaded()
  }, [ensureLoaded])

  const counts = useMemo(
    () => summaryCounts(jobs, now, settings.nearThresholdHours),
    [jobs, now, settings.nearThresholdHours],
  )

  const items: Array<{ label: string; n: number; cls: string }> = [
    { label: t('summaryToday'), n: counts.today, cls: 'text-warning-700' },
    { label: t('summaryNear'), n: counts.near, cls: 'text-warning-600' },
    { label: t('summaryOverdue'), n: counts.overdue, cls: 'text-danger-600' },
  ]

  return (
    <button
      type="button"
      onClick={() => setHomeTab('jobs')}
      className="glass glass-card rounded-lg px-4 py-3 w-full flex items-center gap-3 text-left transition-shadow duration-fast hover:shadow-md active:scale-[0.998]"
    >
      <CalendarClock className="size-icon-lg text-primary-600 shrink-0" strokeWidth={1.75} />
      <span className="text-sm font-medium text-surface-800 shrink-0">{t('recruitTitle')}</span>
      <span className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
        {items.map((it) => (
          <span key={it.label} className="text-xs text-surface-500 shrink-0">
            {it.label}
            <span className={`ml-1 font-medium tabular-nums ${it.cls}`}>{it.n}</span>
          </span>
        ))}
      </span>
      <ChevronRight className="size-icon-md text-surface-400 shrink-0" strokeWidth={2} />
    </button>
  )
}
