/**
 * AI 服务调用封装（后端 AIService）。
 *
 * 与后端 pkg/ai/service/ai_service.go 一一对应。覆盖：多套 AI 配置的管理
 * （列表/新增/更新/删除/单选启用/测试连接）与编辑器 AI 润色（Polish）。
 */

import { callService } from './backend'

/** 后端回显的单套配置视图（来自配置管理列表，含完整 Key 供查看明文）。 */
export interface AIInfo {
  id: string
  name: string
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
  name?: string
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

/** 厂商预设：与后端 pkg/ai/presets.go 对齐，供下拉联动自动填充。 */
export interface AIProviderPreset {
  value: string
  label: string
  baseUrl: string
  model: string
}

export const AI_PRESETS: AIProviderPreset[] = [
  { value: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { value: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { value: 'qwen', label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { value: 'kimi', label: 'Kimi（月之暗面）', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { value: 'zhipu', label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4/', model: 'glm-4-flash' },
]

/** 各供应商的常用模型候选，供「模型名称」下拉快捷选择（用户仍可手动输入任意模型名）。 */
export const AI_MODELS_BY_PROVIDER: Record<string, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'o1-mini'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  qwen: ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen-long'],
  kimi: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  zhipu: ['glm-4-flash', 'glm-4-air', 'glm-4', 'glm-4-plus'],
  custom: [],
}

/** 列出全部 AI 配置（Key 脱敏）与当前启用 ID。 */
export const listAIConfigs = () => callService<AIConfigList>('AIService', 'ListAIConfigs')

/** 返回当前启用配置（脱敏）；未启用返回空对象。供 AI 润色可用性判定。 */
export const getAIConfig = () => callService<AIInfo>('AIService', 'GetAIConfig')

/** 新增或更新一套配置（带 id 为更新，否则新建）。 */
export const saveAIConfig = (cfg: AIConfigInput) => callService<AIInfo | null>('AIService', 'SaveAIConfig', cfg)

/** 删除一套配置（连同其 Key），返回删除后的列表。 */
export const deleteAIConfig = (id: string) => callService<AIConfigList>('AIService', 'DeleteAIConfig', id)

/** 将某套配置设为当前启用。 */
export const setActiveAIConfig = (id: string) => callService<null>('AIService', 'SetActiveAIConfig', id)

/** 对指定配置测试连接；id 为空时测试当前启用配置。 */
export const testConnection = (id = '') => callService<TestConnectionResult>('AIService', 'TestConnection', id)

/** AI 润色处理模式（与后端 pkg/ai/prompts.go 对齐）。 */
export type PolishMode = 'polish' | 'expand' | 'condense' | 'formal' | 'concise'

export interface PolishResult {
  result: string
}

/** 对一段开放文本按指定模式进行 AI 润色，返回润色后的文本。 */
export const polishText = (text: string, mode: PolishMode, semantic: string, lang: string) =>
  callService<PolishResult>('AIService', 'Polish', { text, mode, semantic, lang })