import { create } from 'zustand'
import type { Resume, Personal, Job, Internship, Education, SkillGroup, Project, Language, Award, ResumeListItem, ExtraField } from '../types/resume'
import { createEmptyResume, generateId } from '../types/resume'
import { callService } from '../services/backend'

interface ResumeState {
  resume: Resume | null
  isDirty: boolean
  filePath: string | null
  previewHtml: string
  isPreviewLoading: boolean
  resumeList: ResumeListItem[]
  currentId: string | null

  clearResume: () => void
  newResume: (templateId: string) => Promise<void>
  setResume: (resume: Resume) => void
  updateField: (path: string, value: unknown) => void
  markSaved: (filePath?: string) => void
  setPreviewHtml: (html: string) => void
  setPreviewLoading: (loading: boolean) => void
  setResumeList: (list: ResumeListItem[]) => void
  loadResume: (id: string) => Promise<Resume | null>
  saveCurrent: () => Promise<void>
  deleteResume: (id: string) => Promise<void>

  // Array operations
  addInternship: () => void
  updateInternship: (index: number, internship: Partial<Internship>) => void
  removeInternship: (index: number) => void
  addJob: () => void
  updateJob: (index: number, job: Partial<Job>) => void
  removeJob: (index: number) => void
  addEducation: () => void
  updateEducation: (index: number, edu: Partial<Education>) => void
  removeEducation: (index: number) => void
  addSkillGroup: () => void
  updateSkillGroup: (index: number, group: Partial<SkillGroup>) => void
  removeSkillGroup: (index: number) => void
  addProject: () => void
  updateProject: (index: number, proj: Partial<Project>) => void
  removeProject: (index: number) => void
  updateProjectExtras: (index: number, extras: ExtraField[]) => void
  moveProjectExtra: (projectIndex: number, from: number, to: number) => void

  moveInternship: (from: number, to: number) => void
  moveJob: (from: number, to: number) => void
  moveEducation: (from: number, to: number) => void
  moveSkillGroup: (from: number, to: number) => void
  moveProject: (from: number, to: number) => void
  moveLanguage: (from: number, to: number) => void
  moveAward: (from: number, to: number) => void

  addLanguage: () => void
  updateLanguage: (index: number, lang: Partial<Language>) => void
  removeLanguage: (index: number) => void
  addAward: () => void
  updateAward: (index: number, award: Partial<Award>) => void
  removeAward: (index: number) => void
}

