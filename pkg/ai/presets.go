package ai

// 本文件是「厂商（provider）配置」的唯一来源：Base URL、默认模型、候选模型、
//
// value 是稳定契约：已保存配置的 provider 字段存的就是它，重命名会导致
// 存量配置匹配不上预设（降级为 custom），因此只允许新增、不允许改名。

// Provider 预设标识；与前端下拉选项的 value 一一对应。
const (
	ProviderOpenAI   = "openai"
	ProviderDeepSeek = "deepseek"
	ProviderQWen     = "qwen"
	ProviderKimi     = "kimi"
	ProviderZhipu    = "zhipu"
	ProviderCustom   = "custom"
)

// ProviderPreset 是下发给前端的厂商预设（含标识、展示名、接口参数与候选模型）。
type ProviderPreset struct {
	Value   string   `json:"value"`    // 厂商标识（稳定契约，禁止改名）
	Label   string   `json:"label"`    // 中文展示名
	LabelEN string   `json:"label_en"` // 英文展示名
	BaseURL string   `json:"base_url"` // 服务基地址（含 /v1 等版本前缀）
	Model   string   `json:"model"`    // 预置默认模型
	Models  []string `json:"models"`   // 候选模型（含默认模型，供下拉快捷选择；可为空）
}

// providerPresets 是内置厂商预设，数组顺序即前端下拉展示顺序。
//
// 以下 base_url / model 均按各厂商官方接口文档（2026-09 核对）填写：
//   - OpenAI           https://platform.openai.com/docs/models
//   - DeepSeek         https://api-docs.deepseek.com （含 /zh-cn/updates 更新日志）
//   - 通义千问（百炼） https://help.aliyun.com/zh/model-studio/model-list-text-generation/
//   - Kimi（Moonshot） https://platform.moonshot.cn/docs/pricing/chat-v1
//   - 智谱 GLM         https://docs.bigmodel.cn/cn/guide/start/model-overview
//
// 只收录官方文档「模型列表」中仍在提供的文本模型；已下线/更名的条目不保留。
var providerPresets = []ProviderPreset{
	{
		// OpenAI：v1 前缀是官方固定路径；gpt-5.6-terra 对应早期 mini 档，是当前主力性价比档
		Value:   ProviderOpenAI,
		Label:   "OpenAI",
		LabelEN: "OpenAI",
		BaseURL: "https://api.openai.com/v1",
		Model:   "gpt-5.6-terra",
		// Astra 为最新旗舰；Sol/Terra/Luna 分别对应早期的无后缀 / mini / nano 档
		Models: []string{
			"gpt-6-astra",
			"gpt-5.6-sol",
			"gpt-5.6-terra",
			"gpt-5.6-luna",
			"gpt-5.5-pro",
			"gpt-5.4",
			"gpt-5.4-mini",
			"gpt-5-mini", // 官方公告 2026-12-11 退役
			"gpt-5-nano", // 官方公告 2026-12-11 退役
			"gpt-4o",
			"gpt-4o-mini",
		},
	},
	{
		// DeepSeek：官方 OpenAI 兼容地址为 https://api.deepseek.com（/v1 亦兼容，但与模型版本无关）；
		// 旧名 deepseek-chat / deepseek-reasoner 已于 2026-07-24 弃用，现役为 V4 系列
		Value:   ProviderDeepSeek,
		Label:   "DeepSeek",
		LabelEN: "DeepSeek",
		BaseURL: "https://api.deepseek.com",
		Model:   "deepseek-v4-flash",
		Models:  []string{"deepseek-v4-flash", "deepseek-v4-pro"},
	},
	{
		// 通义千问：百炼 OpenAI 兼容端点；qwen-plus 为 Plus 系列滚动别名（随官方迭代自动跟进），
		// 比写死快照名（如 qwen3.7-plus）更不易过期，故保持不变
		Value:   ProviderQWen,
		Label:   "通义千问",
		LabelEN: "Qwen",
		BaseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		Model:   "qwen-plus",
		Models: []string{
			"qwen-plus",
			"qwen-plus-latest",
			"qwen3.7-plus",
			"qwen3.6-plus",
			"qwen3.5-plus",
			"qwen-max",
			"qwen3-max",
			"qwen3.8-max",
			"qwen-flash",
			"qwen3.8-flash",
			"qwen3.7-flash",
			"qwen-turbo",
			"qwen-long",
		},
	},
	{
		// Kimi：moonshot-v1 全系列已于 2026-08-31 下线（调用返回 404），现役为 kimi-k3 等
		Value:   ProviderKimi,
		Label:   "Kimi（月之暗面）",
		LabelEN: "Kimi (Moonshot AI)",
		BaseURL: "https://api.moonshot.cn/v1",
		Model:   "kimi-k3",
		Models:  []string{"kimi-k3", "kimi-k2.7-code", "kimi-k2.7-code-highspeed", "kimi-k2.6"},
	},
	{
		// 智谱：OpenAI Chat Completion 官方基址不带尾斜杠（后端会 TrimRight('/') 后拼接，两种写法等价）
		Value:   ProviderZhipu,
		Label:   "智谱 GLM",
		LabelEN: "Zhipu GLM",
		BaseURL: "https://open.bigmodel.cn/api/paas/v4",
		Model:   "glm-5.3-flash",
		Models: []string{
			"glm-5.3",
			"glm-5.3-flash",
			"glm-5.2",
			"glm-5.1",
			"glm-5",
			"glm-4.7",
			"glm-4.7-flash", // 免费档
			"glm-4.6",
			"glm-4.5-air",
		},
	},
}

// ProviderPresets 返回内置厂商预设（按下拉展示顺序）。
// 返回副本：调用方改动不会影响包级数据。
func ProviderPresets() []ProviderPreset {
	out := make([]ProviderPreset, 0, len(providerPresets))
	for _, p := range providerPresets {
		out = append(out, p.clone())
	}
	return out
}

// IsValidProvider 判断 provider 是否为内置预设之一（"custom" 也算合法标识）。
func IsValidProvider(p string) bool {
	if p == ProviderCustom {
		return true
	}
	_, ok := PresetOf(p)
	return ok
}

// PresetOf 返回某 provider 的预设；未知 provider 返回 ok=false。
func PresetOf(p string) (ProviderPreset, bool) {
	for _, item := range providerPresets {
		if item.Value == p {
			return item.clone(), true
		}
	}
	return ProviderPreset{}, false
}

// ModelsOf 返回某 provider 的候选模型；未知 provider 返回 nil（前端按「可手动输入」处理）。
func ModelsOf(p string) []string {
	preset, ok := PresetOf(p)
	if !ok {
		return nil
	}
	return preset.Models
}

// clone 深拷贝一份预设（Models 切片一并复制），避免调用方污染包级数据。
func (p ProviderPreset) clone() ProviderPreset {
	if p.Models == nil {
		return p
	}
	p.Models = append([]string(nil), p.Models...)
	return p
}
