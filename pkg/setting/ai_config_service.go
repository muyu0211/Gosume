package setting

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	ai "gosume/pkg/ai"
	"gosume/pkg/config"
	"gosume/pkg/log"
	"gosume/pkg/util"
)

// AIConfigService 提供多套 AI 配置的管理（设置域）：增删改查、单选启用、
// 测试连接与厂商预设下发。AI 能力调用（对话/润色）不在此——见各业务 service
// （如 pkg/resume/service 的 AIService），其对话能力由装配层注入 ai.ChatFunc。
type AIConfigService struct {
	configMgr *config.Manager
}

// ServiceName 返回服务名，供 Wails 绑定与前端调用使用。
// ⚠ 绑定全名第三段取结构体名，必须与前端 registerServicePackage 登记的包路径一致。
func (s *AIConfigService) ServiceName() string {
	return "AIConfigService"
}

// Inject 注入依赖：数据目录配置管理器（用于读写 ai_config.json）。
func (s *AIConfigService) Inject(configMgr *config.Manager) {
	s.configMgr = configMgr
}

// testTimeout 是「测试连接」的单次超时（比真实 Chat 更短，快速反馈）。
const testTimeout = 15 * time.Second

// load 读取配置容器（含旧单配置迁移）。
func (s *AIConfigService) load() ai.AIConfig {
	return ai.LoadConfig(s.configMgr.DataDir())
}

// AIConfigItem 是返回给前端的单套配置视图。
// API Key 默认脱敏；only 配置管理列表（ListAIConfigs）经 withKey 下发完整 Key，
// 供用户在「显示」时查看真实明文。其余场景（如 AI 可用性判定）保持脱敏不返回。
// 配置没有独立的名称字段：模型名即标识与展示名（同一 provider 下唯一）。
type AIConfigItem struct {
	ID        string `json:"id"`
	Provider  string `json:"provider"`
	BaseURL   string `json:"base_url"`
	Model     string `json:"model"`
	Key       string `json:"key,omitempty"` // 完整 Key，仅 withKey=true 时返回
	KeyMasked string `json:"key_masked"`
	Active    bool   `json:"active"` // 是否为当前启用
}

// AIConfigListResponse 是多配置列表回包。
type AIConfigListResponse struct {
	ActiveID string         `json:"active_id"`
	Configs  []AIConfigItem `json:"configs"`
}

// TestConnectionResponse 是「测试连接」的结果。
type TestConnectionResponse struct {
	OK        bool   `json:"ok"`
	LatencyMS int64  `json:"latency_ms,omitempty"`
	Message   string `json:"message,omitempty"`
}

// AIProvidersResponse 是厂商预设列表回包（前端下拉联动的数据源）。
type AIProvidersResponse struct {
	Providers []ai.ProviderPreset `json:"providers"`
}

// ListAIProviders 返回后端集中维护的厂商预设（展示名 / Base URL / 默认模型 / 候选模型）。
// 厂商配置以 pkg/ai/presets.go 为唯一来源，前端只负责渲染，不再硬编码任何厂商参数；
// 增删厂商或调整模型只改后端即可，无需发版前端。
func (s *AIConfigService) ListAIProviders() *util.Response {
	return util.DoRsp(util.SuccCode, "成功", &AIProvidersResponse{Providers: ai.ProviderPresets()})
}

// ListAIConfigs 返回全部配置与当前启用 ID。配置管理场景下附带完整 Key，
// 供前端「显示」时查看明文。
func (s *AIConfigService) ListAIConfigs() *util.Response {
	cfg := s.load()
	items := make([]AIConfigItem, 0, len(cfg.Configs))
	for _, u := range cfg.Configs {
		items = append(items, toItem(u, u.ID == cfg.ActiveID, true))
	}
	return util.DoRsp(util.SuccCode, "成功", &AIConfigListResponse{ActiveID: cfg.ActiveID, Configs: items})
}

// GetAIConfig 返回当前启用配置（脱敏）；供 AI 润色可用性判定与测试。
func (s *AIConfigService) GetAIConfig() *util.Response {
	cfg := s.load()
	if u, ok := cfg.Active(); ok {
		return util.DoRsp(util.SuccCode, "成功", toItem(u, true, false))
	}
	return util.DoRsp(util.SuccCode, "成功", AIConfigItem{})
}

