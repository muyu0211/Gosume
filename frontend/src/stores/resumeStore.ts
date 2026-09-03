import { create, type StoreApi } from 'zustand'
import type { Resume, Personal, Job, Internship, Education, SkillGroup, Project, Language, Award, ResumeListItem, ExtraField, CustomSection, CustomItem } from '../types/resume'
import { createEmptyResume, generateId, migratePersonalSummary } from '../types/resume'
import { callService, isWails } from '../services/backend'
import { paginateHTMLString } from '../lib/exportHtml'
import { renderTemplate } from '../lib/templateEngine'
import { loadTemplateContent } from '../services/templateService'
import { injectLayoutCss, injectAvatarSizeCss } from '../lib/layoutPresets'
import { useTemplateStore } from './templateStore'
import { useLayoutStore } from './layoutStore'

/** 回退模板 ID（与 usePreview / templateStore 默认值一致）。 */
const DEFAULT_TEMPLATE_ID = 'a406004d-d3b8-4900-969f-8094f8e85cf0'

/** 简历内容条目的种类，用于删除二次确认的文案与分发。 */
export type ItemDeleteKind = 'internship' | 'job' | 'education' | 'skill' | 'project' | 'language' | 'award' | 'custom'

/** 含「关键亮点」子项的顶层条目类型。 */
export type HighlightSection = 'job' | 'internship' | 'project' | 'education'

/**
 * 待确认的删除目标（顶层条目或二级子项）。
 * - item: 顶层条目（实习/工作/项目/教育/技能分组/语言/奖项/自定义模块）
 * - skillItem: 技能分组内的单个技能
 * - highlight: 经历/项目/教育内的「关键亮点」
 * - extra: 项目内的「扩展字段」
 * - customItem: 自定义模块内的单个条目
 * - customHighlight: 自定义条目内的「关键亮点」
 */
export type PendingItemDelete =
  | { type: 'item'; kind: ItemDeleteKind; index: number }
  | { type: 'skillItem'; groupIndex: number; skillIndex: number }
  | { type: 'highlight'; section: HighlightSection; itemIndex: number; highlightIndex: number }
  | { type: 'extra'; projectIndex: number; extraIndex: number }
  | { type: 'customItem'; sectionIndex: number; itemIndex: number }
  | { type: 'customHighlight'; sectionIndex: number; itemIndex: number; highlightIndex: number }

interface ResumeState {
  resume: Resume | null
  isDirty: boolean
  filePath: string | null
  previewHtml: string
  isPreviewLoading: boolean
  resumeList: ResumeListItem[]
  currentId: string | null
  avatarRenderedSize: { width: number; height: number } | null
  /** 最近一次保存后测量的内容真实高度（CSS px）；null 表示尚未测量。 */
  contentHeight: number | null

  clearResume: () => void
  newResume: (templateId: string) => Promise<void>
  setResume: (resume: Resume) => void
  updateField: (path: string, value: unknown) => void
  markSaved: (filePath?: string) => void
  setPreviewHtml: (html: string) => void
  setPreviewLoading: (loading: boolean) => void
  setAvatarRenderedSize: (size: { width: number; height: number } | null) => void
  setResumeList: (list: ResumeListItem[]) => void
  loadResume: (id: string) => Promise<Resume | null>
  saveCurrent: () => Promise<boolean>
  deleteResume: (id: string) => Promise<void>
  /** 请求后端测量当前内容真实高度并缓存到 contentHeight；失败返回 null。 */
  measureContentHeight: () => Promise<number | null>

  // 未保存更改守卫（离开编辑页 / 关闭窗口前的二确）
  // pendingLeave 挂起待执行的离开动作；savingOnLeave 表示「保存并继续」进行中。
  pendingLeave: (() => void) | null
  savingOnLeave: boolean
  requestLeave: (handler: () => void) => void
  cancelLeave: () => void
  confirmLeaveSave: () => Promise<void>
  discardLeave: () => void

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

