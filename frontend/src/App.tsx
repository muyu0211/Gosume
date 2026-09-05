import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Events } from '@wailsio/runtime'
import { TitleBar } from './components/layout/TitleBar'
import { WelcomePage } from './routes/WelcomePage'
import { EditorPage } from './routes/EditorPage'
import { SettingsPage } from './routes/SettingsPage'
import { CommunityPage } from './routes/CommunityPage'
import { useResumeStore } from './stores/resumeStore'
import { useThemeStore } from './stores/themeStore'
import { applyPlatformToDocument } from './lib/platform'
import { isWails, callService } from './services/backend'

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
        const win = window as unknown as Record<string, unknown>
        const wailsWindow = (win._wails as Record<string, unknown> | undefined)?.Window as Record<string, unknown> | undefined
        if (wailsWindow?.SetFrameless) {
          ;(wailsWindow.SetFrameless as (v: boolean) => void)(true)
        }
      } catch { /* non-Wails environment */ }
    }
  }, [])

  // 加载持久化主题选项并覆盖启动默认值；选择「跟随系统」时监听系统深浅色
  // 变化，自动在麦色/深色间切换（PR-10）。
  useEffect(() => {
    useThemeStore.getState().ensureLoaded().catch(() => { /* default applies */ })
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => useThemeStore.getState().refreshSystem()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  // 监听系统关闭请求（标题栏原生 X / Alt+F4 / macOS 红绿灯）：后端在
  // Common.WindowClosing 钩子中拦截并广播此事件，前端据此做未保存二确，
  // 确认后调用 ConfirmWindowClose 真正关闭窗口。
  useEffect(() => {
    if (!isWails()) return
    const off = Events.On('window:close-requested', () => {
      useResumeStore.getState().requestLeave(() => {
        callService('SystemService', 'ConfirmWindowClose').catch(() => { /* 忽略 */ })
      })
    })
    return off
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
          <Route path="/community" element={<CommunityPage />} />
        </Routes>
        </div>
      </div>
    </HashRouter>
  )
}