// SaveAIConfig 新增或更新一套配置。
// 前端回传的 api_key 若为脱敏串（含 * 占位）表示未改动，沿用已保存的完整 Key。
func (s *AIConfigService) SaveAIConfig(cfg ai.AIUnit) *util.Response {
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
	}
	if cfg.APIKey == "" {
		return util.DoRsp(util.ErrCode, "API Key 不能为空", nil)
	}

	// 同一服务商下模型名唯一：新增或改模型撞到别的配置时直接拒绝，
	// 保证「模型名」能无歧义地指代一套配置。
	if i, dup := findByModel(c.Configs, cfg.Provider, cfg.Model); dup && (!exist || c.Configs[i].ID != cfg.ID) {
		log.Warnf("[setting.ai_config] SaveAIConfig: 模型名重复被拒 provider=%s model=%s", cfg.Provider, cfg.Model)
		return util.DoRsp(util.ErrCode, fmt.Sprintf("「%s」已配置过，同一服务商下模型名不能重复", cfg.Model), nil)
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
		log.Errorf("[setting.ai_config] SaveAIConfig: 持久化失败: %v", err)
		return util.DoRsp(util.ErrCode, "保存 AI 配置失败，请稍后重试", nil)
	}

	log.Infof("[setting.ai_config] SaveAIConfig: id=%s provider=%s model=%s", cfg.ID, cfg.Provider, cfg.Model)
	return util.DoRsp(util.SuccCode, "已保存", &AIConfigItem{ID: cfg.ID})
}

// SetActiveAIConfig 将某套配置设为当前启用。
func (s *AIConfigService) SetActiveAIConfig(id string) *util.Response {
	if id == "" {
		return util.DoRsp(util.ErrCode, "配置 ID 不能为空", nil)
	}
	c := s.load()
	if !unitExists(c.Configs, id) {
		return util.DoRsp(util.ErrCode, "配置不存在", nil)
	}
	c.ActiveID = id
	if err := ai.SaveConfig(s.configMgr.DataDir(), c); err != nil {
		log.Errorf("[setting.ai_config] SetActiveAIConfig: 持久化失败: %v", err)
		return util.DoRsp(util.ErrCode, "设置失败，请稍后重试", nil)
	}
	log.Infof("[setting.ai_config] SetActiveAIConfig: active_id=%s", id)
	return util.DoRsp(util.SuccCode, "已切换", nil)
}

// DeleteAIConfig 删除一套配置（连同其 API Key）。删除启用配置后自动回退到第一套或清空。
func (s *AIConfigService) DeleteAIConfig(id string) *util.Response {
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
		log.Errorf("[setting.ai_config] DeleteAIConfig: 持久化失败 id=%s: %v", id, err)
		return util.DoRsp(util.ErrCode, "删除失败，请稍后重试", nil)
	}
	log.Infof("[setting.ai_config] DeleteAIConfig: id=%s 已删除（剩余 %d 套）", id, len(c.Configs))
	return util.DoRsp(util.SuccCode, "已删除", &AIConfigListResponse{ActiveID: c.ActiveID, Configs: toItems(c.Configs, c.ActiveID, true)})
}

// TestConnection 对指定配置发一次最小请求验证连通性与鉴权；id 为空时用当前启用配置。
func (s *AIConfigService) TestConnection(id string) *util.Response {
	var u ai.AIUnit
	var ok bool
	if id != "" {
		u, ok = s.load().Find(id)
	} else {
		u, ok = s.load().Active()
	}
	if !ok || u.BaseURL == "" || u.APIKey == "" || u.Model == "" {
		return util.DoRsp(util.ErrCode, "配置不完整，请先填写并保存后再测试", nil)
	}

	ctx, cancel := context.WithTimeout(context.Background(), testTimeout)
	defer cancel()

	latency, err := ai.NewClient(u).Test(ctx)
	if err != nil {
		log.Warnf("[setting.ai_config] TestConnection: 连接失败 id=%s: %v", u.ID, err)
		return util.DoRsp(util.ErrCode, "连接失败，请检查接口地址与 API Key 后重试", nil)
	}

	resp := &TestConnectionResponse{OK: true, LatencyMS: latency.Milliseconds()}
	log.Infof("[setting.ai_config] TestConnection: 连接成功 id=%s 耗时 %dms", u.ID, resp.LatencyMS)
	return util.DoRsp(util.SuccCode, "成功", resp)
}

// --- 内部辅助 ---

// toItem 把配置单元转换为视图；withKey=true 时附带完整 Key（仅配置管理列表），
// 否则只回脱敏串。
func toItem(u ai.AIUnit, isActive bool, withKey bool) AIConfigItem {
	item := AIConfigItem{
		ID:        u.ID,
		Provider:  u.Provider,
		BaseURL:   u.BaseURL,
		Model:     u.Model,
		KeyMasked: util.MaskKey(u.APIKey),
		Active:    isActive,
	}
	if withKey {
		item.Key = u.APIKey
	}
	return item
}

func toItems(list []ai.AIUnit, activeID string, withKey bool) []AIConfigItem {
	items := make([]AIConfigItem, 0, len(list))
	for _, u := range list {
		items = append(items, toItem(u, u.ID == activeID, withKey))
	}
	return items
}

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

// findByModel 按「服务商 + 模型名」查找配置（忽略大小写，与唯一性口径一致）。
func findByModel(list []ai.AIUnit, provider, model string) (int, bool) {
	for i, u := range list {
		if strings.EqualFold(u.Provider, provider) && strings.EqualFold(u.Model, model) {
			return i, true
		}
	}
	return -1, false
}
