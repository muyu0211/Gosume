import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTemplateStore } from '../stores/templateStore'
import { useResumeStore } from '../stores/resumeStore'
import { Clock, ArrowRight, Sparkles, Settings, List, Upload, FileUp, Loader2, ChevronLeft, ChevronRight, Eye, Trash2, CheckCircle2, Heart, Download, Star, PackageOpen, Globe, Moon, Palette, Sun } from 'lucide-react'
import { useThemeStore } from '../stores/themeStore'
import { nextExplicitTheme } from '../lib/theme'
import { ResumeListDrawer } from '../components/resume/ResumeListDrawer'
import { ImportPreviewDialog } from '../components/resume/ImportPreviewDialog'
import { AnimatedPage } from '../components/ui/AnimatedPage'
import { Tooltip } from '../components/ui/Tooltip'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Modal, type ModalHandle } from '../components/ui/Modal'
import { UpdateDialog, type UpdateInfo } from '../components/ui/UpdateDialog'
import { importTemplatePackage, loadTemplateMetas, loadTemplateContent, deleteTemplate, listTemplateCategories, setTemplateFavorite, listImportLogs, deleteImportLog, exportTemplatePackage } from '../services/templateService'
import { renderTemplate } from '../lib/templateEngine'
import { resolvePaper } from '../lib/paper'
import { extractErrorMessage } from '../lib/errorUtils'
import { createSampleResume } from '../services/sampleData'
import { callService, isWails } from '../services/backend'
import { generateAllThumbnails } from '../services/thumbnailService'
import type { TemplateMeta, TemplateCategory, ImportLog } from '../types/template'
import type { ResumeListItem } from '../types/resume'
import type { FileParseResult, FileImportResponse } from '../types/gosume_file'
import { migratePersonalSummary } from '../types/resume'

// 本次会话是否已做过启动更新检查（避免从编辑器返回首页时重复请求）
let updateCheckedThisSession = false
// 启动检查结果缓存：WelcomePage 路由切走会卸载、组件 state 随之丢失，
// 结果提升到模块级，返回首页时角标可直接恢复、保持常驻
let sessionUpdateInfo: UpdateInfo | null = null

