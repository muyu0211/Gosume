// 平台检测工具
// 优先读取 Wails v3 运行时同步注入的环境信息（_wails.environment.OS），
// 纯浏览器开发模式下回退到 User-Agent 嗅探。
// 返回值与 Go 的 runtime.GOOS 保持一致：windows / darwin / linux。

export type Platform = 'windows' | 'darwin' | 'linux' | 'unknown'

export function detectPlatform(): Platform {
  try {
    const env = (
      window as unknown as { _wails?: { environment?: { OS?: string } } }
    )._wails?.environment
    if (env?.OS) {
      const os = env.OS.toLowerCase()
      if (os === 'windows' || os === 'darwin' || os === 'linux') return os
    }
  } catch {
    // ignore
  }

  const ua = navigator.userAgent
  if (/Mac/i.test(ua)) return 'darwin'
  if (/Windows/i.test(ua)) return 'windows'
  if (/Linux/i.test(ua)) return 'linux'
  return 'unknown'
}

export function isMacOS(): boolean {
  return detectPlatform() === 'darwin'
}

// 将平台标记写入 <html data-platform="..."> 并添加 platform-{os} class，
// 供 CSS 做平台差异化适配（globals.css 使用 .platform-darwin 类选择器）。
export function applyPlatformToDocument(): Platform {
  const platform = detectPlatform()
  const el = document.documentElement
  el.dataset.platform = platform
  el.classList.remove('platform-windows', 'platform-darwin', 'platform-linux')
  if (platform !== 'unknown') {
    el.classList.add(`platform-${platform}`)
  }
  return platform
}
