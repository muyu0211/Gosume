import {
  DEFAULT_MARGIN_KEY,
  DEFAULT_SECTION_SPACING_KEY,
} from '../lib/layoutPresets'

export interface ResumeListItem {
  id: string
  name: string
  template_id: string
  updated_at: string
}

export interface Resume {
  version: string
  meta: ResumeMeta
  personal: Personal
  summary?: string
  /**
   * Optional visibility toggle for the standalone "个人总结" entry. When true the
   * summary is omitted from the rendered resume while keeping the text on disk.
   * Pointer + optional keeps legacy data backward-compatible (treated as visible).
   */
  summary_hidden?: boolean
  internships?: Internship[]
  jobs?: Job[]
  projects?: Project[]
  education?: Education[]
  skills?: SkillGroup[]
  languages?: Language[]
  awards?: Award[]
  custom?: CustomSection[]
}

/**
 * Base font size levels (pt). The wire format stays numeric so resumes
 * persisted before this enum was introduced remain valid; assignments
 * must go through these constants (mirrors model.FontSize in Go).
 */
export const FONT_SIZE_LEVELS = {
  small: 9,
  medium: 10,
  large: 11,
} as const

export type FontSizeKey = keyof typeof FONT_SIZE_LEVELS

export const DEFAULT_FONT_SIZE: number = FONT_SIZE_LEVELS.medium

export interface ResumeMeta {
  template_id: string
  language: string
  /** Base font size in pt; assign via FONT_SIZE_LEVELS (see above). */
  font_size: number
  /** Page margin tier key; the frontend maps it to CSS values per component type. */
  page_margin: string
  /** Section spacing tier key. */
  section_spacing: string
  created_at: string
  updated_at: string
  export_count: number
  name: string
}

export interface Personal {
  full_name: string
  english_name?: string
  email?: string
  phone?: string
  wechat?: string
  qq?: string
  location?: string
  website?: string
  linkedin?: string
  github?: string
  avatar?: string
  birthday?: string
  gender?: 'male' | 'female' | 'other'
  job_title?: string
  years_of_exp?: number
}

export interface Internship {
  id: string
  company: string
  company_url?: string
  title: string
  location?: string
  start_date: string
  end_date?: string
  is_current: boolean
  summary?: string
  highlights?: string[]
  keywords?: string[]
  /**
   * Optional visibility toggle. When true the entry is hidden from the rendered
   * resume but kept in the editor. Optional so legacy data remains valid.
   */
  hidden?: boolean
}

export interface Job {
  id: string
  company: string
  company_url?: string
  title: string
  location?: string
  start_date: string
  end_date?: string
  is_current: boolean
  summary?: string
  highlights?: string[]
  keywords?: string[]
  hidden?: boolean
}

export interface ExtraField {
  id: string
  label: string
  value: string
}

export interface Project {
  id: string
  name: string
  url?: string
  role?: string
  start_date?: string
  end_date?: string
  is_current?: boolean
  summary?: string
  highlights?: string[]
  keywords?: string[]
  extras?: ExtraField[]
  hidden?: boolean
}

export interface Education {
  id: string
  school: string
  degree: string
  major: string
  minor?: string
  start_date: string
  end_date: string
  gpa?: string
  courses?: string
  highlights?: string[]
  hidden?: boolean
}

export interface SkillGroup {
  id: string
  category: string
  items: Skill[]
  hidden?: boolean
}

export interface Skill {
  name: string
  level?: number
  icon?: string
  hidden?: boolean
}

export interface Language {
  id: string
  name: string
  level: string
  proficiency?: string
  hidden?: boolean
}

export interface Award {
  id: string
  title: string
  date: string
  issuer?: string
  summary?: string
  hidden?: boolean
}

export interface CustomSection {
  id: string
  title: string
  items: CustomItem[]
  hidden?: boolean
}

export interface CustomItem {
  id: string
  title: string
  subtitle?: string
  date?: string
  description?: string
  highlights?: string[]
  hidden?: boolean
}

export function createEmptyResume(templateId: string): Resume {
  return {
    version: '1.0',
    meta: {
      template_id: templateId,
      language: 'zh-CN',
      font_size: DEFAULT_FONT_SIZE,
      page_margin: DEFAULT_MARGIN_KEY,
      section_spacing: DEFAULT_SECTION_SPACING_KEY,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      export_count: 0,
      name: '',
    },
    personal: {
      full_name: '',
    },
    summary: '',
    internships: [],
    jobs: [],
    projects: [],
    education: [],
    skills: [],
    languages: [],
    awards: [],
    custom: [],
  }
}

export function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10)
}
