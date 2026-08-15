import { create } from 'zustand'
import { callService } from '../services/backend'
import {
  DEFAULT_LAYOUT_SETTINGS,
  type LayoutPresetSettings,
} from '../lib/layoutPresets'

/**
 * User-customizable layout tier lists (page margins + section spacing),
 * persisted via SystemService.Get/SetLayoutPresets (config.json).
 *
 * Loaded once at app start; consumers (LayoutPopover, usePreview,
 * ResumeListDrawer) read the current lists so custom tiers take effect
 * everywhere. Falls back to built-in defaults until loaded.
 */
interface LayoutSettingsState {
  margins: LayoutPresetSettings['margins']
  spacings: LayoutPresetSettings['spacings']
  loaded: boolean
  /** Loads presets from the backend (no-op after the first success). */
  ensureLoaded: () => Promise<void>
  /** Force-reload from the backend. */
  reload: () => Promise<void>
  /** Validates and persists a new configuration, then updates state. */
  save: (cfg: LayoutPresetSettings) => Promise<void>
  /** Restores the built-in default tiers. */
  reset: () => Promise<void>
}

export const useLayoutSettingsStore = create<LayoutSettingsState>((set, get) => ({
  margins: DEFAULT_LAYOUT_SETTINGS.margins,
  spacings: DEFAULT_LAYOUT_SETTINGS.spacings,
  loaded: false,

  ensureLoaded: async () => {
    if (get().loaded) return
    await get().reload()
  },

  reload: async () => {
    const cfg = await callService<LayoutPresetSettings>(
      'SystemService',
      'GetLayoutPresets',
    )
    if (cfg?.margins?.length && cfg?.spacings?.length) {
      set({ margins: cfg.margins, spacings: cfg.spacings, loaded: true })
    } else {
      set({ loaded: true })
    }
  },

  save: async (cfg) => {
    await callService('SystemService', 'SetLayoutPresets', cfg)
    set({ margins: cfg.margins, spacings: cfg.spacings, loaded: true })
  },

  reset: async () => {
    await callService('SystemService', 'ResetLayoutPresets')
    set({
      margins: DEFAULT_LAYOUT_SETTINGS.margins,
      spacings: DEFAULT_LAYOUT_SETTINGS.spacings,
      loaded: true,
    })
  },
}))
