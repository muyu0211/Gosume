import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatedPage } from '../components/ui/AnimatedPage'
import { Modal, type ModalHandle } from '../components/ui/Modal'
import { useTemplateStore } from '../stores/templateStore'
import { extractErrorMessage } from '../lib/errorUtils'
import {
  getCommunityInfo,
  listCommunityTemplates,
  downloadCommunityTemplate,
  publishCommunityTemplate,
  rateCommunityTemplate,
} from '../services/communityService'
import {
  ArrowLeft,
  Star,
  Download,
  Upload,
  Search,
  RefreshCw,
  Globe,
  Loader2,
  CheckCircle2,
  User,
  WifiOff,
} from 'lucide-react'
import type { CommunityTemplate } from '../types/community'

const PAGE_SIZE = 12

function formatDownloadCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function CommunityPage() {
  const navigate = useNavigate()
  const localTemplates = useTemplateStore((s) => s.templates)

  const [items, setItems] = useState<CommunityTemplate[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [categories, setCategories] = useState<string[]>([])
  const [activeCategory, setActiveCategory] = useState('')
  const [keyword, setKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [configured, setConfigured] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // 详情 / 发布弹窗
  const [detail, setDetail] = useState<CommunityTemplate | null>(null)
  const [detailScore, setDetailScore] = useState(0)
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishTemplateId, setPublishTemplateId] = useState('')
  const [publishing, setPublishing] = useState(false)

  // 操作状态
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [ratingId, setRatingId] = useState<string | null>(null)

  const load = useCallback(async (category: string, keywordArg: string, pageArg: number) => {
    setLoading(true)
    setError('')
    try {
      const resp = await listCommunityTemplates({ category, keyword: keywordArg, page: pageArg, pageSize: PAGE_SIZE })
      if (!resp) {
        setConfigured(false)
        setItems([])
        setTotal(0)
        return
      }
      setConfigured(true)
      setItems(resp.items)
      setTotal(resp.total)
      setCategories((prev) => [...new Set([...prev, ...resp.items.map((i) => i.category).filter(Boolean)])])
    } catch (err) {
      setError(extractErrorMessage(err, '访问模板社区失败，请检查网络后重试'))
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  const refresh = useCallback(() => {
    setPage(1)
    load(activeCategory, keyword, 1)
  }, [activeCategory, keyword, load])

  // 首次进入：确认社区是否已配置，再拉取列表
  useEffect(() => {
    getCommunityInfo()
      .then((info) => {
        if (info && !info.configured) setConfigured(false)
      })
      .catch(() => { /* 忽略，列表请求会给出具体错误 */ })
    load('', '', 1)
  }, [])

  const handleSearch = () => {
    setKeyword(searchInput.trim())
    setPage(1)
    load(activeCategory, searchInput.trim(), 1)
  }

  const handleSelectCategory = (category: string) => {
    setActiveCategory(category)
    setPage(1)
    load(category, keyword, 1)
  }

  const handleOpenDetail = (tmpl: CommunityTemplate) => {
    setDetail(tmpl)
    setDetailScore(0)
  }

  const handleDownload = async (tmpl: CommunityTemplate) => {
    setDownloadingId(tmpl.id)
    setError('')
    setSuccessMsg('')
    try {
      const result = await downloadCommunityTemplate(tmpl.id)
      if (result) {
        setSuccessMsg(`已下载并安装「${result.name}」，现在离线也能使用`)
        setItems((prev) => prev.map((t) => (t.id === tmpl.id ? { ...t, is_installed: true } : t)))
        setDetail((prev) => (prev && prev.id === tmpl.id ? { ...prev, is_installed: true } : prev))
      }
    } catch (err) {
      console.error('Download community template failed:', err)
      setError(extractErrorMessage(err, '模板下载失败'))
    } finally {
      setDownloadingId(null)
    }
  }

  const handleRate = async (score: number) => {
    if (!detail || ratingId) return
    setRatingId(detail.id)
    setError('')
    try {
      await rateCommunityTemplate(detail.id, score)
      // 本地近似更新展示值
      const newCount = detail.rating_count + 1
      const newRating = (detail.rating * detail.rating_count + score) / newCount
      setDetail({ ...detail, rating: newRating, rating_count: newCount })
      setSuccessMsg(`已提交 ${score} 星评分`)
    } catch (err) {
      setError(extractErrorMessage(err, '评分提交失败'))
    } finally {
      setRatingId(null)
    }
  }

  const handlePublish = async () => {
    if (!publishTemplateId || publishing) return
    setPublishing(true)
    setError('')
    setSuccessMsg('')
    try {
      const result = await publishCommunityTemplate(publishTemplateId)
      if (result) {
        setSuccessMsg(`模板已发布到社区（ID: ${result.id}）`)
        setPublishOpen(false)
        refresh()
      }
    } catch (err) {
      console.error('Publish template failed:', err)
      setError(extractErrorMessage(err, '发布到社区失败'))
    } finally {
      setPublishing(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <AnimatedPage className="h-full flex flex-col bg-surface-50">
      {/* Header */}
      <header className="flex items-center gap-3 px-8 py-5 border-b border-surface-100 bg-elev/70 backdrop-blur-sm">
        <button onClick={() => navigate('/')} className="flex items-center gap-1.5 btn-ghost btn-sm" title="返回首页">
          <ArrowLeft className="w-4 h-4" />
          首页
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary-600/10 flex items-center justify-center">
            <Globe className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-surface-800 leading-tight">模板社区</h1>
            <p className="text-[12px] text-surface-400">在线模板市场 · 需联网访问，下载后可离线使用</p>
          </div>
        </div>

        {/* 搜索 */}
        <div className="flex-1 flex justify-center px-6">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-300" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="搜索模板名称 / 标签"
              className="w-full h-9 pl-9 pr-20 rounded-lg border border-surface-200 bg-elev text-sm text-surface-700 placeholder:text-surface-300 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-shadow"
            />
            <button
              onClick={handleSearch}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 h-7 rounded-md text-xs font-medium text-primary-700 hover:bg-primary-50 transition-colors"
            >
              搜索
            </button>
          </div>
        </div>

        <button onClick={refresh} className="btn-ghost btn-sm" title="刷新列表">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
        <button onClick={() => { setPublishOpen(true); setPublishTemplateId(localTemplates[0]?.id ?? '') }} className="btn-primary btn-sm">
          <Upload className="w-4 h-4" />
          发布模板
        </button>
      </header>

      {/* 提示条 */}
      {error && (
        <div className="mx-8 mt-4 px-4 py-2.5 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 flex-shrink-0" />
            {error}
          </span>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-700 text-xs font-medium flex-shrink-0">
            关闭
          </button>
        </div>
      )}
      {successMsg && (
        <div className="mx-8 mt-4 px-4 py-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-700 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 truncate">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            {successMsg}
          </span>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-500 hover:text-emerald-700 text-xs font-medium flex-shrink-0">
            关闭
          </button>
        </div>
      )}

      {/* 主内容 */}
      <main className="flex-1 overflow-auto px-8 py-5 mr-1">
        {!configured ? (
          <div className="flex flex-col items-center justify-center py-24 text-surface-300">
            <Globe className="w-10 h-10 mb-3" />
            <p className="text-sm text-surface-500">模板社区暂不可用</p>
            <p className="text-xs mt-1">请确认已联网且社区服务已配置后重试</p>
            <button onClick={refresh} className="mt-4 btn-secondary btn-sm">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              重新尝试
            </button>
          </div>
        ) : (
          <>
            {/* 分类筛选 */}
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              <FilterChip active={!activeCategory} onClick={() => handleSelectCategory('')}>
                全部
              </FilterChip>
              {categories.map((cat) => (
                <FilterChip key={cat} active={activeCategory === cat} onClick={() => handleSelectCategory(cat)}>
                  {cat}
                </FilterChip>
              ))}
            </div>

            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-6 h-6 animate-spin text-surface-300" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-surface-300">
                <Search className="w-10 h-10 mb-3" />
                <p className="text-sm">没有找到符合条件的模板</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 xl:grid-cols-4 gap-5">
                {items.map((tmpl, i) => (
                  <CommunityCard
                    key={tmpl.id}
                    template={tmpl}
                    downloading={downloadingId === tmpl.id}
                    index={i}
                    onOpen={() => handleOpenDetail(tmpl)}
                    onDownload={() => handleDownload(tmpl)}
                  />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            )}
          </>
        )}
      </main>

      {/* 详情弹窗 */}
      {detail && (
        <DetailModal
          template={detail}
          ratingId={ratingId}
          detailScore={detailScore}
          downloading={downloadingId === detail.id}
          onSelectScore={setDetailScore}
          onRate={handleRate}
          onDownload={() => handleDownload(detail)}
          onClose={() => setDetail(null)}
        />
      )}

      {/* 发布弹窗 */}
      {publishOpen && (
        <PublishModal
          templates={localTemplates}
          selectedId={publishTemplateId}
          publishing={publishing}
          onSelect={setPublishTemplateId}
          onPublish={handlePublish}
          onClose={() => setPublishOpen(false)}
        />
      )}
    </AnimatedPage>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-primary-50 text-primary-700 border-primary-200' : 'text-surface-500 border-surface-200 hover:border-surface-300 hover:text-surface-700'
        }`}
    >
      {children}
    </button>
  )
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
        const p = totalPages <= 7 ? i + 1 : (page <= 4 ? i + 1 : (totalPages - 6 + i))
        return (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${p === page ? 'bg-primary-600 text-white shadow-sm' : 'text-surface-500 hover:text-surface-700 hover:bg-surface-100'}`}
          >
            {p}
          </button>
        )
      })}
    </div>
  )
}

function CommunityCard({ template, downloading, index, onOpen, onDownload }: {
  template: CommunityTemplate
  downloading: boolean
  index: number
  onOpen: () => void
  onDownload: () => void
}) {
  const color = template.colors?.primary || '#64748B'
  const [imgFailed, setImgFailed] = useState(false)

  return (
    <div
      onClick={onOpen}
      className="group cursor-pointer rounded-xl border border-surface-200 bg-elev overflow-hidden hover:shadow-md hover:border-primary-300 transition-all duration-200 hover:-translate-y-0.5 animate-card-enter"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* 缩略图 */}
      <div className="relative aspect-[210/297] bg-surface-100 overflow-hidden">
        {template.thumbnail_url && !imgFailed ? (
          <img
            src={template.thumbnail_url}
            alt={template.name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: `${color}22` }}>
            <div className="w-10 h-14 rounded border border-white/70 shadow-sm flex items-center justify-center" style={{ backgroundColor: color }}>
              <span className="text-white text-xs font-bold">{template.name.charAt(0)}</span>
            </div>
          </div>
        )}
        {/* 已安装徽标 */}
        {template.is_installed && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/90 text-white text-[10px] font-medium shadow-sm">
            <CheckCircle2 className="w-3 h-3" />
            已安装
          </span>
        )}
        {/* 色点 */}
        <div className="absolute bottom-2.5 left-2.5 flex gap-1">
          <span className="w-2.5 h-2.5 rounded-full border border-white/60" style={{ backgroundColor: template.colors?.primary }} title="主色" />
          <span className="w-2.5 h-2.5 rounded-full border border-white/60" style={{ backgroundColor: template.colors?.accent }} title="强调色" />
        </div>
      </div>
      {/* 信息 */}
      <div className="p-3.5">
        <h3 className="text-sm font-semibold text-surface-800 truncate">{template.name}</h3>
        <p className="text-xs text-surface-400 mt-0.5 line-clamp-1">{template.description}</p>
        <div className="flex items-center gap-3 mt-2.5 text-[12px] text-surface-400">
          <span className="flex items-center gap-1">
            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
            {template.rating > 0 ? template.rating.toFixed(1) : '暂无'}
          </span>
          <span className="flex items-center gap-1">
            <Download className="w-3 h-3" />
            {formatDownloadCount(template.download_count)}
          </span>
          <span className="flex-1" />
          {!template.is_installed && (
            <button
              onClick={(e) => { e.stopPropagation(); onDownload() }}
              disabled={downloading}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary-600 text-white text-[12px] font-medium hover:bg-primary-700 active:scale-95 transition-all disabled:opacity-50"
            >
              {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              下载
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailModal({ template, ratingId, detailScore, downloading, onSelectScore, onRate, onDownload, onClose }: {
  template: CommunityTemplate
  ratingId: string | null
  detailScore: number
  downloading: boolean
  onSelectScore: (n: number) => void
  onRate: (score: number) => void
  onDownload: () => void
  onClose: () => void
}) {
  const modalRef = useRef<ModalHandle>(null)
  const color = template.colors?.primary || '#64748B'

  return (
    <Modal ref={modalRef} onClose={onClose} width="w-[560px]" cardClassName="flex flex-col overflow-hidden">
      <div className="flex gap-5 px-6 py-5 border-b border-surface-100 flex-shrink-0">
        {/* 缩略图 */}
        <div className="w-32 flex-shrink-0">
          <div className="relative aspect-[210/297] rounded-lg bg-surface-100 overflow-hidden border border-surface-100">
            {template.thumbnail_url ? (
              <img src={template.thumbnail_url} alt={template.name} className="w-full h-full object-cover object-top" />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: `${color}22` }}>
                <div className="w-8 h-11 rounded border border-white/70" style={{ backgroundColor: color }} />
              </div>
            )}
          </div>
        </div>
        {/* 基本信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-surface-800 truncate">{template.name}</h2>
            {template.is_installed && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-medium flex-shrink-0">
                <CheckCircle2 className="w-3 h-3" />
                已安装
              </span>
            )}
          </div>
          <p className="flex items-center gap-1 text-xs text-surface-400 mt-1">
            <User className="w-3 h-3" />
            {template.published_by_name || template.author?.name || '社区用户'}
            <span className="mx-1 text-surface-200">|</span>
            v{template.version}
          </p>
          {/* 评分与下载量 */}
          <div className="flex items-center gap-4 mt-3">
            <StarRating value={template.rating} size="w-4 h-4" />
            <span className="text-sm text-surface-600">{template.rating > 0 ? template.rating.toFixed(1) : '暂无'}</span>
            <span className="text-xs text-surface-400">({template.rating_count} 人评分)</span>
            <span className="flex items-center gap-1 text-xs text-surface-400">
              <Download className="w-3.5 h-3.5" />
              {template.download_count.toLocaleString()} 次下载
            </span>
          </div>
          {/* 标签 */}
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {template.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="px-2 py-0.5 text-[10px] rounded-full bg-surface-100 text-surface-500">{tag}</span>
            ))}
            <span className="px-2 py-0.5 text-[10px] rounded-full bg-primary-50 text-primary-600">{template.category}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">模板说明</h3>
        <p className="text-sm text-surface-600 leading-relaxed whitespace-pre-wrap">{template.description || '暂无说明'}</p>

        {/* 评分区 */}
        <div className="mt-5 pt-4 border-t border-surface-100">
          <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">为模板评分</h3>
          <div className="flex items-center gap-4">
            <StarRating value={detailScore} interactive onSelect={onSelectScore} size="w-6 h-6" />
            <button
              onClick={() => detailScore > 0 && onRate(detailScore)}
              disabled={detailScore === 0 || !!ratingId}
              className="btn-secondary btn-sm disabled:opacity-50"
            >
              {ratingId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              提交评分
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 px-6 py-4 border-t border-surface-100 flex-shrink-0">
        <div className="flex-1" />
        <button
          onClick={onDownload}
          disabled={downloading || template.is_installed}
          className={`btn-sm ${template.is_installed ? 'btn-ghost pointer-events-none opacity-60' : 'btn-primary'}`}
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {template.is_installed ? '已安装到本地' : '下载并安装'}
        </button>
      </div>
    </Modal>
  )
}

