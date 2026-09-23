package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	ai "gosume/pkg/ai"
	"gosume/pkg/log"
	"gosume/pkg/util"
)

// AIService 提供简历侧的 AI 能力调用：通用对话（Chat）与编辑器 AI 润色（Polish）。
// AI 配置的管理（增删改查/测试连接/厂商预设）属设置域，见 pkg/setting 的 AIConfigService；
// 对话能力由装配层注入 ai.ChatFunc（ai.NewDynamicChat，实时读取当前启用配置）。
type AIService struct {
	chat ai.ChatFunc // 统一对话入口：每次调用实时读取当前启用配置
}

// ServiceName 返回服务名，供 Wails 绑定与前端调用使用。
// ⚠ 绑定全名第三段取结构体名，必须与前端 registerServicePackage 登记的包路径一致。
func (s *AIService) ServiceName() string {
	return "AIService"
}

// Inject 注入 AI 对话能力（与 RecruitService 等其他 service 的注入形式一致：
// 本服务不感知配置文件与数据目录）。
func (s *AIService) Inject(chat ai.ChatFunc) {
	s.chat = chat
}

const (
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

// Chat 发起一次非流式对话（使用当前启用配置），返回助手回复文本。
func (s *AIService) Chat(messages []ai.ChatMessage) *util.Response {
	if len(messages) == 0 {
		return util.DoRsp(util.ErrCode, "对话内容不能为空", nil)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	reply, err := s.chat(ctx, messages)
	if errors.Is(err, ai.ErrNoActiveConfig) {
		return util.DoRsp(util.ErrCode, "未配置 AI，请先在设置页完成并保存配置", nil)
	}
	if err != nil {
		log.Errorf("[resume.ai] Chat: 调用大模型失败: %v", err)
		return util.DoRsp(util.ErrCode, "AI 调用失败，请稍后重试", nil)
	}

	log.Infof("[resume.ai] Chat: 完成（messages=%d）", len(messages))
	return util.DoRsp(util.SuccCode, "成功", reply)
}

// Polish 对一段开放文本按指定模式进行 AI 润色（使用当前启用配置）。
func (s *AIService) Polish(req PolishRequest) *util.Response {
	if !isPolishMode(polishMode(req.Mode)) {
		log.Warnf("[resume.ai] Polish: 不支持的润色模式=%s", req.Mode)
		return util.DoRsp(util.ErrCode, "不支持的润色模式", nil)
	}
	if strings.TrimSpace(req.Text) == "" {
		log.Warnf("[resume.ai] Polish: 待润色内容为空 mode=%s", req.Mode)
		return util.DoRsp(util.ErrCode, "待润色内容为空", nil)
	}
	if rt := utf8.RuneCountInString(req.Text); rt > polishMaxInputRunes {
		log.Warnf("[resume.ai] Polish: 内容过长已拦截 mode=%s semantic=%s runes=%d", req.Mode, req.Semantic, rt)
		return util.DoRsp(util.ErrCode, fmt.Sprintf("内容过长（约 %d 字），建议先精简再润色", rt), nil)
	}

	msgs, err := buildPolishMessages(polishMode(req.Mode), req.Semantic, req.Text)
	if err != nil {
		log.Errorf("[resume.ai] Polish: 组装提示词失败 mode=%s: %v", req.Mode, err)
		return util.DoRsp(util.ErrCode, "AI参数有误，请检查后重试", nil)
	}

	ctx, cancel := context.WithTimeout(context.Background(), polishTimeout)
	defer cancel()

	maxTok := maxPolishResultTokens
	reply, err := s.chat(ctx, msgs, ai.WithMaxTokens(maxTok))
	if errors.Is(err, ai.ErrNoActiveConfig) {
		log.Warnf("[resume.ai] Polish: 未完成 AI 配置，请求被拦截 mode=%s", req.Mode)
		return util.DoRsp(util.ErrCode, "未配置 AI，请先在设置页完成配置", nil)
	}
	if err != nil {
		log.Errorf("[resume.ai] Polish: mode=%s semantic=%s 调用失败: %v", req.Mode, req.Semantic, err)
		return util.DoRsp(util.ErrCode, "润色失败，请稍后重试", nil)
	}

	log.Infof("[resume.ai] Polish: 完成 mode=%s semantic=%s inputRunes=%d outputRunes=%d", req.Mode, req.Semantic, utf8.RuneCountInString(req.Text), utf8.RuneCountInString(reply))
	return util.DoRsp(util.SuccCode, "成功", &PolishResponse{Result: reply})
}

// polishListMaxItems 单次整组亮点润色的条目数上限（防滥用与超长请求）。
const polishListMaxItems = 30

// PolishListRequest 是一次「关键亮点」整组润色请求。
type PolishListRequest struct {
	Items   []string `json:"items"`   // 非空 bullet，顺序即编辑器顺序
	Mode    string   `json:"mode"`    // polish | expand | condense
	Context string   `json:"context"` // 条目上下文（公司 · 职位 等），可空
	Lang    string   `json:"lang"`    // 简历渲染语言（沿用现有语义）
}

// PolishListResponse 是整组润色回包：results[i] 与请求 items[i] 位置对应。
type PolishListResponse struct {
	Results []string `json:"results"`
}

// PolishHighlights 对「关键亮点」整组进行 AI 改写（方案 v0.3 §4）。
// 响应为与 items 等长的 JSON 字符串数组（位置对应）；条目数不一致、截断、
// 解析失败等任何错误都整组不回写（前端保持原样）。
func (s *AIService) PolishHighlights(req PolishListRequest) *util.Response {
	if !isPolishMode(polishMode(req.Mode)) {
		log.Warnf("[resume.ai] PolishHighlights: 不支持的润色模式=%s", req.Mode)
		return util.DoRsp(util.ErrCode, "不支持的润色模式", nil)
	}

	// 过滤空白条目（前端已过滤，此处兜底），并做条目数 / 聚合长度护栏
	items := make([]string, 0, len(req.Items))
	for _, it := range req.Items {
		if v := strings.TrimSpace(it); v != "" {
			items = append(items, v)
		}
	}
	if len(items) == 0 {
		return util.DoRsp(util.ErrCode, "亮点内容为空", nil)
	}
	if len(items) > polishListMaxItems {
		return util.DoRsp(util.ErrCode, fmt.Sprintf("亮点条目过多（%d 条），请精简后再润色", len(items)), nil)
	}
	total := 0
	for _, it := range items {
		total += utf8.RuneCountInString(it)
	}
	if total > polishMaxInputRunes {
		log.Warnf("[resume.ai] PolishHighlights: 聚合长度超限已拦截 total=%d", total)
		return util.DoRsp(util.ErrCode, fmt.Sprintf("亮点总字数约 %d，超出上限 %d，请先精简", total, polishMaxInputRunes), nil)
	}

	msgs := buildPolishListMessages(polishMode(req.Mode), req.Context, items)

	ctx, cancel := context.WithTimeout(context.Background(), polishTimeout)
	defer cancel()

	maxTok := maxPolishResultTokens
	reply, err := s.chat(ctx, msgs, ai.WithMaxTokens(maxTok))
	if errors.Is(err, ai.ErrNoActiveConfig) {
		log.Warnf("[resume.ai] PolishHighlights: 未完成 AI 配置，请求被拦截")
		return util.DoRsp(util.ErrCode, "未配置 AI，请先在设置页完成配置", nil)
	}
	if errors.Is(err, ai.ErrTruncated) {
		// 整组 JSON 输出比单文本多转义开销，思考型模型更易触发；重试无意义，文案引导处理
		log.Errorf("[resume.ai] PolishHighlights: 输出被截断: %v", err)
		return util.DoRsp(util.ErrCode, "模型输出超出长度限制，建议精简亮点或更换模型", nil)
	}
	if err != nil {
		log.Errorf("[resume.ai] PolishHighlights: 调用失败: %v", err)
		return util.DoRsp(util.ErrCode, "润色失败，请稍后重试", nil)
	}

	// 提取 + 解析 + 条目数校验：任何一步失败都整组不回写
	body, err := ai.ExtractJSON(reply)
	if err != nil {
		log.Errorf("[resume.ai] PolishHighlights: %v", err)
		return util.DoRsp(util.ErrCode, "AI 返回格式异常，请重试", nil)
	}
	var results []string
	if err := json.Unmarshal([]byte(body), &results); err != nil {
		log.Errorf("[resume.ai] PolishHighlights: JSON 解析失败: %v", err)
		return util.DoRsp(util.ErrCode, "AI 返回格式异常，请重试", nil)
	}
	if len(results) != len(items) {
		log.Warnf("[resume.ai] PolishHighlights: 条目数不一致 items=%d results=%d", len(items), len(results))
		return util.DoRsp(util.ErrCode, "AI 返回的条目数不一致，请重试", nil)
	}
	for i, r := range results {
		results[i] = strings.TrimSpace(r)
	}

	log.Infof("[resume.ai] PolishHighlights: 完成 mode=%s items=%d", req.Mode, len(items))
	return util.DoRsp(util.SuccCode, "成功", &PolishListResponse{Results: results})
}
