package parse

import "strings"

// 解析输入的本地预处理与预检（03 方案 §2.5.1）：
//   - cleanPaste：零宽字符 / 空白 / 长度截断——纯字符级处理，不属于内容解析；
//   - isMostlyChinese：非中文预检（中文字元占比 < 20% 不调 AI、不出网）。
//
// ⚠ 不做正则内容匹配（不做规则引擎解析），语义级清洗交给模型。

// maxRawRunes 原文上限（v0.2.1：前后端同口径 1000 字；前端文本域 maxLength 同值）。
const maxRawRunes = 1000

// cleanPaste 清洗用户粘贴的原文，返回（清洗结果, 是否发生截断）：
//  1. 移除零宽字符（U+200B / U+FEFF，字节/小鹏系样本全篇存在）；
//  2. \r\n → \n；全角空格 → 半角空格；
//  3. 同行内连续空白折叠为单个空格、连续空行折叠为单个空行；
//  4. 超 maxRawRunes 字符截断（防御式——正常由前端 maxLength 拦截）。
func CleanPaste(raw string) (string, bool) {
	var b strings.Builder
	b.Grow(len(raw))
	truncated := false

	runes := []rune(raw)
	for i, r := range runes {
		switch r {
		case '\u200b', '\ufeff': // 零宽空格 / BOM
			continue
		case '\r':
			if i+1 < len(runes) && runes[i+1] == '\n' {
				continue
			}
			b.WriteRune('\n')
		case '\u3000':
			b.WriteRune(' ')
		default:
			b.WriteRune(r)
		}
	}
	out := b.String()

	// 行内空白折叠 + 空行折叠
	lines := strings.Split(out, "\n")
	for i, ln := range lines {
		lines[i] = collapseSpaces(ln)
	}
	out = strings.Join(lines, "\n")
	out = collapseBlankLines(out)

	// 长度截断（按字符数，不截半个 rune）
	if len([]rune(out)) > maxRawRunes {
		out = string([]rune(out)[:maxRawRunes])
		truncated = true
	}
	return strings.TrimSpace(out), truncated
}

// collapseSpaces 折叠行内连续空白（空格/制表符）为单个空格。
func collapseSpaces(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	prevSpace := false
	for _, r := range s {
		if r == ' ' || r == '\t' {
			if !prevSpace {
				b.WriteRune(' ')
			}
			prevSpace = true
			continue
		}
		prevSpace = false
		b.WriteRune(r)
	}
	return b.String()
}

// collapseBlankLines 折叠连续空行为单个空行。
func collapseBlankLines(s string) string {
	lines := strings.Split(s, "\n")
	out := make([]string, 0, len(lines))
	blank := false
	for _, ln := range lines {
		empty := strings.TrimSpace(ln) == ""
		if empty && blank {
			continue
		}
		blank = empty
		out = append(out, ln)
	}
	return strings.Join(out, "\n")
}

// IsMostlyChinese 判断文本是否以中文为主：中文字元（U+4E00–U+9FA5）占
// 非空白字符的比例 < 20% 视为非中文（AC-28 / Q6：仅支持中文通知解析）。
func IsMostlyChinese(s string) bool {
	total, chinese := 0, 0
	for _, r := range s {
		if r == ' ' || r == '\t' || r == '\n' {
			continue
		}
		total++
		if r >= 0x4e00 && r <= 0x9fa5 {
			chinese++
		}
	}
	if total == 0 {
		return false
	}
	return chinese*5 >= total
}
