// 主题（theme）机制的类型与解析工具。
// 用户可选：跟随系统 / 三种显式主题。
// 实际写入 <html data-theme> 的只有三种显式主题（跟随系统时由系统偏好解析而来）。
// 令牌变量定义在 assets/styles/globals.css 的 html[data-theme=...] 块中。

export type ThemeMode = 'system' | 'classic' | 'wheat' | 'obsidian'
export type AppliedTheme = 'classic' | 'wheat' | 'obsidian'

/** 默认选项：跟随系统深浅。系统浅色 → 麦色，深色 → 深色。 */
export const DEFAULT_MODE: ThemeMode = 'system'
export const ALLOWED_MODES: ReadonlyArray<ThemeMode> = ['system', 'classic', 'wheat', 'obsidian']

/** 校验字符串是否为合法的主题选项。 */
export function isThemeMode(value: string): value is ThemeMode {
  return (ALLOWED_MODES as readonly string[]).includes(value)
}

/** 解析用户选项 → 实际应用的主题。system 依据系统偏好映射到 obsidian/wheat。 */
export function resolveApplied(mode: ThemeMode): AppliedTheme {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'obsidian' : 'wheat'
  }
  return mode
}

/** 将实际主题写入 <html data-theme>，触发 globals.css 中的令牌变量切换。 */
export function applyThemeToDocument(theme: AppliedTheme): void {
  document.documentElement.dataset.theme = theme
}

/** 三种显式主题的循环顺序（经典 → 麦色 → 深色）。 */
export const EXPLICIT_THEMES: ReadonlyArray<AppliedTheme> = ['classic', 'wheat', 'obsidian']

/** 在当前主题基础上轮换到下一个显式主题（跳过 system，仅在三套显式主题间循环）。 */
export function nextExplicitTheme(current: ThemeMode): AppliedTheme {
  const applied = resolveApplied(current)
  const idx = EXPLICIT_THEMES.indexOf(applied)
  return EXPLICIT_THEMES[(idx + 1) % EXPLICIT_THEMES.length]
}