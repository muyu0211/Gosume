import { create } from 'zustand'

/** 右边栏（样式排版面板）可调节宽度范围。 */
export const STYLE_PANEL_MIN_WIDTH = 240
export const STYLE_PANEL_MAX_WIDTH = 420
export const STYLE_PANEL_DEFAULT_WIDTH = 300

interface EditorState {
  activeSection: string
  zoom: number
  splitRatio: number
  flashSection: string | null
  flashNonce: number
  stylePanelOpen: boolean
  stylePanelWidth: number

  setActiveSection: (section: string) => void
  jumpToSection: (section: string) => void
  setZoom: (zoom: number) => void
  setSplitRatio: (ratio: number) => void
  toggleStylePanel: () => void
  setStylePanelWidth: (width: number) => void
}

export const useEditorStore = create<EditorState>((set) => ({
  activeSection: 'personal',
  zoom: 1.0,
  splitRatio: 0.4,
  flashSection: null,
  flashNonce: 0,
  stylePanelOpen: false,
  stylePanelWidth: STYLE_PANEL_DEFAULT_WIDTH,

  setActiveSection: (section) => set({ activeSection: section }),
  jumpToSection: (section) =>
    set((s) => ({ activeSection: section, flashSection: section, flashNonce: s.flashNonce + 1 })),
  setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(2.0, zoom)) }),
  setSplitRatio: (ratio) => set({ splitRatio: Math.max(0.3, Math.min(0.7, ratio)) }),
  toggleStylePanel: () => set((s) => ({ stylePanelOpen: !s.stylePanelOpen })),
  setStylePanelWidth: (width) =>
    set({ stylePanelWidth: Math.max(STYLE_PANEL_MIN_WIDTH, Math.min(STYLE_PANEL_MAX_WIDTH, width)) }),
}))
