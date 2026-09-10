package ai

// MaskKey 对 API Key 脱敏，保留前缀风格与前 4 位、末尾 4 位，中间以 **** 遮蔽。
// 用于回包与日志，绝不回传完整 Key。空串或过短时直接遮蔽为 ****。
func MaskKey(key string) string {
	if key == "" {
		return ""
	}
	rs := []rune(key)
	n := len(rs)
	if n <= 8 {
		return "****"
	}
	const headLen = 4
	return string(rs[:headLen]) + "****" + string(rs[n-4:])
}