  // 自定义模块（模块级 + 条目级）
  addCustomSection: () => void
  updateCustomSection: (index: number, section: Partial<CustomSection>) => void
  removeCustomSection: (index: number) => void
  moveCustomSection: (from: number, to: number) => void
  addCustomItem: (sectionIndex: number) => void
  updateCustomItem: (sectionIndex: number, itemIndex: number, item: Partial<CustomItem>) => void
  moveCustomItem: (sectionIndex: number, from: number, to: number) => void

  // 条目删除二次确认（会话级，仅内存态，不持久化到后端）
  skipItemDeleteConfirm: boolean
  pendingItemDelete: PendingItemDelete | null
  setSkipItemDeleteConfirm: (v: boolean) => void
  requestItemDelete: (kind: ItemDeleteKind, index: number) => void
  requestSkillItemDelete: (groupIndex: number, skillIndex: number) => void
  requestHighlightDelete: (section: HighlightSection, itemIndex: number, highlightIndex: number) => void
  requestExtraDelete: (projectIndex: number, extraIndex: number) => void
  requestCustomItemDelete: (sectionIndex: number, itemIndex: number) => void
  requestCustomHighlightDelete: (sectionIndex: number, itemIndex: number, highlightIndex: number) => void
  confirmItemDelete: () => void
  cancelItemDelete: () => void
}

