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
  orientations?: string[]
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
  /** 已迁移到统一 HTML 骨架（Gosume 一期改造）：true 时渲染使用 template.html */
  uses_unified_html?: boolean
  is_builtin: boolean
  /** 是否已收藏（模板市场，存于后端 templates.is_favorite） */
  is_favorite?: boolean
  thumbnail?: string
}

/** 模板分类及数量，用于模板市场分类筛选。 */
export interface TemplateCategory {
  name: string
  count: number
}

/** 模板列表分页查询结果。 */
export interface TemplateListResponse {
  total: number
  page: number
  page_size: number
  items: TemplateMeta[]
}

/** 模板包导入历史记录（local=普通导入，share=分享包导入，community=社区下载）。 */
export interface ImportLog {
  id: number
  template_id: string
  template_name: string
  source: 'local' | 'share' | 'community'
  imported_at: string
}
