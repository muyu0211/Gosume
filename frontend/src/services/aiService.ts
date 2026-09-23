/**
 * AI 服务调用封装。
 *
 * 配置管理走后端 pkg/setting/ai_config_service.go（AIConfigService）；
 * 编辑器 AI 润色（Polish）与通用对话走 pkg/resume/service/ai_service.go（AIService）。
 */

import { callService } from './backend'

/** 后端回显的单套配置视图（来自配置管理列表，含完整 Key 供查看明文）。
 *
 * 没有独立的名称字段：模型名即配置的标识与展示名，且在同一服务商下唯一。
 */
export interface AIInfo {
  id: string
  provider: string
  base_url: string
  model: string
  key: string // 完整 Key（仅配置管理列表返回，用于「显示」时查看明文）
  key_masked: string
  active: boolean
}

/** 提交给后端的配置单元（api_key 传脱敏串表示沿用原 Key）。 */
export interface AIConfigInput {
  id?: string
  provider: string
  base_url: string
  api_key: string
  model: string
}

/** 多配置列表回包。 */
export interface AIConfigList {
  active_id: string
  configs: AIInfo[]
}

/** 「测试连接」结果。 */
export interface TestConnectionResult {
  ok: boolean
  latency_ms?: number
  message?: string
}

/** 厂商预设：由后端（pkg/ai/presets.go）集中维护并下发，前端不保留任何厂商参数。
 *
 * value 是稳定契约（已保存配置的 provider 字段存的就是它），禁止改名；
 * 增删厂商 / 调整默认模型 / 增删候选模型一律改后端，前端无需发版。
 */
export interface AIProviderPreset {
  /** 厂商标识（openai / deepseek / qwen / kimi / zhipu …）。 */
  value: string
  /** 中文展示名。 */
  label: string
  /** 英文展示名（缺失时回落 label）。 */
  label_en: string
  /** 服务基地址（含 /v1 等版本前缀）。 */
  base_url: string
  /** 预置默认模型。 */
  model: string
  /** 候选模型（供下拉快捷选择；可为空，用户仍可手动输入）。 */
  models: string[]
}

/** 厂商预设列表回包。 */
export interface AIProviderList {
  providers: AIProviderPreset[]
}

/**
 * 拉取厂商预设。
 */
let providersCache: AIProviderPreset[] | null = null

export const listAIProviders = async (): Promise<AIProviderPreset[]> => {
  if (providersCache) return providersCache
  try {
    const res = await callService<AIProviderList>('AIConfigService', 'ListAIProviders')
    providersCache = res?.providers ?? []
  } catch (e) {
    console.warn('[aiService] ListAIProviders 失败，厂商下拉降级为自定义', e)
    providersCache = []
  }
  return providersCache
}

/** 按当前 UI 语言取厂商展示名。 */
export function providerLabel(p: AIProviderPreset, lang: string): string {
  return lang === 'en-US' && p.label_en ? p.label_en : p.label
}

/** 取某厂商的候选模型（未知厂商返回空数组）。 */
export function providerModels(presets: AIProviderPreset[], provider: string): string[] {
  return presets.find((p) => p.value === provider)?.models ?? []
}

/** 列出全部 AI 配置（Key 脱敏）与当前启用 ID。 */
export const listAIConfigs = () => callService<AIConfigList>('AIConfigService', 'ListAIConfigs')

/** 返回当前启用配置（脱敏）；未启用返回空对象。供 AI 润色可用性判定。 */
export const getAIConfig = () => callService<AIInfo>('AIConfigService', 'GetAIConfig')

/** 新增或更新一套配置（带 id 为更新，否则新建）。 */
export const saveAIConfig = (cfg: AIConfigInput) => callService<AIInfo | null>('AIConfigService', 'SaveAIConfig', cfg)

/** 删除一套配置（连同其 Key），返回删除后的列表。 */
export const deleteAIConfig = (id: string) => callService<AIConfigList>('AIConfigService', 'DeleteAIConfig', id)

/** 将某套配置设为当前启用。 */
export const setActiveAIConfig = (id: string) => callService<null>('AIConfigService', 'SetActiveAIConfig', id)

/** 对指定配置测试连接；id 为空时测试当前启用配置。 */
export const testConnection = (id = '') => callService<TestConnectionResult>('AIConfigService', 'TestConnection', id)

/** AI 润色处理模式（与后端 pkg/resume/service/ai_polish_prompt.go 对齐）。 */
export type PolishMode = 'polish' | 'expand' | 'condense' | 'formal' | 'concise'

export interface PolishResult {
  result: string
}

/** 对一段开放文本按指定模式进行 AI 润色，返回润色后的文本。 */
export const polishText = (text: string, mode: PolishMode, semantic: string, lang: string) =>
  callService<PolishResult>('AIService', 'Polish', { text, mode, semantic, lang })

/** 整组亮点润色回包：results[i] 与请求 items[i] 位置对应。 */
export interface PolishHighlightsResult {
  results: string[]
}

/** 对「关键亮点」整组进行 AI 改写（items 为非空 bullet，顺序即编辑器顺序）。 */
export const polishHighlights = (items: string[], mode: PolishMode, context: string, lang: string) =>
  callService<PolishHighlightsResult>('AIService', 'PolishHighlights', { items, mode, context, lang })