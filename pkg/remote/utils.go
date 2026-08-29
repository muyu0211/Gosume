package remote

import (
	"crypto/tls"
	"gosume/pkg/config"
	"net/http"
	"net/url"
	"strings"
)

// ProtoHTTP 是 HTTP 客户端协议名，也是服务未声明 proto 时的默认协议。
const (
	ProtoHTTP  = "http"
	ProtoMySQL = "mysql"
	ProtoRedis = "redis"
	ProtoMQ    = "kafka"
)

// GetService 按服务名从全局配置中查找服务声明。
func GetService(serviceName string) (*config.ServiceConfig, bool) {
	if config.GlobalConfig == nil {
		panic("[remote] GetService: config.GlobalConfig 未初始化")
	}
	for _, svc := range config.GlobalConfig.Client.Services {
		if svc.Name == serviceName {
			return &svc, true
		}
	}
	return nil, false
}

// buildTransport 构造传给标准库 http.Client 的传输层：
// 代理按服务级配置（留空则沿默认传输层行为）；forceHTTP1 强制 HTTP/1.1
// （关闭 HTTP/2 协商并把 ALPN 限定为 http/1.1，规避连接复用被重置），
// 其余连接池等参数沿用默认传输层。
func BuildTransport(svc *config.ServiceConfig, forceHTTP1 bool) *http.Transport {
	t, ok := http.DefaultTransport.(*http.Transport)
	if !ok {
		t = &http.Transport{}
	} else {
		t = t.Clone()
	}
	if proxy := strings.TrimSpace(svc.Proxy); proxy != "" {
		if u, err := url.Parse(proxy); err == nil {
			t.Proxy = http.ProxyURL(u)
		}
	}
	if forceHTTP1 {
		t.ForceAttemptHTTP2 = false
		if t.TLSClientConfig == nil {
			t.TLSClientConfig = &tls.Config{}
		}
		t.TLSClientConfig.NextProtos = []string{"http/1.1"}
	}
	return t
}

// resolveURL 把请求 path 显式拼接服务基地址（服务配置的 target），
// 使 target 的作用可预期、对接层配置保持「target + 相对资源路径」的语义：
//   - path 为绝对 URL（含 scheme，如完整 http(s) 地址）时按原样返回；
//   - 否则视为相对资源路径，规整前后斜杠后拼接在 target 后。
func ResolveURL(base, path string) string {
	if u, err := url.Parse(path); err == nil && u.IsAbs() {
		return path
	}
	return strings.TrimRight(base, "/") + "/" + strings.TrimLeft(path, "/")
}
