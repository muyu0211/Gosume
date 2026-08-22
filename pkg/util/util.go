package util

import (
	"math"
	"os"
	"path/filepath"
	"strings"
)

// GetRootPath 返回配置的锚点目录。
// 若可执行文件同级目录存在 config.json，则视为便携模式，返回该目录；
// 否则回退到操作系统的用户配置目录。
func GetRootPath() string {
	if exePath, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exePath)
		if _, err := os.Stat(filepath.Join(exeDir, "config.json")); err == nil {
			return exeDir
		}
	}
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = filepath.Join(os.Getenv("HOME"), ".config")
	}
	return filepath.Join(configDir, "ResumeCraft")
}

// floatPtr 返回 float64 的指针
func FloatPtr(v float64) *float64 { return &v }

// sanitizeFilename 把文件名中不被文件系统允许的字符替换为下划线。
func SanitizeFilename(name string) string {
	name = strings.TrimSpace(name)
	replacer := strings.NewReplacer(
		"/", "_", "\\", "_", ":", "_", "*", "_",
		"?", "_", "\"", "_", "<", "_", ">", "_", "|", "_",
	)
	return replacer.Replace(name)
}

// Round2 保留两位小数，用于英寸尺寸取整。
func Round2(v float64) float64 {
	return math.Round(v*100) / 100
}

// PxToMm 把 CSS 参考像素（96dpi）换算为毫米。
// 口径与前端排版一致：1in = 96px、1in = 25.4mm，即 1px = 25.4/96 mm。
func PxToMm(px int) float64 {
	return float64(px) * 25.4 / 96
}
