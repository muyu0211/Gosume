/**
 * AI 服务调用封装（后端 AIService）。
 *
 * 与后端 pkg/ai/service/ai_service.go 一一对应。本阶段仅用于设置页的
 * 配置管理与连通性测试；Chat 供后续 Agent 能力调用。
 */

import { callService } from './backend'

/** 提交给后端的 AI 配置（api_key 为原始 Key，若沿用已保存则传脱敏串让后端识别）。 */
export interface AIConfigInput {
  provider: string
  base_url: string
  model: string
  api_key: string
  enabled: boolean
}

/** 后端回显的配置视图，API Key 已脱敏。 */
export interface AIInfo {
  provider: string
  base_url: string
  model: string
  key_masked: string
  enabled: boolean
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
  { value: 'kimi', label: '月之暗面', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
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

export const getAIConfig = () => callService<AIInfo>('AIService', 'GetAIConfig')
export const saveAIConfig = (cfg: AIConfigInput) => callService<null>('AIService', 'SaveAIConfig', cfg)
export const testConnection = () => callService<TestConnectionResult>('AIService', 'TestConnection')