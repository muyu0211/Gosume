package ai

import "encoding/json"

// Chat 角色常量（OpenAI 兼容协议）。
const (
	RoleSystem    = "system"
	RoleUser      = "user"
	RoleAssistant = "assistant"
)

// ChatMessage 是对话中的一条消息。
type ChatMessage struct {
	Role    string `json:"role"`    // system / user / assistant
	Content string `json:"content"` // 消息内容
	// ReasoningContent 思维链内容（DeepSeek 等思考型模型在 message.reasoning_content
	// 返回）。请求时为空不序列化（omitempty）；响应解析仅用于诊断——思维链不能
	// 当作回复正文使用。
	ReasoningContent string `json:"reasoning_content,omitempty"`
}

// ChatRequest 是 Chat Completions 请求体（OpenAI 兼容协议子集）。
type ChatRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	Temperature *float64      `json:"temperature,omitempty"`
	MaxTokens   *int          `json:"max_tokens,omitempty"`
	// Extra 厂商扩展字段：顶层合并进请求体（json:"-"，由 MarshalJSON 手工合并），
	// 仅供 RequestHook 装饰器写入，避免嵌套成 {"extra":{...}}。
	Extra map[string]any `json:"-"`
	// provider 配置的厂商标识（NewClient 注入，不序列化）。SDK 内置装饰器
	// （如 DisableThinking）按它适配各厂商的参数形态。
	provider string
}

// MarshalJSON 输出标准字段，并把 Extra 顶层合并进请求体。
func (r ChatRequest) MarshalJSON() ([]byte, error) {
	type plain ChatRequest
	base, err := json.Marshal(plain(r))
	if err != nil {
		return nil, err
	}
	if len(r.Extra) == 0 {
		return base, nil
	}
	merged := map[string]any{}
	if err := json.Unmarshal(base, &merged); err != nil {
		return nil, err
	}
	for k, v := range r.Extra {
		merged[k] = v
	}
	return json.Marshal(merged)
}

// ChatChoice 是响应中的一条候选项。
type ChatChoice struct {
	Index        int         `json:"index,omitempty"`
	Message      ChatMessage `json:"message"`
	FinishReason string      `json:"finish_reason,omitempty"`
}

// ChatUsage 是 token 用量统计。
type ChatUsage struct {
	PromptTokens     int `json:"prompt_tokens,omitempty"`
	CompletionTokens int `json:"completion_tokens,omitempty"`
	TotalTokens      int `json:"total_tokens,omitempty"`
}

// APIError 是服务端返回的标准错误体（OpenAI 兼容）。
type APIError struct {
	Message string `json:"message,omitempty"`
	Type    string `json:"type,omitempty"`
	Code    any    `json:"code,omitempty"`
}

// ChatResponse 是 Chat Completions 响应体。
type ChatResponse struct {
	ID      string       `json:"id,omitempty"`
	Object  string       `json:"object,omitempty"`
	Model   string       `json:"model,omitempty"`
	Choices []ChatChoice `json:"choices,omitempty"`
	Usage   ChatUsage    `json:"usage,omitempty"`
	Error   *APIError    `json:"error,omitempty"`
}

// TestMessage 是 TestConnection 使用的最小验证消息。
func TestMessage() ChatMessage {
	return ChatMessage{Role: RoleUser, Content: "ping"}
}
