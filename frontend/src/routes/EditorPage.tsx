import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useResumeStore } from '../stores/resumeStore'
import { useEditorStore } from '../stores/editorStore'
import { Sidebar } from '../components/layout/Sidebar'
import { Toolbar } from '../components/layout/Toolbar'
import { StylePanel } from '../components/layout/StylePanel'
import { StatusBar } from '../components/layout/StatusBar'
import { EditorPanel } from '../components/editor/EditorPanel'
import { ItemDeleteConfirmDialog } from '../components/editor/ItemDeleteConfirmDialog'
import { PreviewPanel } from '../components/preview/PreviewPanel'
import { ExportDialog } from '../components/export/ExportDialog'
import { UnsavedChangesDialog } from '../components/ui/UnsavedChangesDialog'
import { AnimatedPage } from '../components/ui/AnimatedPage'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { usePreview } from '../hooks/usePreview'
import { useAutoSave } from '../hooks/useAutoSave'
import { callService } from '../services/backend'
import { DEFAULT_PAPER } from '../lib/paper'
import { FileText, Loader2 } from 'lucide-react'

const SAVE_KEY = 'resume-craft-project'

export function EditorPage() {
  const navigate = useNavigate()
  const resume = useResumeStore((s) => s.resume)
  const isDirty = useResumeStore((s) => s.isDirty)
  const currentId = useResumeStore((s) => s.currentId)
  const markSaved = useResumeStore((s) => s.markSaved)
  const clearResume = useResumeStore((s) => s.clearResume)
  const requestLeave = useResumeStore((s) => s.requestLeave)
  const cancelLeave = useResumeStore((s) => s.cancelLeave)
  const confirmLeaveSave = useResumeStore((s) => s.confirmLeaveSave)
  const discardLeave = useResumeStore((s) => s.discardLeave)
  const pendingLeave = useResumeStore((s) => s.pendingLeave)
  const savingOnLeave = useResumeStore((s) => s.savingOnLeave)
  const splitRatio = useEditorStore((s) => s.splitRatio)
  const setSplitRatio = useEditorStore((s) => s.setSplitRatio)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const splitRef = useRef<HTMLDivElement>(null)

  const { refreshPreview } = usePreview()
  useAutoSave(30000)

  useEffect(() => {
    // If no resume was loaded (e.g. direct URL navigation), redirect to homepage.
    // Resume loading is handled exclusively by WelcomePage.handleOpenProject.
    const current = useResumeStore.getState().resume
    if (!current) {
      navigate('/', { replace: true })
    }
  }, [navigate])

  // 首次进入编辑页即测量一次内容高度，让 StatusBar 在保存前也有参考值；
  // 保存后 saveCurrent 会再次测量并覆盖。无简历时 measureContentHeight 内部跳过。
  // 注：React.StrictMode 开发模式下挂载 effect 会执行两次，用 ref 保证只测量一次。
  const mountedMeasureRef = useRef(false)
  useEffect(() => {
    if (mountedMeasureRef.current) return
    mountedMeasureRef.current = true
    useResumeStore.getState().measureContentHeight()
  }, [])

  // 样式定制（resume.custom_css）变化会改变内容真实高度，但样式不置位简历
  // isDirty，因此保存流程不会触发重测，状态栏/单页导出提示会停留在旧值。
  // 这里订阅 custom_css 变化，拖动停止后防抖重新测量（首次进入由上方 entry 测量兜底，跳过）。
  const customCss = useResumeStore((s) => s.resume?.custom_css)
  const styleChangedRef = useRef(false)
  useEffect(() => {
    if (!styleChangedRef.current) {
      styleChangedRef.current = true
      return
    }
    if (!useResumeStore.getState().resume) return
    const timer = setTimeout(() => {
      useResumeStore.getState().measureContentHeight()
    }, 150)
    return () => clearTimeout(timer)
  }, [customCss])

  // 返回首页：有未保存更改时先弹二确（保存并继续 / 不保存并继续 / 取消）。
  const handleHome = useCallback(() => {
    requestLeave(() => {
      clearResume()
      navigate('/')
    })
  }, [clearResume, navigate, requestLeave])

  const handleSave = useCallback(async () => {
    if (!resume) return

    // 无内容修改且已持久化：后端数据已是最新，跳过真实保存请求
    // （含 SetResume / localStorage / ExplicitSave / 内容高度测量），
    // 防止用户频繁点击保存导致后端重复计算。新建简历（currentId 为空）
    // 不受影响——首次保存必须真实落库。
    if (!isDirty && currentId) {
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
      return
    }

    setSaveStatus('saving')

    try {
      // Save to localStorage as fallback (strip avatar to avoid QuotaExceededError)
      const slimResume = { ...resume, personal: { ...resume.personal, avatar: undefined } }
      const saveData = { resume: slimResume, timestamp: new Date().toISOString() }
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(saveData))
        localStorage.setItem('resume-craft-autosave', JSON.stringify(saveData))
      } catch {
        // localStorage full or unavailable — non-critical, backend is the source of truth
        console.warn('localStorage save skipped (quota or unavailable)')
      }

      // Sync current data to Go backend and persist to SQLite
      await callService('ResumeService', 'SetResume', resume)
      await useResumeStore.getState().saveCurrent()
      markSaved()
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (err) {
      console.error('Save failed:', err)
      markSaved()
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }, [resume, isDirty, currentId, markSaved])

  // 导出入口：先走一次保存（与保存按钮同一入口，含未修改守卫与「保存中/已保存」
  // 状态反馈，用户可感知），保存成功后 saveCurrent 会异步更新内容高度缓存，
  // 导出对话框（含单页导出的高度提示）展示的即是最新持久化数据与最新高度。
  const handleExport = useCallback(async () => {
    await handleSave()
    setShowExportDialog(true)
  }, [handleSave])

  useKeyboardShortcuts(handleSave, handleExport)

  if (!resume) {
    return <EditorSkeleton />
  }

  return (
    <AnimatedPage className="h-full flex flex-col bg-surface-50">
      {/* Toolbar */}
      <Toolbar
        onSave={handleSave}
        onExport={handleExport}
        onHome={handleHome}
        saveStatus={saveStatus}
      />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative z-0">
        {/* Sidebar */}
        <Sidebar onExport={handleExport} />

        {/* Editor + Preview Split */}
        <div ref={splitRef} className="flex-1 flex overflow-hidden">
          {/* Editor Panel */}
          <div style={{ width: `${splitRatio * 100}%` }} className="overflow-auto border-r border-surface-200">
            <div className="p-4">
              <EditorPanel />
            </div>
          </div>

          {/* Resize handle */}
          <div
            className="w-1 bg-surface-200 hover:bg-primary-400 cursor-col-resize transition-colors flex-shrink-0"
            onMouseDown={(e) => {
              const startX = e.clientX
              const startRatio = splitRatio
              const containerWidth = splitRef.current?.clientWidth ?? window.innerWidth
              const onMove = (ev: MouseEvent) => {
                const dx = ev.clientX - startX
                setSplitRatio(startRatio + dx / containerWidth)
              }
              const onUp = () => {
                document.removeEventListener('mousemove', onMove)
                document.removeEventListener('mouseup', onUp)
              }
              document.addEventListener('mousemove', onMove)
              document.addEventListener('mouseup', onUp)
            }}
          />

          {/* Preview Panel */}
          <div style={{ width: `${(1 - splitRatio) * 100}%` }} className="overflow-hidden bg-surface-200">
            <PreviewPanel />
          </div>
        </div>

        {/* 样式排版右边栏（展开时推开预览区；宽度可拖拽调节） */}
        <StylePanel />
      </div>

      {/* Status Bar */}
      <StatusBar saveStatus={saveStatus} />

      {/* Export Dialog */}
      {showExportDialog && (
        <ExportDialog onClose={() => setShowExportDialog(false)} />
      )}

      {/* 条目删除二次确认 */}
      <ItemDeleteConfirmDialog />

      {/* 未保存更改二确（离开编辑页 / 关闭窗口） */}
      <UnsavedChangesDialog
        open={!!pendingLeave}
        saving={savingOnLeave}
        onSaveAndContinue={confirmLeaveSave}
        onDiscardAndContinue={discardLeave}
        onClose={cancelLeave}
      />
    </AnimatedPage>
  )
}

