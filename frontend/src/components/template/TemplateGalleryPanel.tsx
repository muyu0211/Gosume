import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Eye, Trash2, Loader2, Heart, Download, Star } from 'lucide-react'
import { useTemplateStore } from '../../stores/templateStore'
import { useT } from '../../lib/i18n'
import { Tooltip } from '../ui/Tooltip'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Pagination } from '../ui/Pagination'
import { listTemplateCategories } from '../../services/templateService'
import { resolvePaper } from '../../lib/paper'
import { HOME_CARD_GRID } from '../../lib/homeCards'
import type { TemplateMeta, TemplateCategory } from '../../types/template'

interface Props {
  /** 模板 id → 已渲染的示例预览 HTML（由上层统一生成后传入）。 */
  previewHtmls: Record<string, string>
  /** 用该模板新建简历并进入编辑器。 */
  onNewResume: (templateId: string) => void
  /** 用示例数据预览该模板。 */
  onPreviewWithSample: (templateId: string) => void
  /** 删除模板（上层负责调服务并刷新列表）；返回的 Promise 用于按钮 loading 态。 */
  onDeleteTemplate: (id: string) => Promise<void>
  onToggleFavorite: (id: string, favorite: boolean) => void
  onShare: (id: string, name: string) => void
}

const PAGE_SIZE = 8

/**
 * 【简历模板】面板 —— 由 `routes/WelcomePage` 的模板区整段迁移而来，
 * 视觉与交互保持原样：分类/收藏筛选胶囊、4 列卡片网格、卡片 hover 浮层、分页。
 */
