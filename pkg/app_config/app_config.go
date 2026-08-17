// Package app_config 负责加载应用级编译期配置。
//
// 与 pkg/config（用户运行时配置 config.json）区分：
//   - 本包读取 app.yaml，该文件通过 //go:embed 在编译期嵌入二进制
//   - 内容由开发者维护，跟随版本发布，运行时只读
//   - 用于集中管理应用版本号、窗口尺寸、日志参数等框架级参数
package app_config

import (
	"bytes"
	_ "embed"
	"fmt"

	"gopkg.in/yaml.v3"
)

// appYAML 通过 //go:embed 在编译期嵌入 app.yaml
//
//go:embed app.yaml
var appYAML []byte

// AppConfig 是应用级配置的根结构，对应 app.yaml。
type AppConfig struct {
	App    AppConfigApp    `yaml:"app"`
	Window AppConfigWindow `yaml:"window"`
	Log    AppConfigLog    `yaml:"log"`
}

// AppConfigApp 描述应用基础元信息。
type AppConfigApp struct {
	Name        string `yaml:"name"`
	Version     string `yaml:"version"`
	Description string `yaml:"description"`
	Copyright   string `yaml:"copyright"`
	Identifier  string `yaml:"identifier"`
}

// AppConfigWindow 描述主窗口的初始与约束参数。
type AppConfigWindow struct {
	Title     string `yaml:"title"`
	Width     int    `yaml:"width"`
	Height    int    `yaml:"height"`
	MinWidth  int    `yaml:"min_width"`
	MinHeight int    `yaml:"min_height"`
	Frameless bool   `yaml:"frameless"`
}

// AppConfigLog 描述日志轮转相关参数。
type AppConfigLog struct {
	Level      string `yaml:"level"`
	MaxSizeMB  int    `yaml:"max_size_mb"`
	MaxBackups int    `yaml:"max_backups"`
	MaxAgeDays int    `yaml:"max_age_days"`
}

// Load 解析嵌入的 app.yaml 并返回 AppConfig。
// 解析失败将 panic，因为应用级配置错误应在编译期/启动期立即暴露。
func Load() *AppConfig {
	cfg := &AppConfig{}
	if err := yaml.Unmarshal(appYAML, cfg); err != nil {
		panic(fmt.Sprintf("appconfig: failed to parse embedded app.yaml: %v", err))
	}
	return cfg
}

// MustLoadFromBytes 从指定字节流解析 AppConfig，便于测试与自定义嵌入源。
// 主要用于单元测试，运行时请使用 Load。
func MustLoadFromBytes(data []byte) *AppConfig {
	cfg := &AppConfig{}
	dec := yaml.NewDecoder(bytes.NewReader(data))
	dec.KnownFields(true)
	if err := dec.Decode(cfg); err != nil {
		panic(fmt.Sprintf("appconfig: failed to parse yaml: %v", err))
	}
	return cfg
}