export const useResumeStore = create<ResumeState>((set, get) => ({
  resume: null,
  isDirty: false,
  filePath: null,
  previewHtml: '',
  isPreviewLoading: false,
  resumeList: [],
  currentId: null,
  avatarRenderedSize: null,
  contentHeight: null,
  pendingLeave: null,
  savingOnLeave: false,

  clearResume: () => set({ resume: null, isDirty: false, filePath: null, previewHtml: '', currentId: null, avatarRenderedSize: null, contentHeight: null }),

  newResume: async (templateId) => {
    try {
      const resume = await callService<Resume>('ResumeService', 'NewResume', templateId, 'zh-CN')
      if (resume) {
        const id = await callService<string>('ResumeService', 'GetTemplateID')
        console.log('[resumeStore] newResume: backend OK, currentId =', id || '(empty)')
        set({ resume, isDirty: false, filePath: null, currentId: id || null, contentHeight: null })
        return
      }
    } catch (err) {
      console.error('[resumeStore] newResume: backend failed, using local fallback:', err)
    }
    set({ resume: createEmptyResume(templateId), isDirty: false, filePath: null, currentId: null, contentHeight: null })
  },

  setResume: (resume) => set({ resume, isDirty: false, previewHtml: '', avatarRenderedSize: null, contentHeight: null }),

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
  setAvatarRenderedSize: (size) => set({ avatarRenderedSize: size }),

  setResumeList: (list) => set({ resumeList: list }),

  loadResume: async (id) => {
    try {
      const resume = await callService<Resume>('ResumeService', 'LoadResume', id)
      if (resume) {
        const migrated = migratePersonalSummary(resume)
        set({ resume: migrated, isDirty: false, currentId: id, previewHtml: '', avatarRenderedSize: null, contentHeight: null })
        return migrated
      }
    } catch (err) {
      console.error('Failed to load resume:', err)
    }
    return null
  },

  saveCurrent: async () => {
    // 无内容修改且已持久化：后端数据已是最新，直接视为保存成功，不发起任何
    // 后端请求（防频繁点击；后端保存还会触发内容高度测量，开销较大）。
    // 新建简历（currentId 为空）不受影响——首次保存必须真实落库。
    if (!get().isDirty && get().currentId) {
      return true
    }
    try {
      console.trace('[resumeStore] saveCurrent: CALL STACK - who called saveCurrent?')
      // 先把前端最新的简历数据同步到后端内存态，再持久化。
      // 后端 ExplicitSave 写入的是内存态 current，缺少此步会落库为过期数据。
      const resume = get().resume
      if (resume) {
        await callService('ResumeService', 'SetResume', resume)
      }
      await callService('ResumeService', 'ExplicitSave')
      const id = await callService<string>('ResumeService', 'GetTemplateID')
      console.log('[resumeStore] saveCurrent: done, new currentId =', id || '(empty)')
      set({ isDirty: false, currentId: id || null })
      // 保存成功后异步测量内容真实高度（用于一页导出可行性提示），不阻塞保存流程
      get().measureContentHeight()
      return true
    } catch (err) {
      console.error('SaveCurrent failed:', err)
      return false
    }
  },

  measureContentHeight: async () => {
    // 非桌面环境（无 Wails 后端）直接跳过，避免无意义的分页渲染
    if (!isWails()) return null
    try {
      const resume = get().resume
      if (!resume) return null

      // 测量前确保全局布局已加载（页边距/内容间距影响内容高度），
      // 保证首次进入编辑页的测量与保存后的测量口径一致。
      await useLayoutStore.getState().ensureLoaded()

      // 关键：不能用滞后的 previewHtml——预览渲染是 300ms 防抖异步
      // （usePreview.debouncedRefresh），快速编辑后立即保存时 previewHtml
      // 可能还是旧内容，导致测量结果与当前 resume 不一致（如取消隐藏后
      // 仍测出隐藏前的高度）。这里用当前 resume 现场渲染（与预览同一渲染
      // 链路：renderTemplate → 布局 CSS → 头像尺寸 CSS），保证测量内容
      // 与保存内容严格一致。
      const templateId = useTemplateStore.getState().activeTemplateId || DEFAULT_TEMPLATE_ID
      const tmpl = await loadTemplateContent(templateId)
      const rendered = renderTemplate(tmpl, resume)
      const html = injectLayoutCss(rendered, useLayoutStore.getState().layout)
      const htmlWithAvatar = injectAvatarSizeCss(html, resume.personal)
      const paginated = await paginateHTMLString(htmlWithAvatar, 'continuous')
      const h = await callService<number>(
        'ExportService',
        'GetResumeContentHeight',
        paginated,
        1.0,
      )
      if (typeof h === 'number' && h > 0) {
        set({ contentHeight: h })
        return h
      }
      return null
    } catch (err) {
      // 测量失败不影响主流程（后端未加载简历 / 浏览器不可用时静默跳过）
      console.warn('[resumeStore] measure content height failed:', err)
      return null
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

  // ── 自定义模块（模块级 + 条目级） ─────────────────────────────────────────
  addCustomSection: () => {
    const resume = get().resume
    if (!resume) return
    // 新建模块默认携带一个空条目，避免用户找不到"添加条目"入口
    const section: CustomSection = { id: generateId(), title: '', items: [{ id: generateId(), title: '' }] }
    set({ resume: { ...resume, custom: [...(resume.custom || []), section] }, isDirty: true })
  },

  updateCustomSection: (index, section) => {
    const resume = get().resume
    if (!resume?.custom) return
    const custom = [...resume.custom]
    custom[index] = { ...custom[index], ...section }
    set({ resume: { ...resume, custom }, isDirty: true })
  },

  removeCustomSection: (index) => {
    const resume = get().resume
    if (!resume?.custom) return
    set({ resume: { ...resume, custom: resume.custom.filter((_, i) => i !== index) }, isDirty: true })
  },

  moveCustomSection: (from, to) => {
    const resume = get().resume
    if (!resume?.custom) return
    const custom = [...resume.custom]
    const [item] = custom.splice(from, 1)
    custom.splice(to, 0, item)
    set({ resume: { ...resume, custom }, isDirty: true })
  },

  addCustomItem: (sectionIndex) => {
    const resume = get().resume
    const section = resume?.custom?.[sectionIndex]
    if (!resume || !section) return
    const item: CustomItem = { id: generateId(), title: '' }
    const custom = [...(resume.custom || [])]
    custom[sectionIndex] = { ...section, items: [...(section.items || []), item] }
    set({ resume: { ...resume, custom }, isDirty: true })
  },

  updateCustomItem: (sectionIndex, itemIndex, item) => {
    const resume = get().resume
    const section = resume?.custom?.[sectionIndex]
    if (!resume || !section) return
    const items = [...(section.items || [])]
    items[itemIndex] = { ...items[itemIndex], ...item }
    const custom = [...(resume.custom || [])]
    custom[sectionIndex] = { ...section, items }
    set({ resume: { ...resume, custom }, isDirty: true })
  },

  moveCustomItem: (sectionIndex, from, to) => {
    const resume = get().resume
    const section = resume?.custom?.[sectionIndex]
    if (!resume || !section) return
    const items = [...(section.items || [])]
    const [item] = items.splice(from, 1)
    items.splice(to, 0, item)
    const custom = [...(resume.custom || [])]
    custom[sectionIndex] = { ...section, items }
    set({ resume: { ...resume, custom }, isDirty: true })
  },

  // 条目删除二次确认（会话级）
  skipItemDeleteConfirm: false,
  pendingItemDelete: null,

  setSkipItemDeleteConfirm: (v) => set({ skipItemDeleteConfirm: v }),

  requestItemDelete: (kind, index) => {
    requestPending(get, set, { type: 'item', kind, index })
  },

  requestSkillItemDelete: (groupIndex, skillIndex) => {
    requestPending(get, set, { type: 'skillItem', groupIndex, skillIndex })
  },

  requestHighlightDelete: (section, itemIndex, highlightIndex) => {
    requestPending(get, set, { type: 'highlight', section, itemIndex, highlightIndex })
  },

  requestExtraDelete: (projectIndex, extraIndex) => {
    requestPending(get, set, { type: 'extra', projectIndex, extraIndex })
  },

  requestCustomItemDelete: (sectionIndex, itemIndex) => {
    requestPending(get, set, { type: 'customItem', sectionIndex, itemIndex })
  },

  requestCustomHighlightDelete: (sectionIndex, itemIndex, highlightIndex) => {
    requestPending(get, set, { type: 'customHighlight', sectionIndex, itemIndex, highlightIndex })
  },

  confirmItemDelete: () => {
    const pending = get().pendingItemDelete
    if (!pending) return
    applyPendingDelete(get(), pending)
    set({ pendingItemDelete: null })
  },

  cancelItemDelete: () => set({ pendingItemDelete: null }),

  // ── 未保存更改守卫 ────────────────────────────────────────────────────────
  // 有未保存更改时挂起离开动作并弹出二确；无未保存更改时立即执行。
  requestLeave: (handler) => {
    if (!get().isDirty) {
      handler()
      return
    }
    set({ pendingLeave: handler, savingOnLeave: false })
  },

  // 关闭二确弹窗（不执行挂起的离开动作）。
  cancelLeave: () => set({ pendingLeave: null, savingOnLeave: false }),

  // 「保存并继续」：先保存，成功后再执行挂起的离开动作；保存失败保持弹窗。
  confirmLeaveSave: async () => {
    const handler = get().pendingLeave
    if (!handler) return
    set({ savingOnLeave: true })
    const ok = await get().saveCurrent()
    if (!ok) {
      // 保存失败：保持弹窗，用户可改选「不保存并继续」
      set({ savingOnLeave: false })
      return
    }
    set({ pendingLeave: null, savingOnLeave: false })
    handler()
  },

  // 「不保存并继续」：直接执行挂起的离开动作。
  discardLeave: () => {
    const handler = get().pendingLeave
    set({ pendingLeave: null, savingOnLeave: false })
    if (handler) handler()
  },
}))

// requestPending 统一处理删除请求：已勾选「本次不再提示」则直接执行，否则进入待确认。
function requestPending(
  get: StoreApi<ResumeState>['getState'],
  set: StoreApi<ResumeState>['setState'],
  target: PendingItemDelete,
): void {
  if (get().skipItemDeleteConfirm) {
    applyPendingDelete(get(), target)
    return
  }
  set({ pendingItemDelete: target })
}

// applyPendingDelete 按目标类型分发执行删除。
function applyPendingDelete(state: ResumeState, target: PendingItemDelete): void {
  switch (target.type) {
    case 'item':
      removeItemByKind(state, target.kind, target.index)
      break
    case 'skillItem':
      removeSkillItem(state, target.groupIndex, target.skillIndex)
      break
    case 'highlight':
      removeHighlight(state, target.section, target.itemIndex, target.highlightIndex)
      break
    case 'extra':
      removeExtra(state, target.projectIndex, target.extraIndex)
      break
    case 'customItem':
      removeCustomItem(state, target.sectionIndex, target.itemIndex)
      break
    case 'customHighlight':
      removeCustomHighlight(state, target.sectionIndex, target.itemIndex, target.highlightIndex)
      break
  }
}

// removeItemByKind 按条目类型分发到对应的 remove 方法，供删除确认流程复用。
function removeItemByKind(state: ResumeState, kind: ItemDeleteKind, index: number): void {
  switch (kind) {
    case 'internship':
      state.removeInternship(index)
      break
    case 'job':
      state.removeJob(index)
      break
    case 'education':
      state.removeEducation(index)
      break
    case 'skill':
      state.removeSkillGroup(index)
      break
    case 'project':
      state.removeProject(index)
      break
    case 'language':
      state.removeLanguage(index)
      break
    case 'award':
      state.removeAward(index)
      break
    case 'custom':
      state.removeCustomSection(index)
      break
  }
}

// removeSkillItem 删除技能分组内的单个技能。
function removeSkillItem(state: ResumeState, groupIndex: number, skillIndex: number): void {
  const resume = state.resume
  const group = resume?.skills?.[groupIndex]
  if (!group) return
  state.updateSkillGroup(groupIndex, { items: group.items.filter((_, i) => i !== skillIndex) })
}

// removeHighlight 删除经历/项目/教育内的关键亮点。
function removeHighlight(
  state: ResumeState,
  section: HighlightSection,
  itemIndex: number,
  highlightIndex: number,
): void {
  const resume = state.resume
  if (!resume) return
  let highlights: string[] | undefined
  switch (section) {
    case 'job':
      highlights = resume.jobs?.[itemIndex]?.highlights
      break
    case 'internship':
      highlights = resume.internships?.[itemIndex]?.highlights
      break
    case 'project':
      highlights = resume.projects?.[itemIndex]?.highlights
      break
    case 'education':
      highlights = resume.education?.[itemIndex]?.highlights
      break
  }
  if (!highlights) return
  const next = highlights.filter((_, i) => i !== highlightIndex)
  switch (section) {
    case 'job':
      state.updateJob(itemIndex, { highlights: next })
      break
    case 'internship':
      state.updateInternship(itemIndex, { highlights: next })
      break
    case 'project':
      state.updateProject(itemIndex, { highlights: next })
      break
    case 'education':
      state.updateEducation(itemIndex, { highlights: next })
      break
  }
}

// removeExtra 删除项目内的扩展字段。
function removeExtra(state: ResumeState, projectIndex: number, extraIndex: number): void {
  const project = state.resume?.projects?.[projectIndex]
  if (!project?.extras) return
  state.updateProjectExtras(projectIndex, project.extras.filter((_, i) => i !== extraIndex))
}

// removeCustomItem 删除自定义模块内的单个条目。
function removeCustomItem(state: ResumeState, sectionIndex: number, itemIndex: number): void {
  const section = state.resume?.custom?.[sectionIndex]
  if (!section) return
  state.updateCustomSection(sectionIndex, { items: section.items.filter((_, i) => i !== itemIndex) })
}

// removeCustomHighlight 删除自定义条目内的关键亮点。
function removeCustomHighlight(
  state: ResumeState,
  sectionIndex: number,
  itemIndex: number,
  highlightIndex: number,
): void {
  const item = state.resume?.custom?.[sectionIndex]?.items?.[itemIndex]
  if (!item?.highlights) return
  state.updateCustomItem(sectionIndex, itemIndex, {
    highlights: item.highlights.filter((_, i) => i !== highlightIndex),
  })
}

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
