import { create } from 'zustand'
import type { TemplateMeta } from '../types/template'

interface TemplateState {
  templates: TemplateMeta[]
  activeTemplateId: string | null

  setTemplates: (templates: TemplateMeta[]) => void
  setActiveTemplate: (id: string) => void
}

export const useTemplateStore = create<TemplateState>((set) => ({
  templates: [],
  activeTemplateId: 'modern',

  setTemplates: (templates) => set({ templates }),
  setActiveTemplate: (id) => set({ activeTemplateId: id }),
}))
