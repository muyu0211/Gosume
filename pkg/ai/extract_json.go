package ai

import (
	"errors"
	"strings"
)

// ExtractJSON 从模型回复中截取首个平衡的 JSON 值（对象 {} 或数组 []）。
// 容忍 ```json 代码围栏与前后解释文字：定位首个 '{' 或 '['，按括号深度扫描
// 并跳过字符串字面量（含转义），返回该 JSON 值的原文子串。
//
// 共享工具：解析类（recruit 粘贴解析的对象）与润色类（亮点整组的数组）共用；
// 调用方拿到子串后再按各自契约 Unmarshal。
func ExtractJSON(s string) (string, error) {
	start := strings.IndexAny(s, "{[")
	if start < 0 {
		return "", errors.New("模型回复中未找到 JSON")
	}
	openCh, closeCh := s[start], byte('}')
	if openCh == '[' {
		closeCh = ']'
	}
	inStr, esc, depth := false, false, 0
	for i := start; i < len(s); i++ {
		c := s[i]
		if inStr {
			switch {
			case esc:
				esc = false
			case c == '\\':
				esc = true
			case c == '"':
				inStr = false
			}
			continue
		}
		switch c {
		case '"':
			inStr = true
		case '{', '[':
			depth++
		case '}', ']':
			depth--
			if depth == 0 {
				if c != closeCh {
					return "", errors.New("JSON 括号不匹配")
				}
				return s[start : i+1], nil
			}
		}
	}
	return "", errors.New("JSON 不完整")
}
