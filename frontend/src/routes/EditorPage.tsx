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
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { usePreview } from '../hooks/usePreview'
import { useAutoSave } from '../hooks/useAutoSave'
import { callService } from '../services/backend'

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

    // Always save to localStorage first as a reliable fallback
    const saveData = { resume, timestamp: new Date().toISOString() }
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData))
    localStorage.setItem('resume-craft-autosave', JSON.stringify(saveData))

    try {
      // Sync current data to Go backend and persist to SQLite
      await callService('ResumeService', 'SetResume', resume)
      await useResumeStore.getState().saveCurrent()
      markSaved()
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (err) {
      console.error('Save failed:', err)
      // Backend sync failed but localStorage data is safe
      markSaved()
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }, [resume, markSaved])

  const handleExport = useCallback(() => {
    setShowExportDialog(true)
  }, [])

  useKeyboardShortcuts(handleSave, handleExport)

  if (!resume) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-400">加载中...</p>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
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
    </div>
  )
}
