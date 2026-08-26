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
	Name        string       `yaml:"name"`
	Version     string       `yaml:"version"`
	Description string       `yaml:"description"`
	Copyright   string       `yaml:"copyright"`
	Identifier  string       `yaml:"identifier"`
	Update      UpdateConfig `yaml:"update"`
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

// UpdateConfig 汇总在线更新 / 安装替换阶段（Helper）使用的全部参数。
// 原分散在各平台 helper 文件中的硬编码值统一在此初始化（见 loadUpdateConfig），
// 消费方一律从 GlobalConfig.App.Update 读取，便于集中调整与排查。
type UpdateConfig struct {
	// 通用（三平台）
	PackageFile    string // 正式更新包文件名（落地于 {dataDir}/updates/）
	PackageTmp     string // 下载临时文件名（= PackageFile + ".part"）
	WaitTimeoutSec int    // Helper 等待主进程退出重的最长秒数（超时且主进程仍在则中止）

	// Windows：PowerShell Helper 落盘文件与日志、安装器 .exe 副本
	WinHelperScript    string // 更新脚本文件名（%TEMP% 下）
	WinHelperLog       string // 脚本执行进度日志文件名（%TEMP% 下）
	WinInstallerExeTmp string // 安装器 .exe 副本文件名（%TEMP% 下，从 .bin 复制，规避无执行扩展名问题）

	// macOS/Linux：shell Helper 落盘文件名
	UnixHelperScript string // 更新脚本文件名（{dataDir}/updates/ 下）

	// macOS：.app 定位与写权限探测
	AppBundleDepth int    // 从 execPath 向上回溯层级以定位 .app 根（Contents/MacOS/<Name> → 3）
	ProbeFileName  string // 目录写权限探测临时文件名

	// Linux：AppImage 落地可执行权限
	LinuxExecPerm uint32 // 0755
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
	loadUpdateConfig()
}

// loadUpdateConfig 初始化更新/安装相关参数的运行时默认值。
// 这些值是进程内派生的运行时配置（不写入 config.yaml），三平台 Helper 与
// 更新服务统一从 GlobalConfig.App.Update 读取。
func loadUpdateConfig() {
	u := &GlobalConfig.App.Update
	u.PackageFile = "gosume-update.bin"
	u.PackageTmp = u.PackageFile + ".part"
	u.WaitTimeoutSec = 120

	// Windows：Helper 脚本 / 日志 / 安装器副本落 %TEMP%
	u.WinHelperScript = "gosume-update-helper.ps1"
	u.WinHelperLog = "update-helper.log"
	u.WinInstallerExeTmp = "gosume-update-installer.exe"

	// macOS/Linux：shell Helper 脚本落 {dataDir}/updates/
	u.UnixHelperScript = "gosume-update-helper.sh"

	// macOS：execPath 形如 …/Gosume.app/Contents/MacOS/Gosume，上溯 3 层得 .app 根
	u.AppBundleDepth = 3
	u.ProbeFileName = ".gosume-update-probe"

	// Linux：AppImage 需可执行权限
	u.LinuxExecPerm = 0755
}
