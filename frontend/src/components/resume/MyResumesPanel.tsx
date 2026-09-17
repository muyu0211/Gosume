import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, Download, Trash2, Inbox } from 'lucide-react'
import { useTemplateStore } from '../../stores/templateStore'
import { useT } from '../../lib/i18n'
import { ResumeCard } from './ResumeCard'
import { BatchExportDialog } from './BatchExportDialog'
import { Pagination } from '../ui/Pagination'
import { CustomSelect } from '../ui/CustomSelect'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useResumePreviews } from '../../hooks/useResumePreviews'
import { useResumeBatch } from '../../hooks/useResumeBatch'
import { HOME_CARD_GRID } from '../../lib/homeCards'
import type { ResumeListItem } from '../../types/resume'
import type { TemplateMeta } from '../../types/template'

type SortKey = 'updated' | 'name'

const PAGE_SIZE = 12

interface Props {
  /** 全部简历（来自 resumeStore.resumeList）。 */
  resumes: ResumeListItem[]
  /** 首次列表加载中：显示骨架屏，避免空态闪现。 */
  loading?: boolean
  /** 打开某份简历进入编辑器。 */
  onOpen: (id: string) => void
  /** 新建简历（用当前模板）。 */
  onNewResume: () => void
  /** 空态引导：切到【简历模板】Tab。 */
  onGotoTemplates: () => void
}

/**
 * 【我的简历】面板 —— 首页一级简历区。
 *
 * 卡片预览复用简历渲染链路（`renderResumeHtml` + `injectGlobalVarsCss`），
 * 与编辑器预览、导出同源；卡片壳与 hover 浮层复用模板卡片的配方，保持视觉一致。
 */
