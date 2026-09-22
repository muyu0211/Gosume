package service

import (
	"fmt"
	"strings"

	ai "gosume/pkg/ai"
)

const parseSystemPrompt = `你是校招通知解析器。从用户提供的中文邮件/短信纯文本中提取结构化字段。

输入特征与要求：
- 输入是邮件或短信甚至用户自行输入的纯文本投影：可能含零宽残留、硬换行、免责声明、超长注意事项、按钮锚文本（链接可能只存在于锚文本而丢失）。
- 忽略免责声明与噪声，只输出用户可以确认的事实；不确定的字段输出 null，禁止编造、禁止猜测。

输出格式（严格遵守）：
- 仅输出一个 JSON 对象，无 markdown 围栏、无解释文字。
- 结构：{"company":string|null,"position":string|null,"stage":string|null,"round_no":int|null,"event_time":string|null,"event_end":string|null,"deadline":string|null,"link":string|null,"location":string|null,"online":bool|null,"source":string|null,"confidence":{字段名:"high"|"medium"|"low"}}
- confidence 对你提取的每个字段自评置信度；未提取的字段不要出现在 confidence 中。

字段口径：
- company：招聘主体/公司名。中英混排（如「DJI 大疆」「招商银行·招银网络科技」）照原文提取，不拆分；全文无公司名则 null。
- stage：只能取以下枚举之一：assessment（测评）、written（笔试）、interview（面试）、talk（宣讲/招聘会）、offer（录用/意向/三方）、other（材料提交/体检/背调/进度告知等）。纯报告或状态告知类通知 → other。
- round_no：面试轮次。「一面/初试/第一轮」=1，「二面」=2，「三面」=3；「终面/HR面」=0；无法判断或「1-4 轮」类动态表述 → null。
- 时间字段（event_time / event_end / deadline）：统一输出 RFC3339 带时区偏移（默认 +08:00）。
  · event_time = 事件开始时刻或窗口起点；event_end = 结束时刻或窗口终点；无明确结束 → null。
  · 无年份的时间：按接收时间所在年推断；推断结果早于接收时间超过 180 天则年份 +1。
  · 相对表达（「N 小时/天 内」「明天」「本周五」）：以给定接收时间为基准换算为绝对时间；接收时间未知时输出 null。
  · 「窗口区间」（start–end / 至 / --）：event_time 取起点、event_end 取终点。
  · 「截止前完成 / 请于…前 / DDL / 回复截止」→ deadline；与 event_time 并存合法。
  · 「考试时长 120 分钟」「45min 以内」是时长不是时间点，禁止写入任何时间字段。
- link：参加/测评/预约链接。按钮文字与 URL 分离时以 URL 为准；链接丢失则 null。
- location：线下地点（校区/楼/会议室/酒店等地址串）；纯线上 → null。
- online：腾讯会议/飞书/钉钉/Zoom 链接或「线上/远程」→ true；明确线下 → false；无法判断 → null。
- source：email（邮件头特征 From:/主题:/Subject:）、sms（短信特征：短文本+【】签名+退订）、other（无法判断）。

下方「已知信息」是系统注入的候选提示（公司/别名等），仅用于帮助识别与消歧，不是白名单——原文出现列表外的公司名时照实提取。`

// buildParseMessages 组装解析调用的 messages。
// hints 为系统注入的候选提示（公司名/别名），仅拼入 system prompt 尾部。
func buildParseMessages(cleaned string, receivedAt *string, hints []string) []ai.ChatMessage {
	sys := parseSystemPrompt
	if len(hints) > 0 {
		sys += "\n\n已知信息（候选提示，非白名单）：\n" + strings.Join(hints, "、")
	}

	at := "未知"
	if receivedAt != nil && *receivedAt != "" {
		at = *receivedAt
	}
	user := fmt.Sprintf("接收时间：%s\n原文：\n<<<RAW\n%s\nRAW", at, cleaned)
	return []ai.ChatMessage{
		{Role: ai.RoleSystem, Content: sys},
		{Role: ai.RoleUser, Content: user},
	}
}

// classifySystemPrompt 判别调用提示词（3+1 流程的「+1」，§2.5.4）。
const classifySystemPrompt = `你是分类器。判断给定的文本是否与求职/校招/招聘流程相关（投递、测评、笔试、面试、offer、宣讲、进度通知等均算相关）。
仅输出 JSON：{"related": true|false}；不确定时输出 {"related": true}。`

// buildClassifyMessages 组装判别调用的 messages。
func buildClassifyMessages(cleaned string) []ai.ChatMessage {
	text := []rune(cleaned)
	if len(text) > 500 {
		text = text[:500]
	}
	return []ai.ChatMessage{
		{Role: ai.RoleSystem, Content: classifySystemPrompt},
		{Role: ai.RoleUser, Content: "<<<RAW\n" + string(text) + "\nRAW"},
	}
}
