import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTemplateStore } from '../stores/templateStore'
import { useResumeStore } from '../stores/resumeStore'
import { Clock, Sparkles, Settings, Upload, FileUp, Loader2, Trash2, CheckCircle2, PackageOpen, Globe, Moon, Palette, Sun, FileText, LayoutTemplate, CalendarClock } from 'lucide-react'
import { useThemeStore } from '../stores/themeStore'
import { nextExplicitTheme } from '../lib/theme'
import { ImportPreviewDialog } from '../components/resume/ImportPreviewDialog'
import { AnimatedPage } from '../components/ui/AnimatedPage'
import { CrossFade } from '../components/ui/CrossFade'
import { TabRail } from '../components/ui/TabRail'
import { Tooltip } from '../components/ui/Tooltip'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Modal, type ModalHandle } from '../components/ui/Modal'
import { UpdateDialog, type UpdateInfo } from '../components/ui/UpdateDialog'
import { MyResumesPanel } from '../components/resume/MyResumesPanel'
import { TemplateGalleryPanel } from '../components/template/TemplateGalleryPanel'
import { JobSummaryCard } from '../components/recruit/JobSummaryCard'
import { RecruitPanel } from '../components/recruit/RecruitPanel'
import { importTemplatePackage, loadTemplateMetas, loadTemplateContent, deleteTemplate, setTemplateFavorite, listImportLogs, deleteImportLog, exportTemplatePackage } from '../services/templateService'
import { renderTemplate } from '../lib/templateEngine'
import { extractErrorMessage } from '../lib/errorUtils'
import { createSampleResume } from '../services/sampleData'
import { callService, isWails } from '../services/backend'
import { generateAllThumbnails } from '../services/thumbnailService'
import type { ImportLog } from '../types/template'
import type { ResumeListItem } from '../types/resume'
import type { FileParseResult, FileImportResponse } from '../types/gosume_file'
import { migratePersonalSummary } from '../types/resume'
import { useT } from '../lib/i18n'
import { useAppStore } from '../stores/appStore'

// 本次会话是否已做过启动更新检查（避免从编辑器返回首页时重复请求）
let updateCheckedThisSession = false
// 启动检查结果缓存：WelcomePage 路由切走会卸载、组件 state 随之丢失，
// 结果提升到模块级，返回首页时角标可直接恢复、保持常驻
let sessionUpdateInfo: UpdateInfo | null = null

