import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app'
import { applyPlatformToDocument } from './lib/platform'
import { applyThemeToDocument, resolveApplied, DEFAULT_MODE } from './lib/theme'
import { initOverlayScrollbars } from './lib/overlayScrollbar'
import './assets/styles/globals.css'

// 在 React 渲染前同步写入平台标记（<html data-platform="...">），
// 避免 macOS 首帧闪现 Windows 风格的自绘窗口按钮。
applyPlatformToDocument()

// 在 React 渲染前同步写入默认主题（<html data-theme="...">）：
// 避免首帧明暗闪跳。持久化主题由 App 挂载后异步加载并覆盖。
applyThemeToDocument(resolveApplied(DEFAULT_MODE))

// 悬浮滚动条：扫描约定类滚动容器并跟随 DOM 增删（见 lib/overlayScrollbar.ts）。
initOverlayScrollbars()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
