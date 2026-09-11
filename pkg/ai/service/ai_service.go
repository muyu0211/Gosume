package service

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"gosume/pkg/ai"
	"gosume/pkg/log"
	"gosume/pkg/user_config"
	"gosume/pkg/util"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// AIConfigItem 是返回给前端的单套配置视图。
// API Key 默认脱敏；only 配置管理列表（ListAIConfigs）经 withKey 下发完整 Key，
// 供用户在「显示」时查看真实明文。其余场景（如 AI 可用性判定）保持脱敏不返回。
type AIConfigItem struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Provider string `json:"provider"`
	BaseURL  string `json:"base_url"`
	Model    string `json:"model"`
	Key      string `json:"key,omitempty"` // 完整 Key，仅 withKey=true 时返回
	KeyMasked string `json:"key_masked"`
	Active   bool   `json:"active"` // 是否为当前启用
}

// AIConfigListResponse 是多配置列表回包。
type AIConfigListResponse struct {
	ActiveID string        `json:"active_id"`
	Configs  []AIConfigItem `json:"configs"`
}

// TestConnectionResponse 是「测试连接」的结果。
type TestConnectionResponse struct {
	OK        bool   `json:"ok"`
	LatencyMS int64  `json:"latency_ms,omitempty"`
	Message   string `json:"message,omitempty"`
}

// testTimeout 是「测试连接」的单次超时（比真实 Chat 更短，快速反馈）。
const (
	testTimeout = 15 * time.Second
	// polishTimeout 是单次润色调用的超时。
	polishTimeout = 30 * time.Second
	// polishMaxInputRunes 是润色输入的最大长度预检阈值，超长先让用户精简（防截断/超 token）。
	polishMaxInputRunes = 4000
)

// PolishRequest 是一次 AI 润色请求。
type PolishRequest struct {
	Mode     string `json:"mode"`     // 处理模式：polish/expand/condense/formal/concise
	Semantic string `json:"semantic"` // 语义类型：summary/job/project/education/award/custom/highlight/extra
	Text     string `json:"text"`     // 待润色原文
	Lang     string `json:"lang"`     // 简历语言（zh-CN/en-US），用于贴近原文语种
}

// PolishResponse 是润色结果回包。
type PolishResponse struct {
	Result string `json:"result"`
}

// AIService 提供 AI 服务的多配置管理与大模型调用入口，
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

// --- 内部辅助 ---

// load 读取配置容器（含旧单配置迁移）。
func (s *AIService) load() ai.AIConfig {
	return ai.LoadConfig(s.configMgr.DataDir())
}

// active 返回当前启用配置；无启用时 ok=false。
func (s *AIService) active() (ai.AIUnit, bool) {
	return s.load().Active()
}

// toItem 把配置单元转换为视图；withKey=true 时附带完整 Key（仅配置管理列表），
// 否则只回脱敏串。
func toItem(u ai.AIUnit, isActive bool, withKey bool) AIConfigItem {
	item := AIConfigItem{
		ID:        u.ID,
		Name:      u.Name,
		Provider:  u.Provider,
		BaseURL:   u.BaseURL,
		Model:     u.Model,
		KeyMasked: ai.MaskKey(u.APIKey),
		Active:    isActive,
	}
	if withKey {
		item.Key = u.APIKey
	}
	return item
}

// ListAIConfigs 返回全部配置与当前启用 ID。配置管理场景下附带完整 Key，
// 供前端「显示」时查看明文。
func (s *AIService) ListAIConfigs() *util.Response {
	cfg := s.load()
	items := make([]AIConfigItem, 0, len(cfg.Configs))
	for _, u := range cfg.Configs {
		items = append(items, toItem(u, u.ID == cfg.ActiveID, true))
	}
	return util.DoRsp(util.SuccCode, "成功", &AIConfigListResponse{ActiveID: cfg.ActiveID, Configs: items})
}

// GetAIConfig 返回当前启用配置（脱敏）；供 AI 润色可用性判定与测试。
func (s *AIService) GetAIConfig() *util.Response {
	cfg := s.load()
	if u, ok := cfg.Active(); ok {
		return util.DoRsp(util.SuccCode, "成功", toItem(u, true, false))
	}
	return util.DoRsp(util.SuccCode, "成功", AIConfigItem{})
}

