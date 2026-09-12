package ai

import (
	"context"
	"fmt"
	"strings"
	"time"

	"gosume/pkg/log"
	ghttp "gosume/pkg/remote/http"
)

// 大模型请求默认与最大超时。
const (
	// defaultChatTimeout 是单次 Chat 请求的整体超时（LLM 生成通常较慢）。
	defaultChatTimeout = 60 * time.Second
)

// Client 是大模型 HTTP 客户端，基于 OpenAI 兼容 Chat Completions 协议。
// 复用项目统一 remote/http 门面（含响应流自动释放、Bearer 鉴权、超时/重试等）。
type Client struct {
	cli    ghttp.Clients // 统一请求门面（动态 Base URL）
	apiKey string        // API Key（仅请求头使用，不记录日志）
	model  string        // 默认模型名
}

// NewClient 基于配置单元构造大模型客户端。Base URL 来自运行时用户配置，
// 故使用动态 target 构造（NewHttpClientWithTarget），不依赖 config.yaml 静态服务声明。
func NewClient(cfg AIUnit) *Client {
	return &Client{
		cli:    ghttp.NewHttpClientWithTarget(strings.TrimRight(cfg.BaseURL, "/"), ghttp.WithTimeout(defaultChatTimeout)),
		apiKey: cfg.APIKey,
		model:  cfg.Model,
	}
}

// Chat 发起非流式对话，返回助手首条回复文本。
// msgs 为对话历史；temperature/maxTokens 可空（走服务端默认）。
func (c *Client) Chat(ctx context.Context, msgs []ChatMessage, temperature *float64, maxTokens *int) (string, error) {
	req := &ChatRequest{
		Model:       c.model,
		Messages:    msgs,
		Temperature: temperature,
		MaxTokens:   maxTokens,
	}

	var resp ChatResponse
	opts := []ghttp.Option{ghttp.WithHeader("Content-Type", "application/json")}
	if c.apiKey != "" {
		opts = append(opts, ghttp.WithBearerAuth(c.apiKey))
	}

	// 相对路径 /chat/completions 自动拼接在 Base URL 之后。
	log.Debugf("[ai] Chat: 发起请求 model=%s messages=%d", c.model, len(msgs))
	if _, err := c.cli.Post(ctx, "/chat/completions", req, &resp, opts...); err != nil {
		return "", err
	}
	if resp.Error != nil && resp.Error.Message != "" {
		return "", fmt.Errorf("模型返回错误: %s", resp.Error.Message)
	}
	if len(resp.Choices) == 0 || strings.TrimSpace(resp.Choices[0].Message.Content) == "" {
		return "", fmt.Errorf("模型未返回内容")
	}
	return resp.Choices[0].Message.Content, nil
}

// Test 发一次最小请求验证连通性与鉴权，返回耗时。
// 仅用于设置页「测试连接」，不要求模型真的完成推理。
func (c *Client) Test(ctx context.Context) (time.Duration, error) {
	start := time.Now()
	_, err := c.Chat(ctx, []ChatMessage{TestMessage()}, nil, nil)
	return time.Since(start), err
}
