/**
 * 求职进程模块类型契约。
 *
 * 与后端 `pkg/recruit` 的 SQLite 表结构一一对应（PRD §5）：
 *   job_process / job_company / job_dict / job_settings
 * 字段名与 Go 侧 JSON tag 保持一致，禁止在前端改名或做驼峰化——
 * 否则 Wails 序列化后会静默丢字段。
 */

/** 条目类型。apply=投递记录，notice=招聘通知。 */
export type JobKind = 'apply' | 'notice'

/** 环节。apply 条目恒为 'apply'。 */
export type JobStage = 'apply' | 'assessment' | 'written' | 'interview' | 'talk' | 'offer' | 'other'

/** 条目自身处理状态。 */
export type JobStatus = 'pending' | 'done' | 'dropped' | 'missed' | 'archived'

/** 信息来源。 */
export type JobSource = 'manual' | 'email' | 'sms' | 'other'

/** 字段置信度。 */
export type Confidence = 'high' | 'medium' | 'low' | 'unknown'

/** 临近标签（互斥，取最高优先级）。 */
export type Urgency = 'overdue' | 'today' | 'near' | 'unknown' | 'none'

/** 可被解析/编辑的字段集合（用于置信度 key）。 */
export type ConfidentField =
  | 'company'
  | 'position'
  | 'stage'
  | 'round_no'
  | 'event_time'
  | 'deadline'
  | 'link'
  | 'location'
  | 'source'

/** 置信度表。 */
export type JobConfidence = Partial<Record<ConfidentField, Confidence>>

/** 主实体：求职进程条目。 */
export interface JobProcess {
  id: string
  kind: JobKind
  company: string
  /** 归一化公司名（去空格/括号后缀/大小写），用于去重与分组 */
  company_norm: string
  position: string
  stage: JobStage
  round_no: number
  /** RFC3339 带偏移；apply 表示投递日期。可空＝时间待定 */
  event_time: string | null
  event_end: string | null
  deadline: string | null
  /** 全天事件（不展示时分） */
  all_day: boolean
  /** 时间基准说明（如「以通知中日期为准」），MVP 只存不展示 */
  time_basis: string | null
  link: string
  location: string
  online: boolean
  source: JobSource
  status: JobStatus
  note: string
  /** 仅设置项 saveRawText=1 时后端才回传 */
  raw_text?: string | null
  confidence: JobConfidence
  company_id: string | null
  /** kind=notice 时指向所属 apply */
  parent_id: string | null
  created_at: string
  updated_at: string
}

/** 新建/编辑提交体（id 与审计字段由后端生成）。 */
export type JobProcessDraft = Omit<JobProcess, 'id' | 'created_at' | 'updated_at'> &
  Partial<Pick<JobProcess, 'id'>>

/** 公司档案。 */
export interface JobCompany {
  id: string
  name: string
  norm: string /** 唯一归一化名 */
  aliases: string[]
  website: string
  career_url: string
  contact: string
  note: string
  created_at: string
  updated_at: string
}

/** 模块设置。 */
export interface JobSettings {
  /** 临近阈值（小时）：12 | 24 | 48 | 72 */
  nearThresholdHours: number
  /** 是否保存通知原文 */
  saveRawText: boolean
}

/** 解析结果（后端 Go 产出，前端只负责渲染）。 */
export interface ParseResult {
  fields: Partial<
    Pick<
      JobProcess,
      | 'company'
      | 'position'
      | 'stage'
      | 'round_no'
      | 'event_time'
      | 'event_end'
      | 'deadline'
      | 'link'
      | 'location'
      | 'online'
      | 'source'
    >
  >
  confidence: JobConfidence
  /** 提示 key（走 i18n），如 parseNonChinese */
  warnings: string[]
  /** 解析出的接收时间，作为相对时间（明早/后天）的基准 */
  received_at: string | null
}

/** 疑似重复候选。 */
export interface DuplicateCandidate {
  job: JobProcess
  /** 与待保存条目逐字段的差异 */
  diffs: Array<{ field: keyof JobProcess; current: string; incoming: string }>
}

/** 列表筛选（会话内保留，不持久化）。 */
export interface JobFilters {
  /** 空＝全部 */
  kinds: JobKind[]
  /** company_norm 列表 */
  companies: string[]
  stages: JobStage[]
  statuses: JobStatus[]
  sources: JobSource[]
  /** 告警标签快捷筛选（摘要条/日历页脚点击时用） */
  urgencies: Urgency[]
  keyword: string
}

/** 主区视图。 */
export type JobView = 'list' | 'timeline' | 'calendar'

/** 导入结果报告。 */
export interface ImportReport {
  created: number
  skipped: number
  overwritten: number
}

/** 创建新条目时后端返回的负载。 */
export interface CreateJobResult {
  id: string
  /** 命中指纹时返回，供前端弹「更新/新建/取消」 */
  duplicate?: DuplicateCandidate
}

/** 删除结果（apply 有子通知时用于二次确认）。 */
export interface DeleteJobResult {
  unlinked?: number
  deleted?: number
}