// SaveAIConfig 新增或更新一套配置。
// 前端回传的 api_key 若为脱敏串（含 * 占位）表示未改动，沿用已保存的完整 Key。
func (s *AIService) SaveAIConfig(cfg ai.AIUnit) *util.Response {
	cfg.Name = strings.TrimSpace(cfg.Name)
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

	// 读取容器，判断新增 or 更新
	c := s.load()
	idx, exist := findUnit(c.Configs, cfg.ID)
	if exist {
		// API Key：掩码值沿用旧 Key；否则全新（须非空）
		if ai.IsMaskedKey(cfg.APIKey) {
			cfg.APIKey = c.Configs[idx].APIKey
		}
	} else {
		cfg.ID = ai.NewID()
		if cfg.Name == "" {
			cfg.Name = defaultName(len(c.Configs))
		}
	}
	if cfg.Name == "" {
		cfg.Name = c.Configs[idx].Name
	}
	if cfg.APIKey == "" {
		return util.DoRsp(util.ErrCode, "API Key 不能为空", nil)
	}

	// 应用
	if exist {
		c.Configs[idx] = cfg
	} else {
		c.Configs = append(c.Configs, cfg)
	}
	// 首套配置自动设为当前启用
	if c.ActiveID == "" || !unitExists(c.Configs, c.ActiveID) {
		c.ActiveID = cfg.ID
	}

	if err := ai.SaveConfig(s.configMgr.DataDir(), c); err != nil {
		log.Errorf("[ai_service] SaveAIConfig: 持久化失败: %v", err)
		return util.DoRsp(util.ErrCode, "保存 AI 配置失败，请稍后重试", nil)
	}

	log.Infof("[ai_service] SaveAIConfig: id=%s name=%s provider=%s model=%s", cfg.ID, cfg.Name, cfg.Provider, cfg.Model)
	return util.DoRsp(util.SuccCode, "已保存", &AIConfigItem{ID: cfg.ID})
}

// SetActiveAIConfig 将某套配置设为当前启用。
func (s *AIService) SetActiveAIConfig(id string) *util.Response {
	if id == "" {
		return util.DoRsp(util.ErrCode, "配置 ID 不能为空", nil)
	}
	c := s.load()
	if !unitExists(c.Configs, id) {
		return util.DoRsp(util.ErrCode, "配置不存在", nil)
	}
	c.ActiveID = id
	if err := ai.SaveConfig(s.configMgr.DataDir(), c); err != nil {
		log.Errorf("[ai_service] SetActiveAIConfig: 持久化失败: %v", err)
		return util.DoRsp(util.ErrCode, "设置失败，请稍后重试", nil)
	}
	log.Infof("[ai_service] SetActiveAIConfig: active_id=%s", id)
	return util.DoRsp(util.SuccCode, "已切换", nil)
}

// DeleteAIConfig 删除一套配置（连同其 API Key）。删除启用配置后自动回退到第一套或清空。
func (s *AIService) DeleteAIConfig(id string) *util.Response {
	if id == "" {
		return util.DoRsp(util.ErrCode, "配置 ID 不能为空", nil)
	}
	c := s.load()
	if !unitExists(c.Configs, id) {
		return util.DoRsp(util.ErrCode, "配置不存在", nil)
	}
	kept := c.Configs[:0]
	for _, u := range c.Configs {
		if u.ID != id {
			kept = append(kept, u)
		}
	}
	c.Configs = kept
	if c.ActiveID == id {
		switch {
		case len(c.Configs) == 0:
			c.ActiveID = ""
		default:
			c.ActiveID = c.Configs[0].ID
		}
	}
	if err := ai.SaveConfig(s.configMgr.DataDir(), c); err != nil {
		log.Errorf("[ai_service] DeleteAIConfig: 持久化失败 id=%s: %v", id, err)
		return util.DoRsp(util.ErrCode, "删除失败，请稍后重试", nil)
	}
	log.Infof("[ai_service] DeleteAIConfig: id=%s 已删除（剩余 %d 套）", id, len(c.Configs))
	return util.DoRsp(util.SuccCode, "已删除", &AIConfigListResponse{ActiveID: c.ActiveID, Configs: toItems(c.Configs, c.ActiveID, true)})
}

// TestConnection 对指定配置发一次最小请求验证连通性与鉴权；id 为空时用当前启用配置。
func (s *AIService) TestConnection(id string) *util.Response {
	var u ai.AIUnit
	var ok bool
	if id != "" {
		u, ok = s.load().Find(id)
	} else {
		u, ok = s.active()
	}
	if !ok || u.BaseURL == "" || u.APIKey == "" || u.Model == "" {
		return util.DoRsp(util.ErrCode, "配置不完整，请先填写并保存后再测试", nil)
	}

	ctx, cancel := context.WithTimeout(context.Background(), testTimeout)
	defer cancel()

	latency, err := ai.NewClient(u).Test(ctx)
	if err != nil {
		log.Warnf("[ai_service] TestConnection: 连接失败 id=%s: %v", u.ID, err)
		return util.DoRsp(util.ErrCode, "连接失败，请检查接口地址与 API Key 后重试", nil)
	}

	resp := &TestConnectionResponse{OK: true, LatencyMS: latency.Milliseconds()}
	log.Infof("[ai_service] TestConnection: 连接成功 id=%s 耗时 %dms", u.ID, resp.LatencyMS)
	return util.DoRsp(util.SuccCode, "成功", resp)
}

