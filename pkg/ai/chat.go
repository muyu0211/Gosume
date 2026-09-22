package ai

import (
	"context"
	"errors"
)

// ChatFunc 是一次非流式对话调用的统一签名（与 Client.Chat 一致）。
type ChatFunc func(ctx context.Context, msgs []ChatMessage, hooks ...RequestHook) (string, error)

// ConfigSource 配置来源：SDK 每次发起调用时求值。
type ConfigSource func() (AIUnit, bool)

// ErrNoActiveConfig 当前没有可用的启用配置（未配置 / 配置不完整）。
var ErrNoActiveConfig = errors.New("未配置 AI")

// RequestHook 装饰器原语：在请求发出前改写请求体。可叠加（按序应用，后者覆盖
// 同字段），单次调用的所有策略参数都经它传入。
type RequestHook func(req *ChatRequest) *ChatRequest

// WithTemperature 设置采样温度（覆盖服务端默认）；确定性输出场景传 0。
func WithTemperature(v float64) RequestHook {
	return func(req *ChatRequest) *ChatRequest {
		req.Temperature = &v
		return req
	}
}

// WithMaxTokens 限制输出 token 数（覆盖服务端默认）。
func WithMaxTokens(n int) RequestHook {
	return func(req *ChatRequest) *ChatRequest {
		req.MaxTokens = &n
		return req
	}
}

// WithExtra 注入厂商扩展字段（顶层合并进请求体）。
func WithExtra(fields map[string]any) RequestHook {
	return func(req *ChatRequest) *ChatRequest {
		if req.Extra == nil {
			req.Extra = make(map[string]any, len(fields))
		}
		for k, v := range fields {
			req.Extra[k] = v
		}
		return req
	}
}

// DisableThinking 关闭思考模式：按配置的 provider 自动适配各厂商的参数形态
// （与各官方 SDK 的调用约定对齐）：
//   - deepseek / zhipu：thinking={"type":"disabled"}（官方 extra_body 形态，
//     对应 Python SDK 的 extra_body={"thinking":{"type":"enabled"}}）；
//   - qwen：enable_thinking=false（DashScope / SiliconFlow / vLLM）；
//   - openai：reasoning_effort="minimal"（o 系列最低推理档，无法完全关闭）；
//   - kimi / custom / 未知：同时注入 deepseek 与 qwen 两种形态（聚合网关普遍
//     忽略不认识的字段；严格校验未知字段的端点会 400，此时请改用模型名切换）。
func DisableThinking() RequestHook {
	return func(req *ChatRequest) *ChatRequest {
		switch req.provider {
		case ProviderDeepSeek, ProviderZhipu:
			return WithExtra(map[string]any{"thinking": map[string]any{"type": "disabled"}})(req)
		case ProviderQWen:
			return WithExtra(map[string]any{"enable_thinking": false})(req)
		case ProviderOpenAI:
			return WithExtra(map[string]any{"reasoning_effort": "minimal"})(req)
		default:
			return WithExtra(map[string]any{
				"thinking":        map[string]any{"type": "disabled"},
				"enable_thinking": false,
			})(req)
		}
	}
}

// WithReasoningEffort 设置推理强度（OpenAI o 系列 / DeepSeek 等支持该参数的端点；
// 取值如 minimal / low / medium / high，对不支持的端点应避免使用）。
func WithReasoningEffort(level string) RequestHook {
	return WithExtra(map[string]any{"reasoning_effort": level})
}

// DisableStream 关闭流式调用。
func DisableStream() RequestHook {
	return WithExtra(map[string]any{"stream": false})
}

func EnableStream() RequestHook {
	return WithExtra(map[string]any{"stream": true})
}

// NewDynamicChat 返回「绑定当前启用配置」的对话函数。
func NewDynamicChat(src ConfigSource) ChatFunc {
	return func(ctx context.Context, msgs []ChatMessage, hooks ...RequestHook) (string, error) {
		u, ok := src()
		if !ok || u.BaseURL == "" || u.APIKey == "" || u.Model == "" {
			return "", ErrNoActiveConfig
		}
		all := make([]RequestHook, 0, len(hooks))
		all = append(all, hooks...)
		return NewClient(u).Chat(ctx, msgs, all...)
	}
}
