import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { TitleBar } from './components/layout/TitleBar'
import { WelcomePage } from './routes/WelcomePage'
import { EditorPage } from './routes/EditorPage'
import { SettingsPage } from './routes/SettingsPage'
import { useLayoutSettingsStore } from './stores/layoutSettingsStore'
import { applyPlatformToDocument } from './lib/platform'

export default function App() {
  // 平台标记已由 main.tsx 在渲染前写入；此处再次应用以确保一致，
  // 并仅在非 macOS 平台强制 frameless（macOS 使用原生红绿灯，见 app.go）
  useEffect(() => {
    const platform = applyPlatformToDocument()

    // Ensure frameless mode is applied (safeguard for Wails v3 alpha).
    // macOS 走 TitleBarHiddenInset（保留原生红绿灯），不能强制 frameless，
    // 否则会移除原生窗口按钮，看起来像 Windows 程序。
    if (platform !== 'darwin') {
      try {
        const win = window as Record<string, unknown>
        const wailsWindow = win._wails?.Window as Record<string, unknown> | undefined
        if (wailsWindow?.SetFrameless) {
          ;(wailsWindow.SetFrameless as (v: boolean) => void)(true)
        }
      } catch { /* non-Wails environment */ }
    }
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