// Chat 发起一次非流式对话（使用当前启用配置），返回助手回复文本。
func (s *AIService) Chat(messages []ai.ChatMessage) *util.Response {
	cfg, ok := s.active()
	if !ok || cfg.BaseURL == "" || cfg.APIKey == "" || cfg.Model == "" {
		return util.DoRsp(util.ErrCode, "未配置 AI，请先在设置页完成并保存配置", nil)
	}
	if len(messages) == 0 {
		return util.DoRsp(util.ErrCode, "对话内容不能为空", nil)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	reply, err := ai.NewClient(cfg).Chat(ctx, messages, nil, nil)
	if err != nil {
		log.Errorf("[ai_service] Chat: 调用大模型失败: %v", err)
		return util.DoRsp(util.ErrCode, "AI 调用失败，请稍后重试", nil)
	}

	log.Infof("[ai_service] Chat: 完成（messages=%d）", len(messages))
	return util.DoRsp(util.SuccCode, "成功", reply)
}

// Polish 对一段开放文本按指定模式进行 AI 润色（使用当前启用配置）。
func (s *AIService) Polish(req PolishRequest) *util.Response {
	if !ai.IsPolishMode(ai.PolishMode(req.Mode)) {
		log.Warnf("[ai_service] Polish: 不支持的润色模式=%s", req.Mode)
		return util.DoRsp(util.ErrCode, "不支持的润色模式", nil)
	}
	if strings.TrimSpace(req.Text) == "" {
		log.Warnf("[ai_service] Polish: 待润色内容为空 mode=%s", req.Mode)
		return util.DoRsp(util.ErrCode, "待润色内容为空", nil)
	}
	if rt := utf8.RuneCountInString(req.Text); rt > polishMaxInputRunes {
		log.Warnf("[ai_service] Polish: 内容过长已拦截 mode=%s semantic=%s runes=%d", req.Mode, req.Semantic, rt)
		return util.DoRsp(util.ErrCode, fmt.Sprintf("内容过长（约 %d 字），建议先精简再润色", rt), nil)
	}

	cfg, ok := s.active()
	if !ok || cfg.BaseURL == "" || cfg.APIKey == "" || cfg.Model == "" {
		log.Warnf("[ai_service] Polish: 未完成 AI 配置，请求被拦截 mode=%s", req.Mode)
		return util.DoRsp(util.ErrCode, "未配置 AI，请先在设置页完成配置", nil)
	}

	msgs, err := ai.BuildPolishMessages(ai.PolishMode(req.Mode), req.Semantic, req.Text)
	if err != nil {
		log.Errorf("[ai_service] Polish: 组装提示词失败 mode=%s: %v", req.Mode, err)
		return util.DoRsp(util.ErrCode, "AI参数有误，请检查后重试", nil)
	}

	ctx, cancel := context.WithTimeout(context.Background(), polishTimeout)
	defer cancel()

	maxTok := ai.MaxPolishResultTokens
	reply, err := ai.NewClient(cfg).Chat(ctx, msgs, nil, &maxTok)
	if err != nil {
		log.Errorf("[ai_service] Polish: mode=%s semantic=%s 调用失败: %v", req.Mode, req.Semantic, err)
		return util.DoRsp(util.ErrCode, "润色失败，请稍后重试", nil)
	}

	log.Infof("[ai_service] Polish: 完成 mode=%s semantic=%s inputRunes=%d outputRunes=%d", req.Mode, req.Semantic, utf8.RuneCountInString(req.Text), utf8.RuneCountInString(reply))
	return util.DoRsp(util.SuccCode, "成功", &PolishResponse{Result: reply})
}

// --- 内部辅助 ---

func findUnit(list []ai.AIUnit, id string) (int, bool) {
	for i, u := range list {
		if u.ID == id {
			return i, true
		}
	}
	return -1, false
}

func unitExists(list []ai.AIUnit, id string) bool {
	_, ok := findUnit(list, id)
	return ok
}

func defaultName(count int) string {
	return fmt.Sprintf("配置%d", count+1)
}

func toItems(list []ai.AIUnit, activeID string, withKey bool) []AIConfigItem {
	items := make([]AIConfigItem, 0, len(list))
	for _, u := range list {
		items = append(items, toItem(u, u.ID == activeID, withKey))
	}
	return items
}