export function WelcomePage() {
  const navigate = useNavigate()
  const [recentFiles, setRecentFiles] = useState<ResumeListItem[]>([])
  const [showDrawer, setShowDrawer] = useState(false)

  // 主题切换按钮：点击在三套显式主题间轮换（经典→麦色→深色→经典）。
  const appliedTheme = useThemeStore((s) => s.applied)
  const themeMode = useThemeStore((s) => s.mode)
  const ThemeIcon = appliedTheme === 'obsidian' ? Moon : appliedTheme === 'wheat' ? Palette : Sun
  const themeTitle = appliedTheme === 'obsidian' ? '当前：深色' : appliedTheme === 'wheat' ? '当前：麦色' : '当前：经典'
  const handleCycleTheme = () => {
    useThemeStore.getState().setMode(nextExplicitTheme(themeMode))
  }
  const [previewHtmls, setPreviewHtmls] = useState<Record<string, string>>({})
  const [importingTemplate, setImportingTemplate] = useState(false)
  const [importError, setImportError] = useState('')
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [importingGosume, setImportingGosume] = useState(false)
  const [importPreview, setImportPreview] = useState<FileParseResult | null>(null)
  const [importSuccess, setImportSuccess] = useState('')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(sessionUpdateInfo)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [marketCategories, setMarketCategories] = useState<TemplateCategory[]>([])
  const [activeCategory, setActiveCategory] = useState('')
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [favLoadingId, setFavLoadingId] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [importLogs, setImportLogs] = useState<ImportLog[]>([])
  const [showImportLogs, setShowImportLogs] = useState(false)
  const [deleteLogTarget, setDeleteLogTarget] = useState<ImportLog | null>(null)
  const [deletingLogId, setDeletingLogId] = useState<number | null>(null)
  const PAGE_SIZE = 8
  const templates = useTemplateStore((s) => s.templates)
  const setTemplates = useTemplateStore((s) => s.setTemplates)
  const setActiveTemplate = useTemplateStore((s) => s.setActiveTemplate)
  const setThumbnails = useTemplateStore((s) => s.setThumbnails)
  const newResume = useResumeStore((s) => s.newResume)
  const loadResume = useResumeStore((s) => s.loadResume)
  const setResumeList = useResumeStore((s) => s.setResumeList)
  const setResume = useResumeStore((s) => s.setResume)
  const clearResume = useResumeStore((s) => s.clearResume)
  const categoryOf = (t: TemplateMeta) => (t.category && t.category.trim()) || 'custom'

  // 按分类/收藏过滤后的模板列表（本地筛选，模板体量小无需后端分页）
  const marketTemplates = useMemo(
    () => templates.filter((t) => {
      if (activeCategory && categoryOf(t) !== activeCategory) return false
      if (favoriteOnly && !t.is_favorite) return false
      return true
    }),
    [templates, activeCategory, favoriteOnly],
  )

  const totalPages = Math.max(1, Math.ceil(marketTemplates.length / PAGE_SIZE))
  const paginatedTemplates = marketTemplates.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )

  // 分类数量汇总（含未分类）
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of templates) {
      const c = categoryOf(t)
      counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    return counts
  }, [templates])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [marketTemplates.length])

  useEffect(() => {
    loadData()
  }, [])

  // 应用启动时静默检查一次更新（复用 UpdateService.CheckUpdate）。
  // 失败静默——启动检查不打扰用户；有新版本时在 logo 上渲染 NEW 角标。
  useEffect(() => {
    if (updateCheckedThisSession) return
    updateCheckedThisSession = true
    callService<UpdateInfo | null>('UpdateService', 'CheckUpdate')
      .then((info) => {
        if (info?.has_update) {
          sessionUpdateInfo = info
          setUpdateInfo(info)
        }
      })
      .catch(() => { })
  }, [])

  const loadData = async () => {
    try {
      const metas = await loadTemplateMetas()
      setTemplates(metas)

      // 模板市场：同步分类列表（失败静默，非 Wails 场景可忽略）
      try {
        setMarketCategories(await listTemplateCategories())
      } catch { /* 忽略 */ }

      const previews: Record<string, string> = {}
      for (const meta of metas) {
        try {
          const tmpl = await loadTemplateContent(meta.id)
          const sampleResume = createSampleResume(meta.id)
          // Prevent scrollbars in the fixed-size iframe without affecting the
          // template's CSS layout. The card's paper aspect-ratio + overflow-hidden
          // naturally clips to the first page, matching the EditorPage rendering.
          const html = renderTemplate(tmpl, sampleResume)
            .replace('<head>', '<head><style>html{overflow:hidden}</style>')
          previews[meta.id] = html
        } catch {
          previews[meta.id] = ''
        }
      }
      setPreviewHtmls(previews)

      // Generate thumbnails in background (uses cache after first run)
      const ids = metas.map((m) => m.id)
      generateAllThumbnails(ids).then((thumbs) => setThumbnails(thumbs))
    } catch {
      // Fallback handled by loadTemplateMetas
    }

    try {
      const list = await callService<ResumeListItem[]>('ResumeService', 'ListResumes')
      if (list) {
        setResumeList(list)
        setRecentFiles(list)
      }
    } catch { /* empty list */ }
  }

  const handleNewResume = async (templateId: string) => {
    clearResume()
    setActiveTemplate(templateId)
    await newResume(templateId)
    navigate('/editor')
  }

  const handlePreviewWithSample = async (templateId: string) => {
    clearResume()
    setActiveTemplate(templateId)
    const sampleResume = createSampleResume(templateId)
    try {
      await callService('ResumeService', 'InitResume', sampleResume)
      setResume(sampleResume)
      navigate('/editor')
    } catch (err) {
      console.error('InitResume failed:', err)
      // 失败时仍进入编辑器（内存态可用），后续保存会重新创建记录
      setResume(sampleResume)
      navigate('/editor')
    }
  }

  const handleOpenRecent = async (id: string) => {
    clearResume()
    const resume = await loadResume(id)
    if (resume && resume.meta?.template_id) {
      setActiveTemplate(resume.meta.template_id)
    }
    navigate('/editor')
  }

  const handleOpenFromDrawer = async (id: string) => {
    setShowDrawer(false)
    clearResume()
    const resume = await loadResume(id)
    if (resume && resume.meta?.template_id) {
      setActiveTemplate(resume.meta.template_id)
    }
    navigate('/editor')
  }

  const handleImportTemplate = async () => {
    setImportingTemplate(true)
    setImportError('')
    try {
      const result = await importTemplatePackage()
      if (result) {
        setActiveTemplate(result.id)
        await loadData()
      }
    } catch (err) {
      console.error('Import template failed:', err)
      setImportError(extractErrorMessage(err, '模板导入失败，请检查模板包格式'))
    } finally {
      setImportingTemplate(false)
    }
  }

  // 中间态导入第一步：选择文件 → 后端解析校验 → 返回预览数据（未落库）
  const handleImportGosume = async () => {
    setImportingGosume(true)
    setImportSuccess('')
    try {
      const result = await callService<FileParseResult>('FileService', 'ParseFile')
      if (!result?.resume) return // 用户取消，静默关闭
      setImportPreview(result)
    } catch (err) {
      console.error('Parse gosume file failed:', err)
      setImportError(extractErrorMessage(err, '导入失败，请检查文件'))
    } finally {
      setImportingGosume(false)
    }
  }

  // 中间态导入第二步：预览确认后执行导入（新建/覆盖均进入编辑器）
  const handleImported = async (result: FileImportResponse, finalTemplateId: string) => {
    const resume = importPreview?.resume
    setImportPreview(null)

    if (result.mode === 'overwrite') {
      setImportSuccess('已覆盖导入')
      // 刷新简历列表（覆盖改变了 name/updated_at）
      try {
        const list = await callService<ResumeListItem[]>('ResumeService', 'ListResumes')
        if (list) {
          setResumeList(list)
          setRecentFiles(list)
        }
      } catch { /* 忽略，列表随下次加载刷新 */ }
      // 覆盖后直接进入编辑页继续编辑（与打开简历一致的加载流程）
      clearResume()
      const loaded = await loadResume(result.id)
      if (loaded && loaded.meta?.template_id) {
        setActiveTemplate(loaded.meta.template_id)
      }
      navigate('/editor')
      return
    }

    // 新建：用导入数据进入编辑器
    if (!resume) return
    clearResume()
    setActiveTemplate(finalTemplateId)
    // 兼容历史数据：早期顶层 summary 字段迁移到 personal_summary 结构
    setResume(migratePersonalSummary(resume))
    navigate('/editor')
  }

  const handleDeleteTemplate = (id: string, name: string) => {
    setDeleteTarget({ id, name })
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    const { id } = deleteTarget
    setDeletingTemplateId(id)
    setImportError('')
    try {
      await deleteTemplate(id)
      await loadData()
    } catch (err) {
      console.error('Delete template failed:', err)
      setImportError(extractErrorMessage(err, '模板删除失败'))
    } finally {
      setDeletingTemplateId(null)
      setDeleteTarget(null)
    }
  }

  // 收藏 / 取消收藏（写入后端并同步 store，卡片即时反映）
  const handleToggleFavorite = async (id: string, favorite: boolean) => {
    setFavLoadingId(id)
    setImportError('')
    try {
      if (isWails()) await setTemplateFavorite(id, favorite)
      setTemplates(templates.map((t) => (t.id === id ? { ...t, is_favorite: favorite } : t)))
    } catch (err) {
      console.error('Toggle favorite failed:', err)
      setImportError(extractErrorMessage(err, favorite ? '收藏失败' : '取消收藏失败'))
    } finally {
      setFavLoadingId(null)
    }
  }

  // 导出分享包（弹出原生保存对话框，成功返回文件路径）
  const handleExportTemplate = async (id: string, name: string) => {
    setExportingId(id)
    setImportError('')
    setImportSuccess('')
    try {
      const path = await exportTemplatePackage(id)
      if (path) setImportSuccess(`分享包已导出：${path}`)
    } catch (err) {
      console.error('Export template failed:', err)
      setImportError(extractErrorMessage(err, '导出分享包失败'))
    } finally {
      setExportingId(null)
    }
  }

  // 打开导入记录弹窗并拉取历史
  const handleOpenImportLogs = async () => {
    setShowImportLogs(true)
    try {
      setImportLogs(await listImportLogs())
    } catch (err) {
      console.error('Load import logs failed:', err)
    }
  }

  // 删除一条导入记录（仅删记录，不影响已安装模板）
  const handleDeleteLog = async () => {
    if (!deleteLogTarget) return
    setDeletingLogId(deleteLogTarget.id)
    setImportError('')
    try {
      await deleteImportLog(deleteLogTarget.id)
      setImportLogs((prev) => prev.filter((l) => l.id !== deleteLogTarget.id))
    } catch (err) {
      console.error('Delete import log failed:', err)
      setImportError(extractErrorMessage(err, '删除导入记录失败'))
    } finally {
      setDeletingLogId(null)
      setDeleteLogTarget(null)
    }
  }

  // 切换分类筛选（重置到第一页）
  const handleSelectCategory = (category: string) => {
    setActiveCategory(category)
    setFavoriteOnly(false)
    setCurrentPage(1)
  }

  return (
    <>
    <AnimatedPage className="h-full flex flex-col bg-surface-50">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center shadow-sm shadow-primary-600/25">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            {/* 新版本角标：启动检查到更新时渲染，点击弹出更新对话框（复用设置页 UpdateDialog） */}
            {updateInfo && (
              <button
                onClick={() => setShowUpdateDialog(true)}
                className="absolute -top-1.5 -right-2.5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold tracking-wider shadow-md shadow-red-500/30 animate-badge-pop hover:bg-red-600 active:scale-95 transition-colors"
                title={`发现新版本 v${updateInfo.latest_version}，点击查看`}
              >
                NEW
              </button>
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-800 tracking-tight">Gosume</h1>
            <p className="text-xs text-surface-400 mt-0.5">桌面级简历制作工具</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/community')}
            className="btn-primary btn-sm"
          >
            <Globe className="w-4 h-4" />
            模板社区
          </button>
          <button
            onClick={handleOpenImportLogs}
            className="btn-secondary btn-sm"
          >
            {importingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            导入记录
          </button>
          <button
            onClick={handleImportTemplate}
            disabled={importingTemplate}
            className="btn-secondary btn-sm"
          >
            {importingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            导入模板
          </button>
          <button
            onClick={handleImportGosume}
            disabled={importingGosume}
            className="btn-secondary btn-sm"
          >
            {importingGosume ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            导入简历
          </button>
          <button
            onClick={() => setShowDrawer(true)}
            className="btn-secondary btn-sm"
          >
            <List className="w-4 h-4" />
            全部简历
          </button>
          <Tooltip label={themeTitle}>
            <button
              onClick={handleCycleTheme}
              className="btn-ghost btn-sm w-9 h-9 p-0 justify-center focus:ring-0 focus:ring-offset-0"
            >
              <ThemeIcon className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip label="设置">
            <button
              onClick={() => navigate('/settings')}
              className="btn-ghost btn-sm"
            >
              <Settings className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
      </header>

      {importError && (
        <div className="mx-8 mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{importError}</span>
          <button onClick={() => setImportError('')} className="text-red-500 hover:text-red-700 text-xs font-medium">
            关闭
          </button>
        </div>
      )}

      {importSuccess && (
        <div className="mx-8 mb-4 px-4 py-3 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-700 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {importSuccess}
          </span>
          <button onClick={() => setImportSuccess('')} className="text-emerald-500 hover:text-emerald-700 text-xs font-medium">
            关闭
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto px-8 pb-8 mr-1">
        {/* Template Selection */}
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-5">
            <h2 className="text-sm font-semibold text-surface-400 uppercase tracking-wider">
              选择模板开始创建
            </h2>
            <div className="flex-1 h-px bg-surface-200" />
          </div>
          {/* 分类筛选 / 收藏（模板市场能力整合到主页） */}
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <FilterChip
              active={!activeCategory && !favoriteOnly}
              onClick={() => { setActiveCategory(''); setFavoriteOnly(false); setCurrentPage(1) }}
            >
              全部
            </FilterChip>
            {marketCategories.map((cat) => (
              <FilterChip
                key={cat.name}
                active={activeCategory === cat.name && !favoriteOnly}
                onClick={() => handleSelectCategory(cat.name)}
              >
                {cat.name === 'custom' ? '未分类' : cat.name}
                <span className="opacity-60">{categoryCounts.get(cat.name) ?? cat.count}</span>
              </FilterChip>
            ))}
            <div className="flex-1" />
            <FilterChip
              active={favoriteOnly}
              onClick={() => { setFavoriteOnly(!favoriteOnly); setCurrentPage(1) }}
            >
              <Star className="w-3.5 h-3.5" />
              我的收藏
              {templates.filter((t) => t.is_favorite).length > 0 && (
                <span className="opacity-60">{templates.filter((t) => t.is_favorite).length}</span>
              )}
            </FilterChip>
          </div>
          {paginatedTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-surface-300">
              <Star className="w-9 h-9 mb-2" />
              <p className="text-sm">当前分类下没有模板</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-5" key={currentPage}>
              {paginatedTemplates.map((tmpl, i) => (
                <TemplateCard
                  key={tmpl.id}
                  template={tmpl}
                  previewHtml={previewHtmls[tmpl.id]}
                  onSelect={() => handleNewResume(tmpl.id)}
                  onPreview={() => handlePreviewWithSample(tmpl.id)}
                  onDelete={!tmpl.is_builtin ? () => handleDeleteTemplate(tmpl.id, tmpl.name) : undefined}
                  isDeleting={deletingTemplateId === tmpl.id}
                  favorite={!!tmpl.is_favorite}
                  favLoading={favLoadingId === tmpl.id}
                  sharing={exportingId === tmpl.id}
                  onToggleFavorite={() => handleToggleFavorite(tmpl.id, !tmpl.is_favorite)}
                  onShare={() => handleExportTemplate(tmpl.id, tmpl.name)}
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
        </section>

        {/* Recent Files */}
        {recentFiles.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <h2 className="text-sm font-semibold text-surface-400 uppercase tracking-wider">
                最近打开
              </h2>
              <div className="flex-1 h-px bg-surface-200" />
            </div>
            <div className="space-y-1.5 max-w-lg">
              {recentFiles.slice(0, 3).map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3.5 px-4 py-3 rounded-xl bg-elev border border-surface-100 hover:border-surface-200 hover:shadow-sm cursor-pointer transition-all duration-150 group"
                  onClick={() => handleOpenRecent(file.id)}
                >
                  <div className="w-9 h-9 rounded-lg bg-surface-100 flex items-center justify-center group-hover:bg-primary-50 transition-colors">
                    <Clock className="w-4 h-4 text-surface-400 group-hover:text-primary-500 transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-700 truncate">{file.name}</p>
                    <p className="text-xs text-surface-400 mt-0.5">
                      {new Date(file.updated_at).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-surface-300 group-hover:text-primary-400 group-hover:translate-x-0.5 transition-all" />
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <ResumeListDrawer
        open={showDrawer}
        onClose={() => setShowDrawer(false)}
        onOpenResume={handleOpenFromDrawer}
      />

      {importPreview && (
        <ImportPreviewDialog
          preview={importPreview}
          onClose={() => setImportPreview(null)}
          onImported={handleImported}
        />
      )}

      {showUpdateDialog && updateInfo && (
        <UpdateDialog
          info={updateInfo}
          onClose={() => setShowUpdateDialog(false)}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除模板"
        description={`确定要删除模板「${deleteTarget?.name}」吗？此操作不可恢复。`}
        confirmText="删除"
        danger
        loading={!!deletingTemplateId}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* 模板导入记录 */}
      {showImportLogs && (
        <ImportLogsDialog
          logs={importLogs}
          deletingId={deletingLogId}
          onDelete={(log) => setDeleteLogTarget(log)}
          onClose={() => setShowImportLogs(false)}
        />
      )}

      <ConfirmDialog
        open={!!deleteLogTarget}
        title="删除导入记录"
        description={`确定要删除「${deleteLogTarget?.template_name}」的导入记录吗？仅删除记录，不会移除已安装的模板。`}
        confirmText="删除"
        danger
        loading={!!deletingLogId}
        onConfirm={handleDeleteLog}
        onCancel={() => setDeleteLogTarget(null)}
      />
    </AnimatedPage>
    </>
  )
}

function Pagination({ currentPage, totalPages, onPageChange }: {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-surface-400 hover:text-surface-600 hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="上一页"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
        <button
          key={page}
          onClick={() => onPageChange(page)}
          className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${page === currentPage
            ? 'bg-primary-600 text-white shadow-sm'
            : 'text-surface-500 hover:text-surface-700 hover:bg-surface-100'
            }`}
        >
          {page}
        </button>
      ))}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-surface-400 hover:text-surface-600 hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="下一页"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
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
      className="group cursor-pointer rounded-xl border border-surface-200 bg-elev overflow-hidden hover:shadow-md hover:border-primary-300 transition-all duration-200 hover:-translate-y-0.5 animate-card-enter"
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
          <Tooltip label={favorite ? '取消收藏' : '收藏'} className="absolute top-2.5 left-2.5">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
              disabled={favLoading}
              className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all ${favorite ? 'bg-amber-400 text-white hover:bg-amber-500' : 'bg-elev/90 text-surface-400 hover:text-amber-500 hover:bg-elev'
                } disabled:opacity-60`}
            >
              {favLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className={`w-4 h-4 ${favorite ? 'fill-current' : ''}`} />}
            </button>
          </Tooltip>
        )}

        {/* Hover blur overlay + preview button — slides in from right */}
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-center transition-transform duration-300 ease-out"
          style={{
            width: '33.333%',
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
          <div className="relative z-10 flex flex-col items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onPreview() }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-elev/70 backdrop-blur-sm text-surface-800 text-sm font-medium border border-surface-200 shadow-md hover:bg-elev/90 hover:border-surface-300 hover:shadow-lg active:scale-95 transition-all duration-150 disabled:opacity-50"
            >
              <Eye className="w-4 h-4 shrink-0" />
              <span className="preview-label">预览</span>
            </button>
            {onShare && (
              <button
                onClick={(e) => { e.stopPropagation(); onShare() }}
                disabled={sharing}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-elev/70 backdrop-blur-sm text-primary-600 text-sm font-medium border border-surface-200 shadow-md hover:bg-elev/90 hover:text-primary-700 hover:border-surface-300 hover:shadow-lg active:scale-95 transition-all duration-150 disabled:opacity-50"
                title="导出为模板分享包 (.zip)"
              >
                {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 shrink-0" />}
                <span className="preview-label">导出</span>
              </button>
            )}
            {!template.is_builtin && onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-elev/70 backdrop-blur-sm text-red-600 text-sm font-medium border border-surface-200 shadow-md hover:bg-elev/90 hover:text-red-700 hover:border-surface-300 hover:shadow-lg active:scale-95 transition-all duration-150 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 shrink-0" />}
                <span className="preview-label">删除</span>
              </button>
            )}
          </div>
        </div>
      </div>
      {/* Meta info */}
      <div className="p-3.5 border-t border-surface-100">
        <h3 className="text-sm font-semibold text-surface-800">{template.name}</h3>
        <p className="text-xs text-surface-400 mt-0.5 line-clamp-2">{template.description}</p>
        <div className="flex gap-1.5 mt-2.5">
          {template.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="px-2 py-0.5 text-[10px] rounded-full bg-surface-100 text-surface-500 font-medium">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// 分类筛选胶囊（模板市场能力整合到主页）
function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${active
        ? 'bg-primary-50 text-primary-700 border-primary-200'
        : 'text-surface-500 border-surface-200 hover:border-surface-300 hover:text-surface-700'
        }`}
    >
      {children}
    </button>
  )
}

// 模板导入记录弹窗
function ImportLogsDialog({ logs, deletingId, onDelete, onClose }: {
  logs: ImportLog[]
  deletingId: number | null
  onDelete: (log: ImportLog) => void
  onClose: () => void
}) {
  const modalRef = useRef<ModalHandle>(null)

  return (
    <Modal ref={modalRef} onClose={onClose} width="w-[520px]" cardClassName="flex flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 px-6 py-3 border-b border-surface-100 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
          <Clock className="w-4 h-4 text-primary-600" />
        </div>
        <span className="text-base font-semibold text-surface-700">模板导入记录</span>
      </div>
      <div className="flex-1 overflow-auto px-6 py-3">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-surface-300">
            <Clock className="w-9 h-9 mb-2" />
            <p className="text-sm">暂无导入记录</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-surface-100 hover:border-surface-200 transition-colors"
              >
                <PackageOpen className="w-4 h-4 text-surface-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-surface-700 truncate">{log.template_name}</span>
                    <span className={`px-1.5 py-0.5 text-[10px] rounded-full font-medium flex-shrink-0 ${log.source === 'share' ? 'bg-primary-50 text-primary-600' : log.source === 'community' ? 'bg-emerald-50 text-emerald-600' : 'bg-surface-100 text-surface-500'
                      }`}>
                      {log.source === 'share' ? '分享包' : log.source === 'community' ? '社区' : '本地'}
                    </span>
                  </div>
                  <p className="text-[12px] text-surface-400 mt-0.5">
                    {new Date(log.imported_at).toLocaleString('zh-CN')}
                  </p>
                </div>
                <button
                  onClick={() => onDelete(log)}
                  disabled={deletingId === log.id}
                  className="p-1.5 rounded-lg text-surface-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50 flex-shrink-0"
                  title="删除记录"
                >
                  {deletingId === log.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