export function TemplateGalleryPanel({
  previewHtmls,
  onNewResume,
  onPreviewWithSample,
  onDeleteTemplate,
  onToggleFavorite,
  onShare,
}: Props) {
  const t = useT()
  const templates = useTemplateStore((s) => s.templates)

  const [currentPage, setCurrentPage] = useState(1)
  const [marketCategories, setMarketCategories] = useState<TemplateCategory[]>([])
  const [activeCategory, setActiveCategory] = useState('')
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [favLoadingId, setFavLoadingId] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const categoryOf = (tpl: TemplateMeta) => (tpl.category && tpl.category.trim()) || 'custom'

  // 按分类/收藏过滤后的模板列表（本地筛选，模板体量小无需后端分页）
  const marketTemplates = useMemo(
    () =>
      templates.filter((tpl) => {
        if (activeCategory && categoryOf(tpl) !== activeCategory) return false
        if (favoriteOnly && !tpl.is_favorite) return false
        return true
      }),
    [templates, activeCategory, favoriteOnly],
  )

  const totalPages = Math.max(1, Math.ceil(marketTemplates.length / PAGE_SIZE))
  const paginatedTemplates = marketTemplates.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [marketTemplates.length])

  // 分类列表（失败静默，非 Wails 场景可忽略）
  useEffect(() => {
    listTemplateCategories()
      .then(setMarketCategories)
      .catch(() => { /* 忽略 */ })
  }, [])

  const handleSelectCategory = (category: string) => {
    setActiveCategory(category)
    setFavoriteOnly(false)
    setCurrentPage(1)
  }

  const handleToggleFavorite = async (id: string, favorite: boolean) => {
    setFavLoadingId(id)
    try {
      await onToggleFavorite(id, favorite)
    } finally {
      setFavLoadingId(null)
    }
  }

  const handleShare = async (id: string, name: string) => {
    setExportingId(id)
    try {
      await onShare(id, name)
    } finally {
      setExportingId(null)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    const { id } = deleteTarget
    setDeletingTemplateId(id)
    try {
      await onDeleteTemplate(id)
    } finally {
      setDeletingTemplateId(null)
      setDeleteTarget(null)
    }
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-5">
        <h2 className="text-sm font-semibold text-surface-400 uppercase tracking-wider">
          {t('chooseTemplateToStart')}
        </h2>
        <div className="flex-1 h-px bg-surface-200" />
      </div>
      {/* 分类筛选 / 收藏（模板市场能力整合到主页） */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <FilterChip
          active={!activeCategory && !favoriteOnly}
          onClick={() => {
            setActiveCategory('')
            setFavoriteOnly(false)
            setCurrentPage(1)
          }}
        >
          {t('all')}
        </FilterChip>
        {marketCategories.map((cat) => (
          <FilterChip
            key={cat.name}
            active={activeCategory === cat.name && !favoriteOnly}
            onClick={() => handleSelectCategory(cat.name)}
          >
            {cat.name === 'custom' ? t('uncategorized') : cat.name}
          </FilterChip>
        ))}
        <div className="flex-1" />
        <FilterChip
          active={favoriteOnly}
          onClick={() => {
            setFavoriteOnly(!favoriteOnly)
            setCurrentPage(1)
          }}
        >
          <Star className="size-icon-sm" />
          {t('myFavorites')}
        </FilterChip>
      </div>
      {paginatedTemplates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-surface-300">
          <Star className="size-ctl-lg mb-2" />
          <p className="text-sm">{t('noTemplateInCategory')}</p>
        </div>
      ) : (
        <div className={HOME_CARD_GRID} key={currentPage}>
          {paginatedTemplates.map((tmpl, i) => (
            <TemplateCard
              key={tmpl.id}
              template={tmpl}
              previewHtml={previewHtmls[tmpl.id]}
              onSelect={() => onNewResume(tmpl.id)}
              onPreview={() => onPreviewWithSample(tmpl.id)}
              onDelete={
                !tmpl.is_builtin ? () => setDeleteTarget({ id: tmpl.id, name: tmpl.name }) : undefined
              }
              isDeleting={deletingTemplateId === tmpl.id}
              favorite={!!tmpl.is_favorite}
              favLoading={favLoadingId === tmpl.id}
              sharing={exportingId === tmpl.id}
              onToggleFavorite={() => handleToggleFavorite(tmpl.id, !tmpl.is_favorite)}
              onShare={() => handleShare(tmpl.id, tmpl.name)}
              index={i}
            />
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('deleteTemplate')}
        description={t('deleteTemplateConfirm').replace('{name}', deleteTarget?.name || '')}
        confirmText={t('delete')}
        danger
        loading={!!deletingTemplateId}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  )
}

/** 分类筛选胶囊（模板市场能力整合到主页）。 */
function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`glass glass-chip w-24 h-ctl-sm flex items-center justify-center gap-1.5 px-3 text-xs font-medium leading-none transition-colors ${
        active ? 'glass-chip-on' : ''
      }`}
    >
      {children}
    </button>
  )
}

function TemplateCard({ template, previewHtml, onSelect, onPreview, onDelete, isDeleting = false, favorite = false, favLoading = false, sharing = false, onToggleFavorite, onShare, index = 0 }: {
  template: TemplateMeta
  previewHtml?: string
  onSelect: () => void
  onPreview: () => void
  onDelete?: () => void
  isDeleting?: boolean
  favorite?: boolean
  favLoading?: boolean
  sharing?: boolean
  onToggleFavorite?: () => void
  onShare?: () => void
  index?: number
}) {
  const t = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.16)
  const [isHovered, setIsHovered] = useState(false)
  const paper = useMemo(
    () => resolvePaper(template.paper_size, template.orientations?.[0]),
    [template.paper_size, template.orientations],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      if (w > 0) setScale(w / paper.pxW)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [paper.pxW])

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="glass glass-card hover-lift group cursor-pointer overflow-hidden animate-card-enter flex flex-col"
      style={{ animationDelay: `${index * 60}ms`, containerType: 'inline-size' }}
    >
      {/* Preview area */}
      <div ref={containerRef} className="relative overflow-hidden bg-surface-100" style={{ aspectRatio: `${paper.mmW} / ${paper.mmH}` }}>
        {previewHtml ? (
          <iframe
            srcDoc={previewHtml}
            className="absolute border-0 pointer-events-none"
            style={{
              width: paper.pxW,
              height: paper.pxH,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            title={template.name}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-surface-200 border-t-surface-400 animate-spin" />
          </div>
        )}

        {/* 收藏星标（点击独立于卡片选中；置于左上角，避免被右侧 hover 面板遮挡） */}
        {onToggleFavorite && (
          <Tooltip label={favorite ? t('unfavorite') : t('favorite')} className="absolute top-2.5 left-2.5">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
              disabled={favLoading}
              className={`size-ctl-md rounded-full flex items-center justify-center shadow-md transition-all ${favorite ? 'bg-warning-400 text-white hover:bg-warning-500' : 'bg-elev/90 text-surface-400 hover:text-warning-500 hover:shadow-lg'
                } disabled:opacity-60`}
            >
              {favLoading ? <Loader2 className="size-icon-md animate-spin" /> : <Heart className={`size-icon-md ${favorite ? 'fill-current' : ''}`} />}
            </button>
          </Tooltip>
        )}

        {/* Hover blur overlay + preview button — slides in from right */}
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-center transition-transform duration-300 ease-out"
          style={{
            // 宽度自适应内容（≥1/3 卡片宽），避免英文按钮文本比面板宽导致溢出露边；
            // translateX(100%) 按自身宽度移动，内容不超出时即可完全移出卡片。
            width: 'max-content',
            minWidth: '33.333%',
            maxWidth: '75%',
            transform: isHovered ? 'translateX(0)' : 'translateX(100%)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Gaussian blur backdrop（背景色取自主题 --elev：浅色白色磨砂，深色自动变深） */}
          <div
            className="absolute inset-0"
            style={{
              backdropFilter: 'blur(12px) saturate(1.2)',
              WebkitBackdropFilter: 'blur(12px) saturate(1.2)',
              background: 'rgb(var(--elev) / 0.25)',
            }}
          />
          {/* Preview + delete buttons on top of blur */}
          <div className="relative z-10 flex flex-col items-center gap-2 px-4">
            <button
              onClick={(e) => { e.stopPropagation(); onPreview() }}
              className="preview-btn glass flex items-center justify-center gap-2 px-4 py-2 max-w-full min-w-[112px] rounded-full text-surface-800 text-sm font-medium active:scale-95 transition-all duration-150 disabled:opacity-50"
            >
              <Eye className="size-icon-md shrink-0" />
              <span className="preview-label truncate min-w-0">{t('preview')}</span>
            </button>
            {onShare && (
              <button
                onClick={(e) => { e.stopPropagation(); onShare() }}
                disabled={sharing}
                className="preview-btn glass flex items-center justify-center gap-2 px-4 py-2 max-w-full min-w-[112px] rounded-full text-primary-600 text-sm font-medium hover:text-primary-700 active:scale-95 transition-all duration-150 disabled:opacity-50"
              >
                {sharing ? <Loader2 className="size-icon-md animate-spin" /> : <Download className="size-icon-md shrink-0" />}
                <span className="preview-label truncate min-w-0">{t('export')}</span>
              </button>
            )}
            {!template.is_builtin && onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                disabled={isDeleting}
                className="preview-btn glass flex items-center justify-center gap-2 px-4 py-2 max-w-full min-w-[112px] rounded-full text-danger-600 text-sm font-medium hover:text-danger-700 active:scale-95 transition-all duration-150 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="size-icon-md animate-spin" /> : <Trash2 className="size-icon-md shrink-0" />}
                <span className="preview-label truncate min-w-0">{t('delete')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
      {/* Meta info：玻璃叠层（半透明 + 高光描边，模糊由外层卡片的玻璃承担）。
          flex-1 拉伸填满卡片剩余高度（网格等高拉伸时单行描述卡也占满，不露底部空条），
          标签 mt-auto 固定贴底 —— 单行/多行描述的卡片标签高度一致。
          结构与 ResumeCard 信息区严格对齐：标题 1 行 + 副文案固定 2 行高（h-8）+
          底部胶囊行，保证两种卡片的整体高度完全一致。 */}
      <div className="glass-plate p-4 flex-1 flex flex-col">
        <h3 className="text-sm font-semibold text-surface-800 truncate">{template.name}</h3>
        <p className="text-xs text-surface-400 mt-0.5 h-8 line-clamp-2">{template.description}</p>
        <div className="flex flex-nowrap gap-1.5 mt-auto pt-2 overflow-hidden">
          {template.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="px-2 py-0.5 text-[10px] rounded-full bg-surface-100 text-surface-500 font-medium shrink-0 whitespace-nowrap">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
