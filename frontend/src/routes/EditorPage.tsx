import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useResumeStore } from '../stores/resumeStore'
import { useEditorStore } from '../stores/editorStore'
import { Sidebar } from '../components/layout/Sidebar'
import { Toolbar } from '../components/layout/Toolbar'
import { StatusBar } from '../components/layout/StatusBar'
import { EditorPanel } from '../components/editor/EditorPanel'
import { PreviewPanel } from '../components/preview/PreviewPanel'
import { ExportDialog } from '../components/export/ExportDialog'
import { AnimatedPage } from '../components/ui/AnimatedPage'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { usePreview } from '../hooks/usePreview'
import { useAutoSave } from '../hooks/useAutoSave'
import { callService } from '../services/backend'
import { FileText, Loader2 } from 'lucide-react'

const SAVE_KEY = 'resume-craft-project'

export function EditorPage() {
  const navigate = useNavigate()
  const resume = useResumeStore((s) => s.resume)
  const markSaved = useResumeStore((s) => s.markSaved)
  const splitRatio = useEditorStore((s) => s.splitRatio)
  const setSplitRatio = useEditorStore((s) => s.setSplitRatio)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

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

  const handleSave = useCallback(async () => {
    if (!resume) return
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
  }, [resume, markSaved])

  const handleExport = useCallback(() => {
    setShowExportDialog(true)
  }, [])

  useKeyboardShortcuts(handleSave, handleExport)

  if (!resume) {
    return <EditorSkeleton />
  }

  return (
    <AnimatedPage className="h-full flex flex-col bg-slate-50">
      {/* Toolbar */}
      <Toolbar
        onSave={handleSave}
        onExport={handleExport}
        saveStatus={saveStatus}
      />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar onExport={handleExport} />

        {/* Editor + Preview Split */}
        <div className="flex-1 flex overflow-hidden">
          {/* Editor Panel */}
          <div style={{ width: `${splitRatio * 100}%` }} className="overflow-auto border-r border-slate-200">
            <div className="p-4">
              <EditorPanel />
            </div>
          </div>

          {/* Resize handle */}
          <div
            className="w-1 bg-slate-200 hover:bg-primary-400 cursor-col-resize transition-colors flex-shrink-0"
            onMouseDown={(e) => {
              const startX = e.clientX
              const startRatio = splitRatio
              const onMove = (ev: MouseEvent) => {
                const dx = ev.clientX - startX
                const containerWidth = window.innerWidth - 200
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
          <div style={{ width: `${(1 - splitRatio) * 100}%` }} className="overflow-auto bg-slate-200">
            <PreviewPanel />
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar saveStatus={saveStatus} />

      {/* Export Dialog */}
      {showExportDialog && (
        <ExportDialog onClose={() => setShowExportDialog(false)} />
      )}
    </AnimatedPage>
  )
}

function EditorSkeleton() {
  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Toolbar skeleton */}
      <div className="h-12 flex items-center gap-2 px-3 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="w-8 h-8 rounded bg-slate-200 animate-pulse" />
        <div className="w-px h-5 bg-slate-200" />
        <div className="w-20 h-8 rounded bg-slate-200 animate-pulse" />
        <div className="w-16 h-8 rounded bg-slate-200 animate-pulse" />
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar skeleton */}
        <div className="w-[50px] flex-shrink-0 bg-white border-r border-slate-200 flex flex-col items-center gap-3 py-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-8 h-8 rounded-lg bg-slate-200 animate-pulse" />
          ))}
        </div>

        {/* Editor panel skeleton */}
        <div className="flex-1 overflow-auto border-r border-slate-200">
          <div className="p-5 space-y-5">
            {/* Section header */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-4 h-4 rounded bg-slate-200 animate-pulse" />
              <div className="w-16 h-4 rounded bg-slate-200 animate-pulse" />
            </div>
            {/* Avatar + form fields */}
            <div className="flex gap-4 mb-4">
              <div className="w-20 h-20 rounded-full bg-slate-200 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="w-24 h-3 rounded bg-slate-200 animate-pulse" />
                <div className="w-40 h-3 rounded bg-slate-200 animate-pulse" />
              </div>
            </div>
            {/* Form field placeholders */}
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="w-12 h-3 rounded bg-slate-200 animate-pulse" />
                  <div className="w-full h-9 rounded bg-slate-200 animate-pulse" />
                </div>
              ))}
            </div>
            {/* Another section */}
            <div className="space-y-3 pt-3">
              <div className="w-12 h-3 rounded bg-slate-200 animate-pulse" />
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="w-full h-24 rounded bg-slate-200 animate-pulse" />
              ))}
            </div>
          </div>
        </div>

        {/* Preview skeleton */}
        <div className="flex-1 flex items-start justify-center py-8 bg-slate-200">
          <div className="bg-white rounded shadow-lg flex flex-col items-center justify-center gap-4" style={{ width: 210 * 3.78, height: 297 * 3.78 * 0.7 }}>
            <FileText className="w-12 h-12 text-slate-300" />
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">正在加载简历...</span>
            </div>
            <div className="w-48 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-primary-400 rounded-full animate-loading-bar" style={{ width: '60%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Status bar skeleton */}
      <div className="h-7 flex items-center gap-3 px-3 bg-slate-800 flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-slate-600" />
        <div className="w-12 h-3 rounded bg-slate-600 animate-pulse" />
        <div className="w-px h-3 bg-slate-600" />
        <div className="w-16 h-3 rounded bg-slate-600 animate-pulse" />
      </div>
    </div>
  )
}
