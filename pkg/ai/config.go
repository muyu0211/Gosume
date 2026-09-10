package ai

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// aiConfigFileName 是 AI 配置文件文件名，存放于数据目录内，随数据目录迁移。
const aiConfigFileName = "ai_config.json"

// AIConfig 描述 AI 服务的用户配置。
//
// APIKey 为明文存储（0600 权限限制）。对外回包、日志一律经 MaskKey 脱敏，
// 后续如需更严格安全可升级为系统钥匙串（Windows Credential Manager / macOS Keychain）。
type AIConfig struct {
	Provider string `json:"provider"`  // provider 标识（openai/deepseek/qwen/kimi/zhipu/custom）
	BaseURL  string `json:"base_url"`  // 大模型服务 Base URL（含 /v1 等版本前缀）
	APIKey   string `json:"api_key"`   // API Key（明文）
	Model    string `json:"model"`     // 模型名
	Enabled  bool   `json:"enabled"`   // 是否启用 AI 服务
}

// LoadConfig 从数据目录读取 AI 配置；文件不存在或损坏时返回零值配置。
func LoadConfig(dataDir string) AIConfig {
	var c AIConfig
	if raw, err := os.ReadFile(filepath.Join(dataDir, aiConfigFileName)); err == nil {
		_ = json.Unmarshal(raw, &c)
	}
	return c
}

// SaveConfig 原子落盘 AI 配置。配置文件以 0600 权限写入，避免其他用户读取 API Key。
func SaveConfig(dataDir string, c AIConfig) error {
	b, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return err
	}
	path := filepath.Join(dataDir, aiConfigFileName)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// IsMaskedKey 判断 API Key 是否仍为脱敏回显值（含 "*" 占位）。
// 若为掩码值说明前端未改动 Key，调用方应沿用已持久化的完整 Key。
func IsMaskedKey(key string) bool {
	return key != "" && containsRune(key, '*')
}

// containsRune 判断字符串是否包含指定字符。
func containsRune(s string, c rune) bool {
	for _, r := range s {
		if r == c {
			return true
		}
	}
	return false
}