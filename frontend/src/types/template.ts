export interface TemplateMeta {
  id: string
  name: string
  version: string
  author: {
    name: string
    email?: string
    url?: string
  }
  description: string
  category: string
  tags: string[]
  target_language: string[]
  page_count: {
    min: number
    max: number
    default: number
  }
  paper_size: string
  colors?: {
    primary: string
    secondary: string
    text: string
    background: string
    accent: string
  }
  features?: {
    avatar: boolean
    skill_bars: boolean
    qr_code: boolean
    links_clickable: boolean
  }
  /** 已迁移到统一 HTML 骨架（Gosume 一期改造）：true 时渲染使用 unified.html */
  uses_unified_html?: boolean
  is_builtin: boolean
  thumbnail?: string
}
