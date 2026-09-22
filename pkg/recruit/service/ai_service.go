package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	ai "gosume/pkg/ai"
	"gosume/pkg/log"
	"gosume/pkg/recruit/parse"
	"gosume/pkg/util"
)

// Parse（粘贴解析）的实现规格见 03 方案 §2.5（AI 智能解析，v0.2.1）。
//
// 分层：AI 调用（配置解析/协议/HTTP）直接使用 ai 包（s.chat = ai.NewDynamicChat）；
// 本文件负责解析业务的调用策略（temperature/maxTokens/分级超时）与流程编排
//（清洗 → 非中文预检 → LLM 抽取（重试）→ 后处理 →（失败时）判别）→ *util.Response 封装。
//
// 错误码约定：
//   - 0   成功；
//   - 300 内容判别提示（AI 判定非就业相关）；
//   - 500 未配置 AI / 解析失败（重试 3 次耗尽，用户无感知）。

// errNotJobRelated 判别结论：内容与求职/校招无关（映射为 code=300 提示）。
var errNotJobRelated = errors.New("内容与求职/校招无关")

// 解析业务的调用策略：抽取/判别都要确定性输出；token 预算宁宽勿紧——
// 截断会得到空正文，且思考型模型的思维链也计入 completion_tokens；
// 业务级超时紧于 ai.Client 的 HTTP 兜底超时，且每轮重试独立计时。
const (
	parseMaxTokens    = 1024 // 抽取：完整字段 JSON（含思维链余量）
	classifyMaxTokens = 256  // 判别：{"related":bool}
	parseTimeout      = 15 * time.Second
	classifyTimeout   = 10 * time.Second
	parseMaxRetries   = 3 // 失败后最大重试次数（总调用 = 1 + parseMaxRetries）
)

// parseBackoffs 重试退避间隔。
var parseBackoffs = []time.Duration{200 * time.Millisecond, 500 * time.Millisecond, time.Second, time.Second}

// ParseResult 解析结果——JSON 与前端 types/recruit.ts 的 ParseResult 逐字段对齐（契约冻结）。
// confidence / warnings 恒为非空容器（空对象/空数组，不给 null）。
type ParseResult struct {
	Fields     parse.ParseFields `json:"fields"`
	Confidence map[string]string `json:"confidence"`
	Warnings   []string          `json:"warnings"`
	ReceivedAt *string           `json:"received_at"`
}

// Parse 解析粘贴的邮件/短信原文，返回 ParseResult。
func (s *RecruitService) Parse(raw string, receivedAt *string) *util.Response {
	if strings.TrimSpace(raw) == "" {
		return util.DoRsp(util.ErrCode, "粘贴内容不能为空", nil)
	}
	if s.chat == nil {
		return util.DoRsp(util.ErrCode, "未配置 AI，请先在设置页完成配置", nil)
	}

	// 可取消上下文：前端关闭录入弹窗时经 CancelParse 取消，立即终止后续 LLM 调用。
	ctx, cancel := context.WithCancel(context.Background())
	s.parseMu.Lock()
	s.parseCancel = cancel
	s.parseMu.Unlock()
	defer func() {
		cancel()
		s.parseMu.Lock()
		s.parseCancel = nil
		s.parseMu.Unlock()
	}()

	start := time.Now()
	res, err := s.parsePaste(ctx, raw, receivedAt)

	// 日志只记长度/耗时/字段数，禁止打印原文与字段值
	fieldCount := 0
	if res != nil {
		fieldCount = res.Fields.Count()
	}
	log.Infof("[recruit_service] Parse: rawLen=%d 耗时=%dms fields=%d", len([]rune(raw)), time.Since(start).Milliseconds(), fieldCount)

	if err != nil {
		if errors.Is(err, errNotJobRelated) {
			return util.DoRsp(util.WarnCode, "粘贴的内容似乎不是求职/校招相关通知，请检查后重新粘贴，或改用手动录入", nil)
		}
		if errors.Is(err, ai.ErrNoActiveConfig) {
			return util.DoRsp(util.ErrCode, "未配置 AI，请先在设置页完成配置", nil)
		}
		if errors.Is(err, context.Canceled) {
			log.Infof("[recruit_service] Parse: 已取消（弹窗关闭），停止解析")
			return util.DoRsp(util.ErrCode, "解析已取消", nil)
		}
		if errors.Is(err, ai.ErrTruncated) {
			// 截断随模型而定（思考型模型更易触发），重试无济于事，文案引导换模型
			log.Errorf("[recruit_service] Parse failed: %v", err)
			return util.DoRsp(util.ErrCode, "模型输出超出长度限制（可能为思考型模型），建议更换模型后重试", nil)
		}
		log.Errorf("[recruit_service] Parse failed: %v", err)
		return util.DoRsp(util.ErrCode, "AI 解析失败，请稍后重试，或手动填写", nil)
	}
	return util.DoRsp(util.SuccCode, "", res)
}

