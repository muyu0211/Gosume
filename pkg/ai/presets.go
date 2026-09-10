package ai

// Provider 预设标识；与前端 CustomSelect 选项一一对应。
const (
	ProviderOpenAI   = "openai"
	ProviderDeepSeek = "deepseek"
	ProviderQWen     = "qwen"
	ProviderKimi     = "kimi"
	ProviderZhipu    = "zhipu"
	ProviderCustom   = "custom"
)

// Preset 描述某个 provider 的 Base URL 与默认模型。
type Preset struct {
	BaseURL string // 服务基地址（含 /v1 等版本前缀）
	Model   string // 预置默认模型
}

// Presets 返回内置厂商预设。数据源供服务端校验与前端下拉联动使用，
// 避免前端硬编码导致两处漂移。
func Presets() map[string]Preset {
	return map[string]Preset{
		ProviderOpenAI:   {BaseURL: "https://api.openai.com/v1", Model: "gpt-4o-mini"},
		ProviderDeepSeek: {BaseURL: "https://api.deepseek.com/v1", Model: "deepseek-chat"},
		ProviderQWen:     {BaseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", Model: "qwen-plus"},
		ProviderKimi:     {BaseURL: "https://api.moonshot.cn/v1", Model: "moonshot-v1-8k"},
		ProviderZhipu:    {BaseURL: "https://open.bigmodel.cn/api/paas/v4/", Model: "glm-4-flash"},
	}
}

// IsValidProvider 判断 provider 是否为内置预设之一（"custom" 也算合法标识）。
func IsValidProvider(p string) bool {
	switch p {
	case ProviderOpenAI, ProviderDeepSeek, ProviderQWen, ProviderKimi, ProviderZhipu, ProviderCustom:
		return true
	default:
		return false
	}
}

// PresetOf 返回某 provider 的预设；未知 provider 返回 ok=false。
func PresetOf(p string) (Preset, bool) {
	ps, ok := Presets()[p]
	return ps, ok
}
