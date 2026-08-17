package config

import (
	_ "embed"
	"fmt"

	"gopkg.in/yaml.v3"
)

var GlobalConfig *Config

// Config 是应用级配置的根结构，对应 config.yaml。
type Config struct {
	Server ServerConfig `yaml:"server"`
	App    AppConfig    `yaml:"app"`
	Window WindowConfig `yaml:"window"`
	Log    LogConfig    `yaml:"log"`
}

// ServerConfig 描述服务器配置。
type ServerConfig struct {
	Env string `yaml:"env"`
}

// AppConfig 描述应用基础元信息。
type AppConfig struct {
	Name        string `yaml:"name"`
	Version     string `yaml:"version"`
	Description string `yaml:"description"`
	Copyright   string `yaml:"copyright"`
	Identifier  string `yaml:"identifier"`
}

// WindowConfig 描述主窗口的初始与约束参数。
type WindowConfig struct {
	Title     string `yaml:"title"`
	Width     int    `yaml:"width"`
	Height    int    `yaml:"height"`
	MinWidth  int    `yaml:"min_width"`
	MinHeight int    `yaml:"min_height"`
	Frameless bool   `yaml:"frameless"`
}

// LogConfig 描述日志轮转相关参数。
type LogConfig struct {
	Level      string `yaml:"level"`
	MaxSizeMB  int    `yaml:"max_size_mb"`
	MaxBackups int    `yaml:"max_backups"`
	MaxAgeDays int    `yaml:"max_age_days"`
}

// configYAML 是同目录 config.yaml 的原始内容，编译期嵌入二进制。
//
//go:embed config.yaml
var configYAML []byte

// Load 解析嵌入的 config.yaml 并返回配置。
// 解析失败将 panic，因为应用级配置错误应在启动期立即暴露。
func Load() {
	GlobalConfig = &Config{}
	if err := yaml.Unmarshal(configYAML, GlobalConfig); err != nil {
		panic(fmt.Sprintf("app_config: 解析嵌入的 config.yaml 失败: %v", err))
	}
}
