package ai

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
}

// ChatRequest 是 Chat Completions 请求体（OpenAI 兼容协议子集）。
type ChatRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	Temperature *float64      `json:"temperature,omitempty"`
	MaxTokens   *int          `json:"max_tokens,omitempty"`
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
