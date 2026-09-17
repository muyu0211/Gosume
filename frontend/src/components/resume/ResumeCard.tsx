import { useState } from 'react'
import { Trash2, Eye, CheckSquare, Square } from 'lucide-react'
import { ResumePagePreview } from './ResumePagePreview'
import { Tooltip } from '../ui/Tooltip'
import { useT } from '../../lib/i18n'
import { useAppStore } from '../../stores/appStore'
import type { ResumeListItem } from '../../types/resume'

interface Props {
  item: ResumeListItem
  /** 已渲染的简历预览 HTML（为空时显示加载/失败占位）。 */
  previewHtml?: string
  /** 单份渲染失败：预览区降级，卡片仍可点击打开。 */
  failed?: boolean
  /** 纸张规格，取自简历所用模板。 */
  paperSize?: string
  orientation?: string
  /** 多选中。 */
  selected?: boolean
  /** 简历所用模板名（用于卡片信息区）。 */
  templateName?: string
  onOpen: () => void
  onToggleSelect: () => void
  onDelete: () => void
  /** 进入视口观察用的 ref callback（由 useResumePreviews 提供）。 */
  observeRef?: (el: HTMLDivElement | null) => void
  index?: number
}

/**
 * 简历卡片（首页【我的简历】网格）。
 *
 * 视觉与交互对齐模板卡片 `TemplateCard`：同一套玻璃卡片壳、同一套 hover
 * 毛玻璃浮层（右侧滑入）、同样的入场动画；差异只在信息区字段与复选/删除操作。
 */
export function ResumeCard({
  item,
  previewHtml,
  failed = false,
  paperSize,
  orientation,
  selected = false,
  templateName,
  onOpen,
  onToggleSelect,
  onDelete,
  observeRef,
  index = 0,
}: Props) {
  const t = useT()
  const lang = useAppStore((s) => s.language)
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      ref={observeRef}
      onClick={onOpen}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="glass glass-card hover-lift group cursor-pointer overflow-hidden animate-card-enter flex flex-col"
      style={{ animationDelay: `${index * 60}ms`, containerType: 'inline-size' }}
    >
      <div className="relative overflow-hidden">
        <ResumePagePreview
          html={previewHtml}
          paperSize={paperSize}
          orientation={orientation}
          failed={failed}
        />

        {/* 多选复选框（点击独立于卡片打开；置于左上角，避免被右侧 hover 面板遮挡） */}
        <Tooltip label={selected ? t('deselectItem') : t('selectItem')} className="absolute top-2.5 left-2.5">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleSelect()
            }}
            aria-label={selected ? t('deselectItem') : t('selectItem')}
            className={`size-ctl-md rounded-full flex items-center justify-center shadow-md transition-colors ${
              selected
                ? 'bg-primary-600 text-white'
                : `bg-elev/90 text-surface-400 hover:text-primary-600 ${
                    isHovered ? 'opacity-100' : 'opacity-0'
                  }`
            }`}
          >
            {selected ? <CheckSquare className="size-icon-md" /> : <Square className="size-icon-md" />}
          </button>
        </Tooltip>

        {/* Hover blur overlay + 操作按钮 — slides in from right（与模板卡片同一配方） */}
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-center transition-transform duration-300 ease-out"
          style={{
            width: 'max-content',
            minWidth: '33.333%',
            maxWidth: '75%',
            transform: isHovered ? 'translateX(0)' : 'translateX(100%)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="absolute inset-0"
            style={{
              backdropFilter: 'blur(12px) saturate(1.2)',
              WebkitBackdropFilter: 'blur(12px) saturate(1.2)',
              background: 'rgb(var(--elev) / 0.25)',
            }}
          />
          <div className="relative z-10 flex flex-col items-center gap-2 px-4">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpen()
              }}
              className="preview-btn glass flex items-center justify-center gap-2 px-4 py-2 max-w-full min-w-[112px] rounded-full text-surface-800 text-sm font-medium active:scale-95 transition-all duration-150"
            >
              <Eye className="size-icon-md shrink-0" />
              <span className="preview-label truncate min-w-0">{t('openResume')}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="preview-btn glass flex items-center justify-center gap-2 px-4 py-2 max-w-full min-w-[112px] rounded-full text-danger-600 text-sm font-medium hover:text-danger-700 active:scale-95 transition-all duration-150"
            >
              <Trash2 className="size-icon-md shrink-0" />
              <span className="preview-label truncate min-w-0">{t('delete')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 信息区：玻璃叠层，与模板卡片同一结构（mt-auto 固定贴底）。
          标题 1 行 + 副文案固定 2 行高（h-8）+ 底部胶囊行，与 TemplateCard 的
          信息区逐项对齐 —— 两种卡片的整体高度才能完全一致。 */}
      <div className="glass-plate p-4 flex-1 flex flex-col">
        <h3 className="text-sm font-semibold text-surface-800 truncate">
          {item.name || t('resumeTitlePlaceholder')}
        </h3>
        <p className="text-xs text-surface-400 mt-0.5 h-8 overflow-hidden">
          {new Date(item.updated_at).toLocaleString(lang === 'en-US' ? 'en-US' : 'zh-CN')}
        </p>
        <div className="flex flex-nowrap mt-auto pt-2 overflow-hidden">
          <span className="px-2 py-0.5 text-[10px] rounded-full bg-surface-100 text-surface-500 font-medium shrink-0 whitespace-nowrap max-w-full truncate">
            {templateName || t('resumeTemplateUnknown')}
          </span>
        </div>
      </div>
    </div>
  )
}
