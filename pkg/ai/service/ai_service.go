package service

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"gosume/pkg/ai"
	"gosume/pkg/log"
	"gosume/pkg/user_config"
	"gosume/pkg/util"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// AIConfigResponse 是返回给前端的 AI 配置视图，API Key 一律脱敏。
type AIConfigResponse struct {
	Provider  string `json:"provider"`
	BaseURL   string `json:"base_url"`
	Model     string `json:"model"`
	KeyMasked string `json:"key_masked"`
	Enabled   bool   `json:"enabled"`
}

// TestConnectionResponse 是「测试连接」的结果。
type TestConnectionResponse struct {
	OK        bool   `json:"ok"`
	LatencyMS int64  `json:"latency_ms,omitempty"`
	Message   string `json:"message,omitempty"`
}

// testTimeout 是「测试连接」的单次超时（比真实 Chat 更短，快速反馈）。
const testTimeout = 15 * time.Second

// AIService 提供 AI 服务的配置管理与大模型调用入口，
// 为后续 Agent / 简历生成等功能铺路。配置经 user_config 的数据目录落盘。
type AIService struct {
	App       *application.App
	configMgr *user_config.Manager
}

// ServiceName 返回服务名，供 Wails 绑定与前端调用使用。
func (s *AIService) ServiceName() string {
	return "AIService"
}

// Inject 注入依赖：数据目录配置管理器（用于读写 ai_config.json）。
func (s *AIService) Inject(app *application.App, configMgr *user_config.Manager) {
	s.App = app
	s.configMgr = configMgr
}

// GetAIConfig 返回当前 AI 配置，API Key 脱敏（如 sk-****1234）。
func (s *AIService) GetAIConfig() *util.Response {
	cfg := ai.LoadConfig(s.configMgr.DataDir())
	return util.DoRsp(util.SuccCode, "成功", &AIConfigResponse{
		Provider:  cfg.Provider,
		BaseURL:   cfg.BaseURL,
		Model:     cfg.Model,
		KeyMasked: ai.MaskKey(cfg.APIKey),
		Enabled:   cfg.Enabled,
	})
}

// SaveAIConfig 校验并持久化 AI 配置。
// 前端回传的 api_key 若为脱敏串（含 * 占位）表示未改动，沿用已保存的完整 Key。
func (s *AIService) SaveAIConfig(cfg ai.AIConfig) *util.Response {
	cfg.Provider = strings.TrimSpace(cfg.Provider)
	cfg.BaseURL = strings.TrimSpace(cfg.BaseURL)
	cfg.Model = strings.TrimSpace(cfg.Model)
	cfg.APIKey = strings.TrimSpace(cfg.APIKey)

	// provider 未知时降级为 custom（仅影响预设联动，不阻断保存）
	if cfg.Provider != "" && !ai.IsValidProvider(cfg.Provider) {
		cfg.Provider = ai.ProviderCustom
	}

	// 基本校验：Base URL 需为 http(s) 绝对地址，模型非空
	u, err := url.Parse(cfg.BaseURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return util.DoRsp(util.ErrCode, "接口地址需为 http(s) 链接", nil)
	}
	if cfg.Model == "" {
		return util.DoRsp(util.ErrCode, "模型名称不能为空", nil)
	}

	// API Key：掩码值沿用旧 Key；否则全新（须非空）
	if ai.IsMaskedKey(cfg.APIKey) {
		cfg.APIKey = ai.LoadConfig(s.configMgr.DataDir()).APIKey
		if cfg.APIKey == "" {
			return util.DoRsp(util.ErrCode, "API Key 无效，请重新填写", nil)
		}
	}
	if cfg.APIKey == "" {
		return util.DoRsp(util.ErrCode, "API Key 不能为空", nil)
	}

	if err := ai.SaveConfig(s.configMgr.DataDir(), cfg); err != nil {
		log.Errorf("[ai_service] SaveAIConfig: 持久化失败: %v", err)
		return util.DoRsp(util.ErrCode, "保存 AI 配置失败，请稍后重试", nil)
	}

	log.Infof("[ai_service] SaveAIConfig: provider=%s base_url=%s model=%s enabled=%v", cfg.Provider, cfg.BaseURL, cfg.Model, cfg.Enabled)
	return util.DoRsp(util.SuccCode, "已保存", nil)
}

// TestConnection 使用当前已保存的配置发一次最小请求验证连通性与鉴权。
// 若尚未保存配置或 Key 缺失，返回面向用户的可操作提示。
func (s *AIService) TestConnection() *util.Response {
	cfg := ai.LoadConfig(s.configMgr.DataDir())
	if cfg.BaseURL == "" || cfg.APIKey == "" || cfg.Model == "" {
		return util.DoRsp(util.ErrCode, "请先填写并保存 AI 配置，再进行测试连接", nil)
	}

	ctx, cancel := context.WithTimeout(context.Background(), testTimeout)
	defer cancel()

	latency, err := ai.NewClient(cfg).Test(ctx)
	if err != nil {
		log.Warnf("[ai_service] TestConnection: 连接失败: %v", err)
		return util.DoRsp(util.ErrCode, "连接失败，请检查接口地址与 API Key 后重试", nil)
	}

	resp := &TestConnectionResponse{OK: true, LatencyMS: latency.Milliseconds()}
	log.Infof("[ai_service] TestConnection: 连接成功，耗时 %dms", resp.LatencyMS)
	return util.DoRsp(util.SuccCode, "成功", resp)
}

// Chat 发起一次非流式对话，返回助手回复文本。
// 作为后续 Agent 能力的底层入口，本阶段不在 UI 直接触达。
func (s *AIService) Chat(messages []ai.ChatMessage) *util.Response {
	cfg := ai.LoadConfig(s.configMgr.DataDir())
	if cfg.BaseURL == "" || cfg.APIKey == "" || cfg.Model == "" {
		return util.DoRsp(util.ErrCode, "请先在设置页完成并保存 AI 配置", nil)
	}
	if len(messages) == 0 {
		return util.DoRsp(util.ErrCode, "对话内容不能为空", nil)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	reply, err := ai.NewClient(cfg).Chat(ctx, messages, nil, nil)
	if err != nil {
		log.Errorf("[ai_service] Chat: 调用大模型失败: %v", err)
		return util.DoRsp(util.ErrCode, fmt.Sprintf("调用失败：%v", err), nil)
	}

	log.Infof("[ai_service] Chat: 完成（messages=%d）", len(messages))
	return util.DoRsp(util.SuccCode, "成功", reply)
}