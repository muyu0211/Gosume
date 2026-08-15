import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { TitleBar } from './components/layout/TitleBar'
import { WelcomePage } from './routes/WelcomePage'
import { EditorPage } from './routes/EditorPage'
import { SettingsPage } from './routes/SettingsPage'
import { useLayoutSettingsStore } from './stores/layoutSettingsStore'

export default function App() {
  // Ensure frameless mode is applied (safeguard for Wails v3 alpha)
  useEffect(() => {
    try {
      const win = window as Record<string, unknown>
      const wailsWindow = win._wails?.Window as Record<string, unknown> | undefined
      if (wailsWindow?.SetFrameless) {
        ;(wailsWindow.SetFrameless as (v: boolean) => void)(true)
      }
    } catch { /* non-Wails environment */ }
  }, [])

  // Load user-customized layout tiers once so custom presets are available
  // to the preview, exports and the layout popover from the start.
  useEffect(() => {
    useLayoutSettingsStore.getState().ensureLoaded().catch(() => { /* defaults apply */ })
  }, [])

  return (
    <HashRouter>
      <div className="h-screen flex flex-col bg-surface-50">
        <TitleBar />
        <div className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        </div>
      </div>
    </HashRouter>
  )
}