export const useResumeStore = create<ResumeState>((set, get) => ({
  resume: null,
  isDirty: false,
  filePath: null,
  previewHtml: '',
  isPreviewLoading: false,
  resumeList: [],
  currentId: null,

  clearResume: () => set({ resume: null, isDirty: false, filePath: null, previewHtml: '', currentId: null }),

  newResume: async (templateId) => {
    try {
      const resume = await callService<Resume>('ResumeService', 'NewResume', templateId, 'zh-CN')
      if (resume) {
        const id = await callService<string>('ResumeService', 'GetCurrentID')
        console.log('[resumeStore] newResume: backend OK, currentId =', id || '(empty)')
        set({ resume, isDirty: false, filePath: null, currentId: id || null })
        return
      }
    } catch (err) {
      console.error('[resumeStore] newResume: backend failed, using local fallback:', err)
    }
    set({ resume: createEmptyResume(templateId), isDirty: false, filePath: null, currentId: null })
  },

  setResume: (resume) => set({ resume, isDirty: false, previewHtml: '' }),

  updateField: (path, value) => {
    const resume = get().resume
    if (!resume) return
    // @ts-ignore
    setByPath(resume, path, value)
    set({ resume: { ...resume }, isDirty: true })
  },

  markSaved: (filePath) => set((s) => ({ isDirty: false, filePath: filePath || s.filePath })),

  setPreviewHtml: (html) => set({ previewHtml: html }),
  setPreviewLoading: (loading) => set({ isPreviewLoading: loading }),

  setResumeList: (list) => set({ resumeList: list }),

  loadResume: async (id) => {
    try {
      const resume = await callService<Resume>('ResumeService', 'LoadResume', id)
      if (resume) {
        set({ resume, isDirty: false, currentId: id, previewHtml: '' })
        return resume
      }
    } catch (err) {
      console.error('Failed to load resume:', err)
    }
    return null
  },

  saveCurrent: async () => {
    try {
      console.trace('[resumeStore] saveCurrent: CALL STACK - who called saveCurrent?')
      await callService('ResumeService', 'ExplicitSave')
      const id = await callService<string>('ResumeService', 'GetCurrentID')
      console.log('[resumeStore] saveCurrent: done, new currentId =', id || '(empty)')
      set({ isDirty: false, currentId: id || null })
    } catch (err) {
      console.error('SaveCurrent failed:', err)
    }
  },

  deleteResume: async (id) => {
    try {
      await callService('ResumeService', 'DeleteResume', id)
      set((s) => ({
        resumeList: s.resumeList.filter((r) => r.id !== id),
        currentId: s.currentId === id ? null : s.currentId,
        resume: s.currentId === id ? null : s.resume,
      }))
    } catch (err) {
      console.error('DeleteResume failed:', err)
    }
  },

  addInternship: () => {
    const resume = get().resume
    if (!resume) return
    const internship: Internship = {
      id: generateId(),
      company: '',
      title: '',
      start_date: '',
      is_current: false,
      highlights: [],
    }
    set({ resume: { ...resume, internships: [...(resume.internships || []), internship] }, isDirty: true })
  },

  updateInternship: (index, internship) => {
    const resume = get().resume
    if (!resume?.internships) return
    const internships = [...resume.internships]
    internships[index] = { ...internships[index], ...internship }
    set({ resume: { ...resume, internships }, isDirty: true })
  },

  removeInternship: (index) => {
    const resume = get().resume
    if (!resume?.internships) return
    set({ resume: { ...resume, internships: resume.internships.filter((_, i) => i !== index) }, isDirty: true })
  },

  addJob: () => {
    const resume = get().resume
    if (!resume) return
    const job: Job = {
      id: generateId(),
      company: '',
      title: '',
      start_date: '',
      is_current: false,
      highlights: [],
    }
    set({ resume: { ...resume, jobs: [...(resume.jobs || []), job] }, isDirty: true })
  },

  updateJob: (index, job) => {
    const resume = get().resume
    if (!resume?.jobs) return
    const jobs = [...resume.jobs]
    jobs[index] = { ...jobs[index], ...job }
    set({ resume: { ...resume, jobs }, isDirty: true })
  },

  removeJob: (index) => {
    const resume = get().resume
    if (!resume?.jobs) return
    set({ resume: { ...resume, jobs: resume.jobs.filter((_, i) => i !== index) }, isDirty: true })
  },

  addEducation: () => {
    const resume = get().resume
    if (!resume) return
    const edu: Education = {
      id: generateId(),
      school: '',
      degree: '',
      major: '',
      start_date: '',
      end_date: '',
    }
    set({ resume: { ...resume, education: [...(resume.education || []), edu] }, isDirty: true })
  },

  updateEducation: (index, edu) => {
    const resume = get().resume
    if (!resume?.education) return
    const education = [...resume.education]
    education[index] = { ...education[index], ...edu }
    set({ resume: { ...resume, education }, isDirty: true })
  },

  removeEducation: (index) => {
    const resume = get().resume
    if (!resume?.education) return
    set({ resume: { ...resume, education: resume.education.filter((_, i) => i !== index) }, isDirty: true })
  },

  addSkillGroup: () => {
    const resume = get().resume
    if (!resume) return
    const group: SkillGroup = { id: generateId(), category: '', items: [] }
    set({ resume: { ...resume, skills: [...(resume.skills || []), group] }, isDirty: true })
  },

  updateSkillGroup: (index, group) => {
    const resume = get().resume
    if (!resume?.skills) return
    const skills = [...resume.skills]
    skills[index] = { ...skills[index], ...group }
    set({ resume: { ...resume, skills }, isDirty: true })
  },

  removeSkillGroup: (index) => {
    const resume = get().resume
    if (!resume?.skills) return
    set({ resume: { ...resume, skills: resume.skills.filter((_, i) => i !== index) }, isDirty: true })
  },

  addProject: () => {
    const resume = get().resume
    if (!resume) return
    const proj: Project = { id: generateId(), name: '', highlights: [], extras: [] }
    set({ resume: { ...resume, projects: [...(resume.projects || []), proj] }, isDirty: true })
  },

  updateProject: (index, proj) => {
    const resume = get().resume
    if (!resume?.projects) return
    const projects = [...resume.projects]
    projects[index] = { ...projects[index], ...proj }
    set({ resume: { ...resume, projects }, isDirty: true })
  },

  removeProject: (index) => {
    const resume = get().resume
    if (!resume?.projects) return
    set({ resume: { ...resume, projects: resume.projects.filter((_, i) => i !== index) }, isDirty: true })
  },

  updateProjectExtras: (index, extras) => {
    const resume = get().resume
    if (!resume?.projects) return
    const projects = [...resume.projects]
    projects[index] = { ...projects[index], extras }
    set({ resume: { ...resume, projects }, isDirty: true })
  },

  moveProjectExtra: (projectIndex, from, to) => {
    const resume = get().resume
    if (!resume?.projects) return
    const project = resume.projects[projectIndex]
    if (!project?.extras) return
    const extras = [...project.extras]
    const [item] = extras.splice(from, 1)
    extras.splice(to, 0, item)
    const projects = [...resume.projects]
    projects[projectIndex] = { ...project, extras }
    set({ resume: { ...resume, projects }, isDirty: true })
  },

  moveInternship: (from, to) => {
    const resume = get().resume
    if (!resume?.internships) return
    const internships = [...resume.internships]
    const [item] = internships.splice(from, 1)
    internships.splice(to, 0, item)
    set({ resume: { ...resume, internships }, isDirty: true })
  },

  moveJob: (from, to) => {
    const resume = get().resume
    if (!resume?.jobs) return
    const jobs = [...resume.jobs]
    const [item] = jobs.splice(from, 1)
    jobs.splice(to, 0, item)
    set({ resume: { ...resume, jobs }, isDirty: true })
  },

  moveEducation: (from, to) => {
    const resume = get().resume
    if (!resume?.education) return
    const education = [...resume.education]
    const [item] = education.splice(from, 1)
    education.splice(to, 0, item)
    set({ resume: { ...resume, education }, isDirty: true })
  },

  moveSkillGroup: (from, to) => {
    const resume = get().resume
    if (!resume?.skills) return
    const skills = [...resume.skills]
    const [item] = skills.splice(from, 1)
    skills.splice(to, 0, item)
    set({ resume: { ...resume, skills }, isDirty: true })
  },

  moveProject: (from, to) => {
    const resume = get().resume
    if (!resume?.projects) return
    const projects = [...resume.projects]
    const [item] = projects.splice(from, 1)
    projects.splice(to, 0, item)
    set({ resume: { ...resume, projects }, isDirty: true })
  },

  moveLanguage: (from, to) => {
    const resume = get().resume
    if (!resume?.languages) return
    const languages = [...resume.languages]
    const [item] = languages.splice(from, 1)
    languages.splice(to, 0, item)
    set({ resume: { ...resume, languages }, isDirty: true })
  },

  moveAward: (from, to) => {
    const resume = get().resume
    if (!resume?.awards) return
    const awards = [...resume.awards]
    const [item] = awards.splice(from, 1)
    awards.splice(to, 0, item)
    set({ resume: { ...resume, awards }, isDirty: true })
  },

  addLanguage: () => {
    const resume = get().resume
    if (!resume) return
    const lang: Language = { id: generateId(), name: '', level: '' }
    set({ resume: { ...resume, languages: [...(resume.languages || []), lang] }, isDirty: true })
  },

  updateLanguage: (index, lang) => {
    const resume = get().resume
    if (!resume?.languages) return
    const languages = [...resume.languages]
    languages[index] = { ...languages[index], ...lang }
    set({ resume: { ...resume, languages }, isDirty: true })
  },

  removeLanguage: (index) => {
    const resume = get().resume
    if (!resume?.languages) return
    set({ resume: { ...resume, languages: resume.languages.filter((_, i) => i !== index) }, isDirty: true })
  },

  addAward: () => {
    const resume = get().resume
    if (!resume) return
    const award: Award = { id: generateId(), title: '', date: '' }
    set({ resume: { ...resume, awards: [...(resume.awards || []), award] }, isDirty: true })
  },

  updateAward: (index, award) => {
    const resume = get().resume
    if (!resume?.awards) return
    const awards = [...resume.awards]
    awards[index] = { ...awards[index], ...award }
    set({ resume: { ...resume, awards }, isDirty: true })
  },

  removeAward: (index) => {
    const resume = get().resume
    if (!resume?.awards) return
    set({ resume: { ...resume, awards: resume.awards.filter((_, i) => i !== index) }, isDirty: true })
  },
}))

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  let current: Record<string, unknown> = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    const match = part.match(/^(.+)\[(\d+)\]$/)
    if (match) {
      const name = match[1]
      const idx = parseInt(match[2])
      if (!current[name]) current[name] = []
      current = (current[name] as Record<string, unknown>[])[idx]
    } else {
      if (!current[part]) current[part] = {}
      current = current[part] as Record<string, unknown>
    }
  }
  const lastPart = parts[parts.length - 1]
  const match = lastPart.match(/^(.+)\[(\d+)\]$/)
  if (match) {
    const name = match[1]
    const idx = parseInt(match[2])
    const arr = (current[name] as Record<string, unknown>[]) || []
    if (arr[idx]) {
      arr[idx] = { ...arr[idx], ...(value as Record<string, unknown>) }
    }
  } else {
    current[lastPart] = value
  }
}
