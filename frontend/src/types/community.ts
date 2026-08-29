/** 在线模板社区（模板市场）相关类型定义 */

/** 社区模板（列表/详情通用），由 CommunityService 返回 */
export interface CommunityTemplate {
  id: string
  name: string
  name_en?: string
  version: string
  author: {
    name: string
    email?: string
    url?: string
  }
  description: string
  category: string
  tags: string[]
  paper_size: string
  orientations?: string[]
  page_count: {
    min: number
    max: number
    default: number
  }
  colors?: {
    primary: string
    secondary: string
    text: string
    background: string
    accent: string
  }
  thumbnail_url: string
  download_count: number
  rating: number
  rating_count: number
  published_at: string
  published_by_name: string
  /** 客户端计算：本地是否已安装同 ID 模板 */
  is_installed: boolean
}

export interface CommunityTemplateList {
  total: number
  page: number
  page_size: number
  items: CommunityTemplate[]
}

/** 社区服务配置状态（未配置时 configured=false，前端提示无法联网） */
export interface CommunityInfo {
  endpoint: string
  configured: boolean
}

/** 社区模板下载并安装到本地的结果 */
export interface DownloadCommunityResult {
  template_id: string
  name: string
  version: string
}

/** 发布模板到社区的结果 */
export interface PublishCommunityResult {
  id: string
}