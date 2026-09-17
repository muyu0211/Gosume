import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Events } from '@wailsio/runtime'
import { TitleBar } from './components/layout/TitleBar'
import { AppBackground } from './components/layout/AppBackground'
import { WelcomePage } from './routes/WelcomePage'
import { EditorPage } from './routes/EditorPage'
import { SettingsPage } from './routes/SettingsPage'
import { CommunityPage } from './routes/CommunityPage'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { useResumeStore } from './stores/resumeStore'
import { useThemeStore } from './stores/themeStore'
import { useAppStore } from './stores/appStore'
import { applyBackgroundToDocument } from './lib/background'
import { applyPlatformToDocument } from './lib/platform'
import { useLiquidGlass } from './hooks/useLiquidGlass'
import { isWails, callService } from './services/backend'

export default function App() {
  // 液态玻璃引擎：挂载/卸载所有 [data-lg] 元素（Chromium 专属的边缘折射）。
  // 非 Chromium 内核自动跳过，元素停在纯模糊降级，不会变成透明块。
  useLiquidGlass()
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
  // 启动时把本地持久化的壁纸选项写进 <html data-app-bg>（store 初值已读取，
  // 但 DOM 属性要在这里补一次，否则首屏仍是纯底色）。
  useEffect(() => {
    applyBackgroundToDocument(useAppStore.getState().background)
  }, [])

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
      {/* 壁纸层放最前：z-index:-1，绘制在所有普通内容之下（见 globals.css）。
          必须在挂载时就有正确的 data-app-bg —— 状态初值直接取自本地持久化值。 */}
      <div className="h-screen flex flex-col app-canvas">
        <AppBackground />
        <TitleBar />
        <div className="flex-1 overflow-hidden">
          {/* 渲染异常兜底：任何子树抛错都不会卸载整棵树（否则整窗白屏） */}
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<WelcomePage />} />
              <Route path="/editor" element={<EditorPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/community" element={<CommunityPage />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </div>
    </HashRouter>
  )
}
