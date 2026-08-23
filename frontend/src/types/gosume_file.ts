import type { Resume } from './resume'
import type { TemplateMeta } from './template'

/**
 * 简历中间态文件（.gosume）相关类型。
 *
 * 与后端 pkg/resume/service 包及 service.FileService 的
 * FileParseResult / FileImportRequest / FileImportResponse 结构对齐。
 */

/** .gosume 文件最外层信封（与 Go ExportEnvelope 对齐）。 */
export interface ExportEnvelope {
  format_version: string
  exported_at: string
  app_version: string
  template_name?: string
  data: Resume
}

/** 导入时的模板匹配结果（与 Go template.TemplateResolution 对齐）。 */
export interface TemplateResolution {
  referenced_id: string
  referenced_name: string
  matched: boolean
  matched_id?: string
  available: TemplateMeta[]
}

/** 导入预览的简历内容摘要（与 Go ResumeSummary 对齐）。 */
export interface ResumeSummary {
  name: string
  jobs: number
  education: number
  projects: number
  skills: number
  languages: number
  awards: number
}

/** ParseFile 返回的预览数据（已校验、未落库）。 */
export interface FileParseResult {
  format_version: string
  exported_at: string
  app_version: string
  resume: Resume
  template: TemplateResolution
  summary: ResumeSummary
}

/** ImportFile 请求参数（与 Go FileImportRequest 对齐）。 */
export interface FileImportRequest {
  resume: Resume
  /** 空 = 新建；非空 = 覆盖该 ID 简历。 */
  target_id: string
  /** 最终确定的模板：匹配命中的 matched_id，或模板缺失时用户选择的替代模板 id。 */
  template_id: string
}

/** ImportFile 返回结果（与 Go FileImportResponse 对齐）。 */
export interface FileImportResponse {
  id: string
  mode: 'new' | 'overwrite'
}
