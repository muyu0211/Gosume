import { create } from 'zustand'

interface EditorState {
  activeSection: string
  zoom: number
  splitRatio: number

  setActiveSection: (section: string) => void
  setZoom: (zoom: number) => void
  setSplitRatio: (ratio: number) => void
}

export const useEditorStore = create<EditorState>((set) => ({
  activeSection: 'personal',
  zoom: 1.0,
  splitRatio: 0.4,

  setActiveSection: (section) => set({ activeSection: section }),
  setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(2.0, zoom)) }),
  setSplitRatio: (ratio) => set({ splitRatio: Math.max(0.3, Math.min(0.7, ratio)) }),
}))
