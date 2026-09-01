import { create } from 'zustand'
import { callService } from '../services/backend'
import {
  DEFAULT_MODE,
  isThemeMode,
  resolveApplied,
  applyThemeToDocument,
  type AppliedTheme,
  type ThemeMode,
} from '../lib/theme'

/**
 * 应用主题选项，持久化到 config.json（经由 SystemService.Get/SetTheme）。
 *
 * - `mode`：用户选项（system/classic/wheat/obsidian）。
 * - `applied`：实际写入 <html data-theme> 的主题；system 时由系统偏好解析而来。
 * 启动时 ensureLoaded 拉取持久值；设为 system 时监听 prefers-color-scheme，
 * 系统深浅切换即自动跟随（refreshSystem）。
 */
interface ThemeState {
  mode: ThemeMode
  applied: AppliedTheme
  /** 启动加载一次持久化的主题选项。 */
  ensureLoaded: () => Promise<void>
  /** 持久化并应用用户选择的主题选项。 */
  setMode: (mode: ThemeMode) => Promise<void>
  /** 跟随系统模式下重算并应用（供 prefers-color-scheme 变化时调用）。 */
  refreshSystem: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: DEFAULT_MODE,
  applied: resolveApplied(DEFAULT_MODE),

  ensureLoaded: async () => {
    try {
      const stored = await callService<string>('SystemService', 'GetTheme')
      const mode = stored && isThemeMode(stored) ? stored : DEFAULT_MODE
      const applied = resolveApplied(mode)
      set({ mode, applied })
      applyThemeToDocument(applied)
    } catch (err) {
      // 加载失败时保留默认主题，避免启动阶段反复拉取
      console.error('[themeStore] ensureLoaded failed, using default:', err)
    }
  },

  setMode: async (mode) => {
    const applied = resolveApplied(mode)
    try {
      await callService('SystemService', 'SetTheme', mode)
    } catch (err) {
      // 持久化失败不影响本次生效
      console.error('[themeStore] setMode persist failed (theme still applied):', err)
    }
    set({ mode, applied })
    applyThemeToDocument(applied)
  },

  refreshSystem: () => {
    if (get().mode !== 'system') return
    const applied = resolveApplied('system')
    set({ applied })
    applyThemeToDocument(applied)
  },
}))