export function WelcomePage() {
  const navigate = useNavigate()
  const t = useT()

  // 主题切换按钮：点击在三套显式主题间轮换（经典→麦色→深色→经典）。
  const appliedTheme = useThemeStore((s) => s.applied)
  const themeMode = useThemeStore((s) => s.mode)
  const ThemeIcon = appliedTheme === 'obsidian' ? Moon : appliedTheme === 'wheat' ? Palette : Sun
  const themeTitle = appliedTheme === 'obsidian' ? t('themeObsidian') : appliedTheme === 'wheat' ? t('themeWheat') : t('themeClassic')
  const handleCycleTheme = () => {
    useThemeStore.getState().setMode(nextExplicitTheme(themeMode))
  }
  const [previewHtmls, setPreviewHtmls] = useState<Record<string, string>>({})
  const [importingTemplate, setImportingTemplate] = useState(false)
  const [importError, setImportError] = useState('')
  const [importingGosume, setImportingGosume] = useState(false)
  const [importPreview, setImportPreview] = useState<FileParseResult | null>(null)
  const [importSuccess, setImportSuccess] = useState('')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(sessionUpdateInfo)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [importLogs, setImportLogs] = useState<ImportLog[]>([])
  const [showImportLogs, setShowImportLogs] = useState(false)
  const [deleteLogTarget, setDeleteLogTarget] = useState<ImportLog | null>(null)
  const [deletingLogId, setDeletingLogId] = useState<number | null>(null)
  /** 首次简历列表加载状态：用于展示骨架屏，避免空态闪现。 */
  const [listLoaded, setListLoaded] = useState(false)
  const templates = useTemplateStore((s) => s.templates)
  const setTemplates = useTemplateStore((s) => s.setTemplates)
  const setActiveTemplate = useTemplateStore((s) => s.setActiveTemplate)
  const setThumbnails = useTemplateStore((s) => s.setThumbnails)
  const newResume = useResumeStore((s) => s.newResume)
  const loadResume = useResumeStore((s) => s.loadResume)
  const setResumeList = useResumeStore((s) => s.setResumeList)
  const setResume = useResumeStore((s) => s.setResume)
  const resumeList = useResumeStore((s) => s.resumeList)

  // 首页 Tab：打开应用固定停在【我的简历】（不再因「暂无简历」自动跳到模板页，
  // 空态卡片上另有「去挑选模板」入口）。切到【简历模板】只发生在用户当次点击
  // Tab 或点「新建简历」时，且为会话级状态、不跨启动保留。
  const homeTab = useAppStore((s) => s.homeTab)
  const setHomeTab = useAppStore((s) => s.setHomeTab)

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
      if (list) setResumeList(list)
    } catch { /* empty list */ } finally {
      setListLoaded(true)
    }
  }

  // 「新建 / 打开 / 导入」统一约定：先拿到简历数据，再跳转编辑页。
  // 不能在 await 之前 clearResume() —— 那会让 store 在等待后端期间处于
  // resume === null 的空窗；一旦这一步失败就会带着 null 跳进编辑页，
  // 命中空态骨架后又被挂载 effect 踢回首页，表现为「内容被清空 + 白屏」。
  // newResume / loadResume / setResume 内部已完整重置（previewHtml、
  // currentId、filePath、测量结果），调用方无需提前清空。
  const handleNewResume = async (templateId: string) => {
    setActiveTemplate(templateId)
    await newResume(templateId)
    if (!useResumeStore.getState().resume) return
    navigate('/editor')
  }

  /** 工具条「新建简历」：先切到【简历模板】，由用户挑模板后再创建并进入编辑页。 */
  const handleCreateResume = () => {
    setHomeTab('templates')
  }

  const handlePreviewWithSample = async (templateId: string) => {
    setActiveTemplate(templateId)
    const sampleResume = createSampleResume(templateId)
    try {
      await callService('ResumeService', 'InitResume', sampleResume)
    } catch (err) {
      console.error('InitResume failed:', err)
      // 失败时仍进入编辑器（内存态可用），后续保存会重新创建记录
    }
    setResume(sampleResume)
    navigate('/editor')
  }

  const handleOpenResume = async (id: string) => {
    const resume = await loadResume(id)
    // 加载失败：保留首页与当前数据，不跳转，避免把用户带进空编辑页
    if (!resume) return
    if (resume.meta?.template_id) {
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
      setImportError(extractErrorMessage(err, t('importTemplateFailedCheck')))
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
      setImportError(extractErrorMessage(err, t('importFailedCheckFile')))
    } finally {
      setImportingGosume(false)
    }
  }

  // 中间态导入第二步：预览确认后执行导入（新建/覆盖均进入编辑器）
  const handleImported = async (result: FileImportResponse, finalTemplateId: string) => {
    const resume = importPreview?.resume
    setImportPreview(null)

    if (result.mode === 'overwrite') {
      setImportSuccess(t('overwriteImported'))
      // 刷新简历列表（覆盖改变了 name/updated_at）
      try {
        const list = await callService<ResumeListItem[]>('ResumeService', 'ListResumes')
        if (list) setResumeList(list)
      } catch { /* 忽略，列表随下次加载刷新 */ }
      // 覆盖后直接进入编辑页继续编辑（与打开简历一致的加载流程）
      const loaded = await loadResume(result.id)
      if (!loaded) return
      if (loaded.meta?.template_id) {
        setActiveTemplate(loaded.meta.template_id)
      }
      navigate('/editor')
      return
    }

    // 新建：用导入数据进入编辑器
    if (!resume) return
    setActiveTemplate(finalTemplateId)
    // 兼容历史数据：早期顶层 summary 字段迁移到 personal_summary 结构
    setResume(migratePersonalSummary(resume))
    navigate('/editor')
  }

  // 收藏 / 取消收藏（写入后端并同步 store，卡片即时反映）
  const handleToggleFavorite = async (id: string, favorite: boolean) => {
    setImportError('')
    try {
      if (isWails()) await setTemplateFavorite(id, favorite)
      setTemplates(templates.map((tpl) => (tpl.id === id ? { ...tpl, is_favorite: favorite } : tpl)))
    } catch (err) {
      console.error('Toggle favorite failed:', err)
      setImportError(extractErrorMessage(err, favorite ? t('favoriteFailed') : t('unfavoriteFailed')))
    }
  }

  // 导出分享包（弹出原生保存对话框，成功返回文件路径）
  const handleExportTemplate = async (id: string) => {
    setImportError('')
    setImportSuccess('')
    try {
      const path = await exportTemplatePackage(id)
      if (path) setImportSuccess(t('shareExported').replace('{path}', path))
    } catch (err) {
      console.error('Export template failed:', err)
      setImportError(extractErrorMessage(err, t('exportShareFailed')))
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
      setImportError(extractErrorMessage(err, t('deleteImportLogFailed')))
    } finally {
      setDeletingLogId(null)
      setDeleteLogTarget(null)
    }
  }

  return (
    <>
    <AnimatedPage className="h-full flex flex-col app-canvas">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="size-ctl-xl rounded-xl bg-primary-600 flex items-center justify-center shadow-sm shadow-primary-600/25">
              <Sparkles className="size-icon-lg text-white" />
            </div>
            {/* 新版本角标：启动检查到更新时渲染，点击弹出更新对话框（复用设置页 UpdateDialog） */}
            {updateInfo && (
              <button
                onClick={() => setShowUpdateDialog(true)}
                className="absolute -top-1.5 -right-2.5 px-1.5 py-0.5 rounded-full bg-danger-500 text-white text-[9px] font-bold tracking-wider shadow-md shadow-danger-500/30 animate-badge-pop hover:bg-danger-600 active:scale-95 transition-colors"
              >
                NEW
              </button>
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold text-surface-800 tracking-tight">Gosume</h1>
            <p className="text-xs text-surface-400 mt-0.5">{t('desktopResumeTool')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => navigate('/community')}
            className="btn-primary btn-sm"
          >
            <Globe className="size-icon-md shrink-0" />
            <span className="hidden md:inline">{t('templateCommunity')}</span>
          </button>
          <button
            onClick={handleOpenImportLogs}
            className="btn-secondary btn-sm"
          >
            <Clock className="size-icon-md shrink-0" />
            <span className="hidden md:inline">{t('importLogs')}</span>
          </button>
          <button
            onClick={handleImportTemplate}
            disabled={importingTemplate}
            className="btn-secondary btn-sm"
          >
            {importingTemplate ? <Loader2 className="size-icon-md animate-spin" /> : <Upload className="size-icon-md shrink-0" />}
            <span className="hidden md:inline">{t('importTemplate')}</span>
          </button>
          <button
            onClick={handleImportGosume}
            disabled={importingGosume}
            className="btn-secondary btn-sm"
          >
            {importingGosume ? <Loader2 className="size-icon-md animate-spin" /> : <FileUp className="size-icon-md shrink-0" />}
            <span className="hidden md:inline">{t('importResume')}</span>
          </button>
          <Tooltip label={themeTitle}>
            <button
              onClick={handleCycleTheme}
              className="btn-ghost btn-sm size-ctl-lg p-0 justify-center"
            >
              <ThemeIcon className="size-icon-md" />
            </button>
          </Tooltip>
          <Tooltip label={t('settings')}>
            <button
              onClick={() => navigate('/settings')}
              className="btn-ghost btn-sm"
            >
              <Settings className="size-icon-md" />
            </button>
          </Tooltip>
        </div>
      </header>

      {importError && (
        <div className="mx-8 mb-4 px-4 py-3 rounded-lg border border-danger-200 bg-danger-50 text-sm text-danger-700 flex items-center justify-between gap-3">
          <span>{importError}</span>
          <button onClick={() => setImportError('')} className="text-danger-500 hover:text-danger-700 text-xs font-medium">
            {t('close')}
          </button>
        </div>
      )}

      {importSuccess && (
        <div className="mx-8 mb-4 px-4 py-3 rounded-lg border border-success-200 bg-success-50 text-sm text-success-700 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="size-icon-md" />
            {importSuccess}
          </span>
          <button onClick={() => setImportSuccess('')} className="text-success-500 hover:text-success-700 text-xs font-medium">
            {t('close')}
          </button>
        </div>
      )}

      {/* 主体：左侧 Tab 栏 + 右侧主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        <TabRail
          value={homeTab}
          onChange={setHomeTab}
          ariaLabel={t('homeTabLabel')}
          className="w-[180px] flex-shrink-0 px-3"
          items={[
            {
              value: 'resumes',
              label: t('homeTabResumes'),
              icon: FileText,
              badge: resumeList.length || undefined,
            },
            { value: 'templates', label: t('homeTabTemplates'), icon: LayoutTemplate },
            { value: 'jobs', label: t('homeTabJobs'), icon: CalendarClock },
          ]}
        />
        <main className="flex-1 overflow-auto px-8 pb-8 mr-1">
          <CrossFade trigger={homeTab}>
            {homeTab === 'resumes' ? (
              <div className="flex flex-col gap-4">
                <JobSummaryCard />
                <MyResumesPanel
                  resumes={resumeList}
                  loading={!listLoaded}
                  onOpen={handleOpenResume}
                  onNewResume={handleCreateResume}
                  onGotoTemplates={() => setHomeTab('templates')}
                />
              </div>
            ) : homeTab === 'templates' ? (
              <TemplateGalleryPanel
                previewHtmls={previewHtmls}
                onNewResume={handleNewResume}
                onPreviewWithSample={handlePreviewWithSample}
                onDeleteTemplate={async (id) => {
                  await deleteTemplate(id)
                  await loadData()
                }}
                onToggleFavorite={handleToggleFavorite}
                onShare={handleExportTemplate}
              />
            ) : (
              <RecruitPanel />
            )}
          </CrossFade>
        </main>
      </div>

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
        title={t('deleteImportLog')}
        description={t('deleteImportLogConfirm').replace('{name}', deleteLogTarget?.template_name || '')}
        confirmText={t('delete')}
        danger
        loading={!!deletingLogId}
        onConfirm={handleDeleteLog}
        onCancel={() => setDeleteLogTarget(null)}
      />
    </AnimatedPage>
    </>
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
  const t = useT()
  const lang = useAppStore((s) => s.language)

  return (
    <Modal ref={modalRef} onClose={onClose} width="w-[520px]" cardClassName="flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-6 py-3 border-b border-surface-100 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
          <Clock className="size-icon-md text-primary-600" />
        </div>
        <span className="text-base font-semibold text-surface-700">{t('importLogsTitle')}</span>
      </div>
      <div className="flex-1 overflow-auto px-6 py-3">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-surface-300">
            <Clock className="size-ctl-lg mb-2" />
            <p className="text-sm">{t('noImportLogs')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="glass-entry glass-hover flex items-center gap-3 px-3 py-2 transition-colors"
              >
                <PackageOpen className="size-icon-md text-surface-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-surface-700 truncate">{log.template_name}</span>
                    <span className={`px-1.5 py-0.5 text-[10px] rounded-full font-medium flex-shrink-0 ${log.source === 'share' ? 'bg-primary-50 text-primary-600' : log.source === 'community' ? 'bg-success-50 text-success-600' : 'bg-surface-100 text-surface-500'
                      }`}>
                      {log.source === 'share' ? t('sourceShare') : log.source === 'community' ? t('sourceCommunity') : t('sourceLocal')}
                    </span>
                  </div>
                  <p className="text-[12px] text-surface-400 mt-0.5">
                    {new Date(log.imported_at).toLocaleString(lang === 'en-US' ? 'en-US' : 'zh-CN')}
                  </p>
                </div>
                <Tooltip label={t('deleteRecord')}>
                  <button
                    onClick={() => onDelete(log)}
                    disabled={deletingId === log.id}
                    aria-label={t('deleteRecord')}
                    className="p-1.5 rounded-lg text-surface-300 hover:text-danger-500 hover:bg-danger-50 transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    {deletingId === log.id ? <Loader2 className="size-icon-md animate-spin" /> : <Trash2 className="size-icon-md" />}
                  </button>
                </Tooltip>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
