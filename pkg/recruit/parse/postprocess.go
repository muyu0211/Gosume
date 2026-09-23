package parse

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	ai "gosume/pkg/ai"
	"gosume/pkg/log"
	recruitmodel "gosume/pkg/recruit/model"
)

// errEmptyFields 模型返回合法 JSON 但没有任何可落地字段。
var ErrEmptyFields = errors.New("模型未提取到任何字段")

// aiOutput 是模型返回的原始 JSON 结构（字段全可空，逐个校验后落入 ParseFields）。
type aiOutput struct {
	Company    *string        `json:"company"`
	Position   *string        `json:"position"`
	Stage      *string        `json:"stage"`
	RoundNo    *float64       `json:"round_no"`
	EventTime  *string        `json:"event_time"`
	EventEnd   *string        `json:"event_end"`
	Deadline   *string        `json:"deadline"`
	Link       *string        `json:"link"`
	Location   *string        `json:"location"`
	Online     *bool          `json:"online"`
	Source     *string        `json:"source"`
	Confidence map[string]any `json:"confidence"`
}

// ParseFields 解析结果字段（JSON 只包含提取到的键——前端只填空字段、缺省键 = 未识别）。
type ParseFields struct {
	Company   string  `json:"company,omitempty"`
	Position  string  `json:"position,omitempty"`
	Stage     string  `json:"stage,omitempty"`
	RoundNo   *int    `json:"round_no,omitempty"`
	EventTime *string `json:"event_time,omitempty"`
	EventEnd  *string `json:"event_end,omitempty"`
	Deadline  *string `json:"deadline,omitempty"`
	Link      string  `json:"link,omitempty"`
	Location  string  `json:"location,omitempty"`
	Online    *bool   `json:"online,omitempty"`
	Source    string  `json:"source,omitempty"`
}

// empty 判断是否一个字段都没提取到（触发判别流程的「全 null」边界）。
func (f ParseFields) empty() bool {
	return f == ParseFields{}
}

// Count 落地字段数（日志用，不打印字段值）。
func (f ParseFields) Count() int {
	n := 0
	if f.Company != "" {
		n++
	}
	if f.Position != "" {
		n++
	}
	if f.Stage != "" {
		n++
	}
	if f.RoundNo != nil {
		n++
	}
	if f.EventTime != nil {
		n++
	}
	if f.EventEnd != nil {
		n++
	}
	if f.Deadline != nil {
		n++
	}
	if f.Link != "" {
		n++
	}
	if f.Location != "" {
		n++
	}
	if f.Online != nil {
		n++
	}
	if f.Source != "" {
		n++
	}
	return n
}

// ExtractJSON 从模型回复中截取首个平衡的 JSON 对象。
// 实现已泛化并上移至 pkg/ai（支持对象与数组），此处保留导出别名以
// 维持 recruit 既有调用点不变。
func ExtractJSON(s string) (string, error) {
	return ai.ExtractJSON(s)
}

// normalizeTime 时间归一化：接受 RFC3339 / 无偏移时刻 / 纯日期，
// 统一输出 RFC3339 本地时区；无法解析返回 false。
func normalizeTime(s string) (string, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", false
	}
	layouts := []string{
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
		"2006-01-02T15:04",
		"2006-01-02",
	}
	for _, lc := range layouts {
		if t, err := time.ParseInLocation(lc, s, time.Local); err == nil {
			return t.Local().Format(time.RFC3339), true // 统一本地时区偏移（§3.7 时间口径）
		}
	}
	return "", false
}

// firstURL 取字符串中首个 http(s) URL（容忍模型把多个 URL 或说明文字混在一个字段里）。
func firstURL(s string) (string, bool) {
	for _, tok := range strings.FieldsFunc(s, func(r rune) bool { return r == ' ' || r == '\t' || r == '\n' }) {
		if strings.HasPrefix(tok, "http://") || strings.HasPrefix(tok, "https://") {
			return tok, true
		}
	}
	return "", false
}

// postprocess 校验并归一化模型输出：
// 返回（字段, 置信度, 错误）。全字段为空返回 errEmptyFields（触发判别流程）；
// JSON 结构非法返回普通错误（进入重试）。
func Postprocess(reply string) (ParseFields, map[string]string, error) {
	body, err := ExtractJSON(reply)
	if err != nil {
		return ParseFields{}, nil, err
	}
	log.Infof("LLM 解析结果:%v", reply)
	var out aiOutput
	if err := json.Unmarshal([]byte(body), &out); err != nil {
		return ParseFields{}, nil, fmt.Errorf("JSON 解析失败: %w", err)
	}

	conf := func(field string) string {
		if out.Confidence != nil {
			if s, ok := out.Confidence[field].(string); ok {
				switch s {
				case "high", "medium", "low":
					return s
				}
			}
		}
		return "low"
	}

	f := ParseFields{}
	if v := strings.TrimSpace(derefStr(out.Company)); v != "" {
		f.Company, _ = cutRunes(v, 100)
	}
	if v := strings.TrimSpace(derefStr(out.Position)); v != "" {
		f.Position, _ = cutRunes(v, 100)
	}
	if v := strings.TrimSpace(derefStr(out.Location)); v != "" {
		f.Location, _ = cutRunes(v, 200)
	}
	if out.Stage != nil && recruitmodel.Contains(recruitmodel.Stages, *out.Stage) && *out.Stage != "apply" {
		f.Stage = *out.Stage
	}
	if out.RoundNo != nil && *out.RoundNo >= 0 && *out.RoundNo <= 9 {
		n := int(*out.RoundNo)
		f.RoundNo = &n
	}
	norm := func(p *string) *string {
		if p == nil {
			return nil
		}
		v, ok := normalizeTime(*p)
		if !ok {
			return nil
		}
		return &v
	}
	f.EventTime = norm(out.EventTime)
	f.EventEnd = norm(out.EventEnd)
	f.Deadline = norm(out.Deadline)
	if f.EventTime != nil && f.EventEnd != nil {
		te, e1 := time.Parse(time.RFC3339, *f.EventTime)
		tx, e2 := time.Parse(time.RFC3339, *f.EventEnd)
		if e1 == nil && e2 == nil && tx.Before(te) {
			f.EventEnd = nil
		}
	}
	if out.Link != nil {
		if u, ok := firstURL(*out.Link); ok {
			f.Link = u
		}
	}
	if out.Online != nil {
		f.Online = out.Online
	}
	if out.Source != nil && recruitmodel.Contains(recruitmodel.Sources, *out.Source) && *out.Source != "manual" {
		f.Source = *out.Source
	}

	if f.empty() {
		return ParseFields{}, nil, ErrEmptyFields
	}

	// 置信度映射：只为落地的字段标注；被丢弃/缺省 → low；整体恒为非空对象（契约）
	m := map[string]string{}
	for field, present := range map[string]bool{
		"company":    f.Company != "",
		"position":   f.Position != "",
		"stage":      f.Stage != "",
		"round_no":   f.RoundNo != nil,
		"event_time": f.EventTime != nil,
		"event_end":  f.EventEnd != nil,
		"deadline":   f.Deadline != nil,
		"link":       f.Link != "",
		"location":   f.Location != "",
		"online":     f.Online != nil,
		"source":     f.Source != "",
	} {
		if present {
			m[field] = conf(field)
		}
	}
	return f, m, nil
}

func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// cutRunes 按字符数截断（防模型输出超长串撑爆表单）。
func cutRunes(s string, n int) (string, bool) {
	r := []rune(s)
	if len(r) <= n {
		return s, false
	}
	return string(r[:n]), true
}