function EditorSkeleton() {
  return (
    <div className="h-full flex flex-col bg-surface-50">
      {/* Toolbar skeleton */}
      <div className="h-12 flex items-center gap-2 px-3 bg-elev/80 border-b border-surface-100 flex-shrink-0">
        <div className="w-8 h-8 rounded-md bg-surface-200 animate-shimmer" />
        <div className="w-px h-5 bg-surface-200" />
        <div className="w-20 h-8 rounded-md bg-surface-200 animate-shimmer" />
        <div className="w-16 h-8 rounded-md bg-surface-200 animate-shimmer" />
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar skeleton */}
        <div className="w-[50px] flex-shrink-0 bg-surface-100 border-r border-surface-200 flex flex-col items-center gap-3 py-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-8 h-8 rounded-xl bg-surface-200 animate-shimmer" />
          ))}
        </div>

        {/* Editor panel skeleton */}
        <div className="flex-1 overflow-auto border-r border-surface-200">
          <div className="p-5 space-y-5">
            {/* Section header */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-4 h-4 rounded bg-surface-200 animate-shimmer" />
              <div className="w-16 h-4 rounded bg-surface-200 animate-shimmer" />
            </div>
            {/* Avatar + form fields */}
            <div className="flex gap-4 mb-4">
              <div className="w-20 h-20 rounded-full bg-surface-200 animate-shimmer flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="w-24 h-3 rounded bg-surface-200 animate-shimmer" />
                <div className="w-40 h-3 rounded bg-surface-200 animate-shimmer" />
              </div>
            </div>
            {/* Form field placeholders */}
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="w-12 h-3 rounded bg-surface-200 animate-shimmer" />
                  <div className="w-full h-9 rounded bg-surface-200 animate-shimmer" />
                </div>
              ))}
            </div>
            {/* Another section */}
            <div className="space-y-3 pt-3">
              <div className="w-12 h-3 rounded bg-surface-200 animate-shimmer" />
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="w-full h-24 rounded bg-surface-200 animate-shimmer" />
              ))}
            </div>
          </div>
        </div>

        {/* Preview skeleton */}
        <div className="flex-1 flex items-start justify-center py-8 bg-surface-200">
          <div className="bg-white rounded-xl shadow-sm flex flex-col items-center justify-center gap-4" style={{ width: DEFAULT_PAPER.pxW, height: DEFAULT_PAPER.pxH * 0.7 }}>
            <FileText className="w-12 h-12 text-surface-300" />
            <div className="flex items-center gap-2 text-surface-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">正在加载简历...</span>
            </div>
            <div className="w-48 h-2 rounded-full bg-surface-100 overflow-hidden">
              <div className="h-full bg-primary-400 rounded-full animate-loading-bar" style={{ width: '60%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Status bar skeleton */}
      <div className="h-7 flex items-center gap-3 px-3 bg-surface-100 border-t border-surface-200 flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-surface-300" />
        <div className="w-12 h-3 rounded bg-surface-200 animate-shimmer" />
        <div className="w-px h-3 bg-surface-300" />
        <div className="w-16 h-3 rounded bg-surface-200 animate-shimmer" />
      </div>
    </div>
  )
}
