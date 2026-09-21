package service

import (
	"strings"
	"unicode"
)

// 公司名归一化：去重与分组指纹的唯一依据。
// ⚠ 规则必须与前端 lib/recruit/normalize.ts 逐行为一致（双端对拍单测见 normalize_test.go）：
//  1. 去除所有空白（含全角空格 \u3000）
//  2. 去除成对括号及其内容（全角/半角）
//  3. 英文转小写
//  4. 去除一个公司后缀词（命中即止，按序尝试；仅当剩余长度 > 后缀长度）
var normSuffixes = []string{
	"股份有限公司",
	"有限责任公司",
	"有限公司",
	"集团公司",
	"集团",
	"科技",
	"技术",
	"网络",
	"信息",
}

// normalizeCompany 归一化公司名。
func normalizeCompany(raw string) string {
	if strings.TrimSpace(raw) == "" {
		return ""
	}
	var b strings.Builder
	for _, r := range raw {
		if unicode.IsSpace(r) {
			continue
		}
		b.WriteRune(r)
	}
	s := b.String()
	s = stripBracketed(s)
	s = strings.ToLower(s)
	runes := []rune(s)
	for _, suf := range normSuffixes {
		sufRunes := []rune(suf)
		if len(runes) > len(sufRunes) && strings.HasSuffix(s, suf) {
			s = strings.TrimSuffix(s, suf)
			break
		}
	}
	return s
}

// stripBracketed 去除成对括号及其内容（全角/半角，与前端 /[（(][^）)]*[）)]/g 等价）。
func stripBracketed(s string) string {
	var b strings.Builder
	depth := 0
	for _, r := range s {
		switch r {
		case '（', '(':
			depth++
			continue
		case '）', ')':
			if depth > 0 {
				depth--
			}
			continue
		}
		if depth == 0 {
			b.WriteRune(r)
		}
	}
	return b.String()
}