function StarRating({ value, interactive = false, onSelect, size = 'w-4 h-4' }: {
  value: number
  interactive?: boolean
  onSelect?: (score: number) => void
  size?: string
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          disabled={!interactive}
          onClick={() => onSelect?.(n)}
          className={`${size} ${interactive ? 'cursor-pointer hover:scale-125 transition-transform' : 'cursor-default'}`}
          aria-label={`${n} 星`}
        >
          <Star className={`${n <= value ? 'text-amber-400 fill-amber-400' : 'text-surface-300'}`} />
        </button>
      ))}
    </div>
  )
}

function PublishModal({ templates, selectedId, publishing, onSelect, onPublish, onClose }: {
  templates: Array<{ id: string; name: string }>
  selectedId: string
  publishing: boolean
  onSelect: (id: string) => void
  onPublish: () => void
  onClose: () => void
}) {
  const modalRef = useRef<ModalHandle>(null)

  return (
    <Modal ref={modalRef} onClose={onClose} width="w-[480px]">
      <div className="flex items-center gap-2.5 px-6 py-3 border-b border-surface-100">
        <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
          <Upload className="w-4 h-4 text-primary-600" />
        </div>
        <span className="text-base font-semibold text-surface-700">发布模板到社区</span>
      </div>
      <div className="px-6 py-5">
        <p className="text-xs text-surface-400 mb-3">
          选择要发布到模板社区的本地模板，社区其他用户即可下载使用。
        </p>
        {templates.length === 0 ? (
          <p className="text-sm text-surface-500 py-4 text-center">暂无可发布的本地模板</p>
        ) : (
          <select
            value={selectedId}
            onChange={(e) => onSelect(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-surface-200 bg-elev text-sm text-surface-700 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center gap-3 px-6 py-4 border-t border-surface-100 justify-end">
        <button onClick={onClose} className="btn-ghost btn-sm">取消</button>
        <button
          onClick={onPublish}
          disabled={!selectedId || publishing || templates.length === 0}
          className="btn-primary btn-sm disabled:opacity-50"
        >
          {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          发布
        </button>
      </div>
    </Modal>
  )
}