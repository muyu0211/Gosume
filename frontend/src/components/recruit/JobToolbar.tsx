import { Plus, Search, Settings2, X } from 'lucide-react'
import type { JobView } from '../../types/recruit'
import { useT } from '../../lib/i18n'
import { LiquidSegmented } from '../ui/LiquidSegmented'
import { Tooltip } from '../ui/Tooltip'

interface Props {
  view: JobView
  onView: (v: JobView) => void
  keyword: string
  onKeyword: (v: string) => void
  onAdd: () => void
  onOpenSettings?: () => void
}

/**
 * 列表/时间轴/日历 切换 + 搜索 + 新增。
 *
 * 视图切换**不重置筛选**（PRD §4.2）：筛选条件在 store 里，切视图只改 `view`。
 */
export function JobToolbar({ view, onView, keyword, onKeyword, onAdd, onOpenSettings }: Props) {
  const t = useT()

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <LiquidSegmented<JobView>
        value={view}
        onChange={onView}
        ariaLabel={t('recruitTitle')}
        items={[
          { value: 'list', label: t('viewList') },
          { value: 'timeline', label: t('viewTimeline') },
          { value: 'calendar', label: t('viewCalendar') },
        ]}
      />

      <div className="relative flex-1 min-w-[160px] max-w-[280px]">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 size-icon-md text-surface-400 pointer-events-none"
          strokeWidth={1.75}
        />
        <input
          type="text"
          value={keyword}
          onChange={(e) => onKeyword(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          // 圆角走控件档胶囊 --radius-full（= h/2）：与同行左侧 LiquidSegmented 胶囊、
          // 下方 CustomSelect 触发器、以及首页搜索框（MyResumesPanel）逐像素对齐。
          // 默认 / hover / focus 三态都只换描边与 focus 环，圆角恒定，不随状态变化。
          className="w-full h-ctl-lg pl-8 pr-8 rounded-full bg-elev text-sm text-surface-800 placeholder:text-surface-400 border border-hairline border-surface-200 transition-colors duration-fast hover:border-surface-300 focus:outline-none focus:border-primary-500 focus:shadow-focus"
        />
        {keyword && (
          <button
            type="button"
            onClick={() => onKeyword('')}
            aria-label={t('clearFilters')}
            className="absolute right-2 top-1/2 -translate-y-1/2 size-icon-md flex items-center justify-center rounded-sm text-surface-400 hover:text-surface-600 transition-colors duration-fast"
          >
            <X className="size-icon-sm" strokeWidth={2} />
          </button>
        )}
      </div>

      <div className="flex-1" />

      {onOpenSettings && (
        <Tooltip label={t('settings')}>
          <button
            type="button"
            onClick={onOpenSettings}
            className="size-ctl-lg rounded-md flex items-center justify-center text-surface-500 hover:text-surface-700 hover:bg-surface-600/8 active:scale-[0.98] transition-colors duration-fast"
          >
            <Settings2 className="size-icon-md" strokeWidth={1.75} />
          </button>
        </Tooltip>
      )}

      <button type="button" onClick={onAdd} className="btn btn-primary h-ctl-lg">
        <Plus className="size-icon-md" strokeWidth={2.25} />
        <span className="text-sm">{t('jobAdd')}</span>
      </button>
    </div>
  )
}