export function MyResumesPanel({
  resumes,
  loading = false,
  onOpen,
  onNewResume,
  onGotoTemplates,
}: Props) {
  const t = useT()
  const templates = useTemplateStore((s) => s.templates)

  const [keyword, setKeyword] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('updated')
  const [currentPage, setCurrentPage] = useState(1)

  /** 模板 id → 元数据（取模板名与纸张规格）。 */
  const templateMap = useMemo(() => {
    const map = new Map<string, TemplateMeta>()
    for (const tpl of templates) map.set(tpl.id, tpl)
    return map
  }, [templates])

  // 搜索 + 排序（本地过滤，简历体量小无需后端分页）
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    const list = kw
      ? resumes.filter((r) => (r.name || '').toLowerCase().includes(kw))
      : [...resumes]
    list.sort((a, b) =>
      sortKey === 'name'
        ? (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN')
        : new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
    return list
  }, [resumes, keyword, sortKey])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  )

  // 翻页越界（如删除后总数减少）时回退到最后一页
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const { previews, failed, observeRef } = useResumePreviews(paged)
  const batch = useResumeBatch(filtered)

  const targetItem = batch.confirmDeleteId
    ? resumes.find((r) => r.id === batch.confirmDeleteId)
    : null

  return (
    <section>
      {/* 工具条 */}
      <div className="flex items-center gap-2 mb-5 mt-4 flex-wrap">
        <div className="relative w-56">
          <Search className="size-icon-md text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value)
              setCurrentPage(1)
            }}
            placeholder={t('searchResumes')}
            aria-label={t('searchResumes')}
            // 圆角与右侧排序下拉（CustomSelect 触发器）、工具条按钮/胶囊一致走
            // 控件档胶囊 --radius-full（= h/2），同高度（h-ctl-lg）下圆角逐像素对齐
            className="w-full h-ctl-lg pl-10 pr-3 rounded-full bg-surface-600/[0.06] text-sm text-surface-700 placeholder:text-surface-400 focus:outline-none"
          />
        </div>
        <CustomSelect
          value={sortKey}
          onChange={(v) => {
            setSortKey(v as SortKey)
            setCurrentPage(1)
          }}
          options={[
            { value: 'updated', label: t('sortUpdatedDesc') },
            { value: 'name', label: t('sortNameAsc') },
          ]}
          className="w-40"
          triggerClassName="!h-ctl-lg"
        />
        <div className="flex-1" />
        {filtered.length > 0 && (
          <button
            onClick={batch.toggleAll}
            className="glass glass-chip h-ctl-lg px-3 text-xs font-medium whitespace-nowrap !text-primary-700 hover:!text-primary-900 transition-colors"
          >
            {batch.allSelected ? t('deselectAll') : t('selectAll')}
          </button>
        )}
        <button onClick={onNewResume} className="btn-primary btn-sm h-ctl-lg">
          <Plus className="size-icon-md shrink-0" />
          <span className="truncate">{t('newResumeAction')}</span>
        </button>
      </div>

      {/* 批量操作条（选中时浮出，与抽屉同一配方）。
          max-h 需容纳「条 50px + mb-5 间距 20px」：原 max-h-14(56px) 会把底部
          间距裁到只剩 6px，条到网格的距离与工具条的 mb-5 不一致。 */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${
          batch.count > 0 ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        {/* 圆角走胶囊 --radius-full（= h/2），与上方工具条控件（搜索框 / 排序下拉 /
            按钮）及条内按钮同一圆角语言；条高固定（btn-sm 28 + py-2×2 = 44px），
            可用 h/2 而非容器档的 --radius-glass-card。 */}
        <div className="flex items-center justify-between px-4 py-2 mb-5 rounded-full bg-primary-50 border border-primary-100">
          <span className="text-xs text-primary-600">
            {t('selectedNPieces').replace('{count}', String(batch.count))}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={batch.askExport} className="btn btn-primary btn-sm">
              <Download className="size-icon-sm" />
              {t('batchExport')}
            </button>
            <button onClick={batch.askBatchDelete} className="btn btn-danger btn-sm">
              <Trash2 className="size-icon-sm" />
              {t('batchDelete')}
            </button>
          </div>
        </div>
      </div>

      {/* 网格 / 骨架 / 空态 */}
      {loading && resumes.length === 0 ? (
        <div className={HOME_CARD_GRID}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="glass glass-card overflow-hidden flex flex-col">
              <div
                className="bg-surface-100 animate-shimmer"
                style={{ aspectRatio: '210 / 297' }}
              />
              <div className="glass-plate p-4">
                <div className="h-4 w-2/3 rounded-full bg-surface-100 animate-shimmer" />
                <div className="h-3 w-1/2 rounded-full bg-surface-100 animate-shimmer mt-2" />
              </div>
            </div>
          ))}
        </div>
      ) : resumes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-surface-300">
          <Inbox className="size-ctl-lg mb-2" />
          <p className="text-sm">{t('noSavedResumes')}</p>
          <p className="text-xs mt-1">{t('savedResumesWillShow')}</p>
          <button onClick={onGotoTemplates} className="btn-primary btn-sm mt-4">
            {t('goSelectTemplate')}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-surface-300">
          <Search className="size-ctl-lg mb-2" />
          <p className="text-sm">{t('noMatchResumes')}</p>
        </div>
      ) : (
        <>
          <div className={HOME_CARD_GRID}>
            {paged.map((item, i) => {
              const tpl = templateMap.get(item.template_id)
              return (
                <ResumeCard
                  key={item.id}
                  item={item}
                  previewHtml={previews[item.id]}
                  failed={!!failed[item.id]}
                  paperSize={tpl?.paper_size}
                  orientation={tpl?.orientations?.[0]}
                  templateName={tpl?.name}
                  selected={batch.isSelected(item.id)}
                  onOpen={() => onOpen(item.id)}
                  onToggleSelect={() => batch.toggle(item.id)}
                  onDelete={() => batch.askDelete(item.id)}
                  observeRef={observeRef(item.id)}
                  index={i}
                />
              )
            })}
          </div>
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          )}
        </>
      )}

      {/* 删除确认（单份 / 批量）与批量导出 —— 统一基于 Modal 规范 */}
      <ConfirmDialog
        open={!!batch.confirmDeleteId}
        title={t('deleteConfirmTitle')}
        description={`${t('deleteConfirmPrefix')}「${targetItem?.name || t('resumeTitlePlaceholder')}」${t('deleteConfirmSuffix')}`}
        confirmText={t('deleteConfirmTitle')}
        danger
        loading={!!batch.deletingId}
        onConfirm={batch.confirmDelete}
        onCancel={batch.cancelDelete}
      />

      <ConfirmDialog
        open={batch.batchConfirmOpen}
        title={t('batchDeleteConfirmTitle')}
        description={t('batchDeleteConfirm').replace('{count}', String(batch.count))}
        confirmText={t('deleteNPieces').replace('{count}', String(batch.count))}
        danger
        loading={batch.batchDeleting}
        onConfirm={batch.confirmBatchDelete}
        onCancel={batch.cancelBatchDelete}
      />

      {batch.exportOpen && (
        <BatchExportDialog
          count={batch.count}
          format={batch.exportFormat}
          onFormatChange={batch.setExportFormat}
          scale={batch.exportScale}
          onScaleChange={batch.setExportScale}
          progress={batch.exportProgress}
          exporting={batch.exporting}
          done={batch.exportDone}
          canceled={batch.exportCanceled}
          onCancel={batch.cancelExport}
          onConfirm={batch.runExport}
        />
      )}
    </section>
  )
}
