import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app'
import { applyPlatformToDocument } from './lib/platform'
import './assets/styles/globals.css'

// 在 React 渲染前同步写入平台标记（<html data-platform="...">），
// 避免 macOS 首帧闪现 Windows 风格的自绘窗口按钮。
applyPlatformToDocument()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
