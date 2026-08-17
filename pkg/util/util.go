package util

import (
	"os"
	"path/filepath"
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
