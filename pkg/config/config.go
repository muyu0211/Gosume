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
	Client ClientConfig `yaml:"client"`
	App    AppConfig    `yaml:"app"`
	Window WindowConfig `yaml:"window"`
	Log    LogConfig    `yaml:"log"`
}

// ClientConfig 描述统一客户端的全局默认配置与命名服务列表，由 pkg/remote 消费。
type ClientConfig struct {
	Services []ServiceConfig `yaml:"service"` // 命名服务端列表
}

// ServiceConfig 描述单个命名服务端：代码里按 Name 向 remote 申请客户端。
type ServiceConfig struct {
	Name       string `yaml:"name"`        // 服务端名，代码里按此名引用
	Proto      string `yaml:"proto"`       // 客户端使用的协议：http（默认，HTTP 客户端）；后续可扩展 redis/mysql/kafka 等用于 RPC 客户端调用
	Target     string `yaml:"target"`      // 服务端地址（HTTP 基地址）
	TimeoutSec *int   `yaml:"timeout_sec"` // 可选：整体超时秒数；未配置用默认值，显式 0 表示不设整体超时（下载类长请求）
	RetryCount int    `yaml:"retry_count"` // 可选：重试次数；未配置（0）用默认值，仅对幂等请求生效
	Proxy      string `yaml:"proxy"`       // 可选：该服务的代理地址（http/https/socks5）；留空不设代理
}

// ServerConfig 描述服务器配置。
type ServerConfig struct {
	Env string `yaml:"env"`
}

// AppConfig 描述应用基础元信息。
type AppConfig struct {
	Name               string `yaml:"name"`
	Version            string `yaml:"version"`
	Description        string `yaml:"description"`
	Copyright          string `yaml:"copyright"`
	Identifier         string `yaml:"identifier"`
	UpdatePackageFile  string `yaml:"update_package_file"`
	UpdatePackageTmp   string `yaml:"update_package_tmp"`
	UpdateHelperScript string `yaml:"update_helper_script"`
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
		panic(fmt.Sprintf("config: 解析嵌入的 config.yaml 失败: %v", err))
	}

	GlobalConfig.App.UpdatePackageTmp = GlobalConfig.App.UpdatePackageFile + ".part"
	// 更新助手脚本默认名：config.yaml 未声明时取该默认，避免占位符留空。
	// Unix 平台 Helper 将脚本写入 {dataDir}/updates/ 下此文件再执行。
	GlobalConfig.App.UpdateHelperScript = "gosume-update-helper.sh"
}