// CancelParse 取消进行中的粘贴解析（幂等：无进行中任务时空操作）。
// 前端在关闭录入弹窗（Modal onClose）时调用，终止后台 LLM 调用与重试循环。
func (s *RecruitService) CancelParse() *util.Response {
	s.parseMu.Lock()
	cancel := s.parseCancel
	s.parseMu.Unlock()
	if cancel != nil {
		cancel()
	}
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// parsePaste 完整解析流程：清洗 → 非中文预检 → LLM 抽取（重试）→ 后处理 →（失败时）判别。
// ctx 为可取消上下文：取消时各阶段（LLM 调用/退避等待）立即中止。
func (s *RecruitService) parsePaste(ctx context.Context, raw string, receivedAt *string) (*ParseResult, error) {
	// 文本清洗
	cleaned, truncated := parse.CleanPaste(raw)
	warnings := []string{}
	if truncated {
		warnings = append(warnings, "parseTruncated")
	}

	// 非中文预检：不调 AI、不出网
	if !parse.IsMostlyChinese(cleaned) {
		warnings = append(warnings, "parseNonChinese")
		return &ParseResult{
			Fields:     parse.ParseFields{},
			Confidence: map[string]string{},
			Warnings:   warnings,
			ReceivedAt: receivedAt,
		}, nil
	}

	// 首先调用LLM判断是否是求职相关文本
	if related, err := s.classifyPaste(ctx, cleaned); err == nil && !related {
		return nil, errNotJobRelated
	}

	msgs := buildParseMessages(cleaned, receivedAt, s.companyHints())

	// 抽取主循环：parseMaxRetries 次重试，任一成功即返回
	var lastErr error
	for attempt := 0; attempt <= parseMaxRetries; attempt++ {
		if attempt > 0 {
			if err := reTryCtx(ctx, parseBackoffs[min(attempt-1, len(parseBackoffs)-1)]); err != nil {
				return nil, err
			}
		}
		reply, err := s.chatOnce(ctx, msgs, parseTimeout, parseMaxTokens, ai.DisableStream(), ai.DisableThinking())
		if err != nil {
			if ctxErr := ctx.Err(); ctxErr != nil {
				return nil, ctxErr
			}
			// 截断是确定性结果（temperature=0），重试必然同样失败
			if errors.Is(err, ai.ErrTruncated) {
				lastErr = err
				break
			}
			lastErr = err
			continue
		}
		fields, confidence, pErr := parse.Postprocess(reply)
		if errors.Is(pErr, parse.ErrEmptyFields) {
			break
		}
		if pErr != nil {
			lastErr = pErr
			continue
		}
		return &ParseResult{
			Fields:     fields,
			Confidence: confidence,
			Warnings:   warnings,
			ReceivedAt: receivedAt,
		}, nil
	}

	if lastErr == nil {
		lastErr = fmt.Errorf("解析重试耗尽")
	}
	return nil, fmt.Errorf("AI 解析失败: %w", lastErr)
}

// classifyPaste 判别文本是否与求职/校招相关。
func (s *RecruitService) classifyPaste(ctx context.Context, cleaned string) (bool, error) {
	reply, err := s.chatOnce(ctx, buildClassifyMessages(cleaned), classifyTimeout, classifyMaxTokens)
	if err != nil {
		return true, err
	}
	body, err := parse.ExtractJSON(reply)
	if err != nil {
		return true, err
	}
	var out struct {
		Related *bool `json:"related"`
	}
	if err := json.Unmarshal([]byte(body), &out); err != nil || out.Related == nil {
		return true, fmt.Errorf("判别输出格式无效")
	}
	return *out.Related, nil
}

// chatOnce 单次 AI 调用：绑定解析业务的调用策略（业务级 deadline + 确定性输出 temperature=0）。
// 配置解析/协议/HTTP 由 ai.ChatFunc（ai.NewDynamicChat）承担，策略参数经 hooks 传入。
func (s *RecruitService) chatOnce(ctx context.Context, msgs []ai.ChatMessage, timeout time.Duration, maxTokens int, hook ...ai.RequestHook) (string, error) {
	cctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	hooks := append([]ai.RequestHook{ai.WithTemperature(0), ai.WithMaxTokens(maxTokens)}, hook...)
	return s.chat(cctx, msgs, hooks...)
}

// reTryCtx 可被 ctx 取消的退避等待。
func reTryCtx(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return nil
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

// companyHints 收集公司名与别名作为 prompt 候选提示
func (s *RecruitService) companyHints() []string {
	cs, err := s.companyRepo.List()
	if err != nil {
		log.Errorf("[recruit_service] companyHints: %v", err)
		return nil
	}
	hints := make([]string, 0, len(cs)*2)
	seen := map[string]bool{}
	add := func(v string) {
		v = strings.TrimSpace(v)
		if v == "" || seen[v] || len(hints) >= 60 {
			return
		}
		seen[v] = true
		hints = append(hints, v)
	}
	for _, c := range cs {
		add(c.Name)
		var aliases []string
		if json.Unmarshal([]byte(c.Aliases), &aliases) == nil {
			for _, a := range aliases {
				add(a)
			}
		}
	}
	return hints
}
