import { isWails, callService } from './backend'
import type {
  CommunityInfo,
  CommunityTemplate,
  CommunityTemplateList,
  DownloadCommunityResult,
  PublishCommunityResult,
} from '../types/community'

// ---------------------------------------------------------------------------
// 模板社区（在线模板市场）服务调用封装。
// 需联网访问，仅 Wails 桌面环境可用；社区未配置或网络不可达时方法返回 null/抛错。
// ---------------------------------------------------------------------------

/** 返回社区服务配置状态（是否已配置、服务地址）。 */
export async function getCommunityInfo(): Promise<CommunityInfo | null> {
  if (!isWails()) return null
  return callService<CommunityInfo>('CommunityService', 'GetCommunityInfo')
}

/** 分页拉取社区模板列表，支持分类与关键字筛选。 */
export async function listCommunityTemplates(
  options: { category?: string; keyword?: string; page?: number; pageSize?: number } = {},
): Promise<CommunityTemplateList | null> {
  if (!isWails()) return null
  return callService<CommunityTemplateList>(
    'CommunityService',
    'ListCommunityTemplates',
    options.category ?? '',
    options.keyword ?? '',
    options.page ?? 1,
    options.pageSize ?? 24,
  )
}

/** 返回单个社区模板详情。 */
export async function getCommunityTemplate(id: string): Promise<CommunityTemplate | null> {
  if (!isWails()) return null
  return callService<CommunityTemplate>('CommunityService', 'GetCommunityTemplate', id)
}

/** 下载社区模板并安装到本地（下载后离线可用）。用户取消/失败返回 null。 */
export async function downloadCommunityTemplate(id: string): Promise<DownloadCommunityResult | null> {
  if (!isWails()) throw new Error('模板下载需要在 Gosume 桌面应用中使用')
  return callService<DownloadCommunityResult>('CommunityService', 'DownloadCommunityTemplate', id)
}

/** 把本地模板发布到模板社区。 */
export async function publishCommunityTemplate(id: string): Promise<PublishCommunityResult | null> {
  if (!isWails()) throw new Error('模板发布需要在 Gosume 桌面应用中使用')
  return callService<PublishCommunityResult>('CommunityService', 'PublishCommunityTemplate', id)
}

/** 给社区模板评分（1-5 星）。 */
export async function rateCommunityTemplate(id: string, score: number): Promise<void> {
  if (!isWails()) throw new Error('模板评分需要在 Gosume 桌面应用中使用')
  await callService('CommunityService', 'RateCommunityTemplate', id, score)
}