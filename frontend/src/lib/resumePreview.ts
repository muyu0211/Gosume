import { renderResumeHtml, type TemplateSet } from './templateEngine'
import { injectGlobalVarsCss } from './layoutPresets'
import { loadTemplateContent } from '../services/templateService'
import type { Resume } from '../types/resume'

/** 模板缺失时的兜底模板 id（与 usePreview / 批量导出中使用的内置模板一致）。 */
export const FALLBACK_TEMPLATE_ID = 'a406004d-d3b8-4900-969f-8094f8e85cf0'

/** 模板内容缓存：同一模板在多份简历间只取一次（Wails 调用有 IPC 开销）。 */
const templateCache = new Map<string, TemplateSet>()

/**
 * 带缓存的模板内容读取。
 * 与 `hooks/usePreview` 内的单槽缓存同思路，扩为多槽以支撑「多份简历 × 多模板」场景。
 */
export async function getTemplateCached(templateId: string): Promise<TemplateSet> {
  const key = templateId || FALLBACK_TEMPLATE_ID
  const hit = templateCache.get(key)
  if (hit) return hit
  const tmpl = await loadTemplateContent(key)
  templateCache.set(key, tmpl)
  return tmpl
}

/**
 * 渲染一份简历用于**展示**的 HTML（首页卡片预览的唯一入口）。
 *
 * 与编辑器预览（hooks/usePreview）、批量导出（hooks/useResumeBatch）同源：
 * `renderResumeHtml`（渲染唯一入口，含板块顺序重排）+ `injectGlobalVarsCss`（注入 per-resume custom_css）。
 * 卡片预览**不做分页** —— 与模板卡片一致，只呈现首页内容。
 */
export async function renderResumeForCard(resume: Resume): Promise<string> {
  const tmpl = await getTemplateCached(resume.meta?.template_id || FALLBACK_TEMPLATE_ID)
  const rendered = renderResumeHtml(tmpl, resume)
  return injectGlobalVarsCss(rendered, resume)
}
