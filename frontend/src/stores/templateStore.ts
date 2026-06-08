import { create } from 'zustand'
import type { TemplateMeta } from '../types/template'

interface TemplateState {
  templates: TemplateMeta[]
  activeTemplateId: string | null
  thumbnails: Record<string, string>

  setTemplates: (templates: TemplateMeta[]) => void
  setActiveTemplate: (id: string) => void
  setThumbnails: (thumbnails: Record<string, string>) => void
}

export const useTemplateStore = create<TemplateState>((set) => ({
  templates: [],
  activeTemplateId: 'modern',
  thumbnails: {},

  setTemplates: (templates) => set({ templates }),
  setActiveTemplate: (id) => set({ activeTemplateId: id }),
  setThumbnails: (thumbnails) => set({ thumbnails }),
}))
