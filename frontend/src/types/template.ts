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
  is_builtin: boolean
}
