/**
 * AI 服务调用封装（后端 AIService）。
 *
 * 与后端 pkg/ai/service/ai_service.go 一一对应。覆盖：多套 AI 配置的管理
 * （列表/新增/更新/删除/单选启用/测试连接）与编辑器 AI 润色（Polish）。
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

/** 厂商预设：与后端 pkg/ai/presets.go 对齐，供下拉联动自动填充。
 *
 * 以下 baseUrl / model 均按各厂商官方接口文档（2026-09 核对）填写：
 * - OpenAI           https://platform.openai.com/docs/models
 * - DeepSeek         https://api-docs.deepseek.com （含 /zh-cn/updates 更新日志）
 * - 通义千问（百炼） https://help.aliyun.com/zh/model-studio/model-list-text-generation/
 * - Kimi（Moonshot） https://platform.moonshot.cn/docs/pricing/chat-v1
 * - 智谱 GLM         https://docs.bigmodel.cn/cn/guide/start/model-overview
 *
 * value 与 label 为稳定契约，改动会导致已保存配置匹配不上，禁止调整。
 */
export interface AIProviderPreset {
  value: string
  label: string
  baseUrl: string
  model: string
}

export const AI_PRESETS: AIProviderPreset[] = [
  // OpenAI：v1 前缀是官方固定路径；gpt-5.6-terra 对应早期 mini 档，是当前主力性价比档
  { value: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6-terra' },
  // DeepSeek：官方 OpenAI 兼容地址为 https://api.deepseek.com（/v1 亦兼容，但与模型版本无关）；
  // 旧名 deepseek-chat / deepseek-reasoner 已于 2026-07-24 弃用，现役为 V4 系列
  { value: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  // 通义千问：百炼 OpenAI 兼容端点；qwen-plus 为 Plus 系列滚动别名（随官方迭代自动跟进），
  // 比写死快照名（如 qwen3.7-plus）更不易过期，故保持不变
  { value: 'qwen', label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  // Kimi：moonshot-v1 全系列已于 2026-08-31 下线（调用返回 404），现役为 kimi-k3 等
  { value: 'kimi', label: 'Kimi（月之暗面）', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k3' },
  // 智谱：OpenAI Chat Completion 官方基址不带尾斜杠（后端会 TrimRight('/') 后拼接，两种写法等价）
  { value: 'zhipu', label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.3-flash' },
]

/** 各供应商的常用模型候选，供「模型名称」下拉快捷选择（用户仍可手动输入任意模型名）。
 *
 * 只收录各官方文档「模型列表」中仍在提供的文本模型；已下线/更名的条目已移除：
 * - OpenAI：移除 gpt-4-turbo、o1-mini（已不在现役列表）
 * - DeepSeek：移除 deepseek-chat / deepseek-reasoner（2026-07-24 起弃用）
 * - Kimi：移除 moonshot-v1-8k/32k/128k（2026-08-31 下线，调用返回 404）、kimi-k2 / kimi-k2.5
 * - 智谱：移除 glm-4 / glm-4-air / glm-4-plus / glm-4-flash（GLM-4 系列已不在官方模型概览）
 */
export const AI_MODELS_BY_PROVIDER: Record<string, string[]> = {
  // OpenAI：Astra 为最新旗舰；Sol/Terra/Luna 分别对应早期的无后缀 / mini / nano 档
  openai: [
    'gpt-6-astra',
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'gpt-5.5-pro',
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5-mini', // 官方公告 2026-12-11 退役
    'gpt-5-nano', // 官方公告 2026-12-11 退役
    'gpt-4o',
    'gpt-4o-mini',
  ],
  deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  qwen: [
    'qwen-plus',
    'qwen-plus-latest',
    'qwen3.7-plus',
    'qwen3.6-plus',
    'qwen3.5-plus',
    'qwen-max',
    'qwen3-max',
    'qwen3.8-max',
    'qwen-flash',
    'qwen3.8-flash',
    'qwen3.7-flash',
    'qwen-turbo',
    'qwen-long',
  ],
  kimi: ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.7-code-highspeed', 'kimi-k2.6'],
  zhipu: [
    'glm-5.3',
    'glm-5.3-flash',
    'glm-5.2',
    'glm-5.1',
    'glm-5',
    'glm-4.7',
    'glm-4.7-flash', // 免费档
    'glm-4.6',
    'glm-4.5-air',
  ],
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