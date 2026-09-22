package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"gosume/pkg/log"
	ghttp "gosume/pkg/remote/http"
)

// ErrTruncated 模型输出被 max_tokens 截断（finish_reason=length）且正文为空。
// temperature=0 的确定性调用下重试必然得到相同结果，调用方可据此跳过重试。
var ErrTruncated = errors.New("模型输出被 max_tokens 截断")

const (
	defaultChatTimeout = 60 * time.Second // 单次 Chat 请求的整体超时（LLM 生成通常较慢）。
)

// Client 是大模型 HTTP 客户端，基于 OpenAI 兼容 Chat Completions 协议。
// 复用项目统一 remote/http 门面（含响应流自动释放、Bearer 鉴权、超时/重试等）。
type Client struct {
	cli      ghttp.Clients // 统一请求门面（动态 Base URL）
	apiKey   string        // API Key（仅请求头使用，不记录日志）
	model    string        // 默认模型名
	provider string        // 厂商标识（内置装饰器按厂商适配参数形态）
}

// NewClient 基于配置单元构造大模型客户端。Base URL 来自运行时用户配置，
// 故使用动态 target 构造（NewHttpClientWithTarget），不依赖 config.yaml 静态服务声明。
func NewClient(cfg AIUnit) *Client {
	return &Client{
		cli:      ghttp.NewHttpClientWithTarget(strings.TrimRight(cfg.BaseURL, "/"), ghttp.WithTimeout(defaultChatTimeout)),
		apiKey:   cfg.APIKey,
		model:    cfg.Model,
		provider: cfg.Provider,
	}
}

// Chat 发起非流式对话，返回助手首条回复文本。
// msgs 为对话历史；单次调用的策略参数（温度/输出上限/厂商开关）全部经 hooks 传入，
// 缺省时走服务端默认。
func (c *Client) Chat(ctx context.Context, msgs []ChatMessage, hooks ...RequestHook) (string, error) {
	req := &ChatRequest{
		Model:    c.model,
		Messages: msgs,
		provider: c.provider,
	}
	for _, h := range hooks {
		if h != nil {
			req = h(req)
		}
	}
	return c.chatRequest(ctx, req)
}

// chatRequest 装饰后的请求发送与响应解析（Chat / Decorate 的公共底层）。
func (c *Client) chatRequest(ctx context.Context, req *ChatRequest) (string, error) {
	var resp ChatResponse
	opts := []ghttp.Option{ghttp.WithHeader("Content-Type", "application/json")}
	if c.apiKey != "" {
		opts = append(opts, ghttp.WithBearerAuth(c.apiKey))
	}

	if body, err := json.Marshal(req); err == nil {
		var params map[string]any
		if json.Unmarshal(body, &params) == nil {
			delete(params, "messages")
			if filtered, err := json.Marshal(params); err == nil {
				log.Infof("[ai] Chat: 发起请求 model=%s 请求参数: %s", req.Model, filtered)
			}
		}
	}

	if _, err := c.cli.Post(ctx, "/chat/completions", req, &resp, opts...); err != nil {
		return "", err
	}
	if resp.Error != nil && resp.Error.Message != "" {
		return "", fmt.Errorf("模型返回错误: %s", resp.Error.Message)
	}
	if len(resp.Choices) == 0 || strings.TrimSpace(resp.Choices[0].Message.Content) == "" {
		choice := resp.Choices[0]
		log.ErrorContextf(ctx, "resp: %v", resp)
		if choice.FinishReason == "length" {
			if choice.Message.ReasoningContent != "" {
				return "", fmt.Errorf("%w: 思维链耗尽输出预算，正文未生成（finish_reason=length）；请换用非思考模型或调大 max_tokens", ErrTruncated)
			}
			return "", fmt.Errorf("%w（finish_reason=length），请调大 max_tokens", ErrTruncated)
		}
		return "", fmt.Errorf("模型未返回内容")
	}
	return resp.Choices[0].Message.Content, nil
}

// Test 发一次最小请求验证连通性与鉴权，返回耗时。
func (c *Client) Test(ctx context.Context) (time.Duration, error) {
	start := time.Now()
	_, err := c.Chat(ctx, []ChatMessage{TestMessage()})
	return time.Since(start), err
}
