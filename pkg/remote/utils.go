package remote

import (
	"gosume/pkg/config"
)

// ProtoHTTP 是 HTTP 客户端协议名，也是服务未声明 proto 时的默认协议。
const (
	ProtoHTTP  = "http"
	ProtoMySQL = "mysql"
	ProtoRedis = "redis"
	ProtoMQ    = "kafka"
)

// Client 是所有协议客户端的最小公共契约：
// 既能标识当前客户端的协议，又能在不再使用时释放底层资源。
// 需要协议特有能力的调用方，可将返回值断言为对应协议的具体客户端类型。
type Client interface {
	Proto() string // 当前客户端对应的协议名
	Close() error  // 关闭并释放底层连接/资源
}

// GetService 按服务名从全局配置中查找服务声明。
func GetService(serviceName string) (config.ServiceConfig, bool) {
	if config.GlobalConfig == nil {
		panic("[remote] GetService: config.GlobalConfig 未初始化")
	}
	for _, svc := range config.GlobalConfig.Client.Services {
		if svc.Name == serviceName {
			return svc, true
		}
	}
	return config.ServiceConfig{}, false
}
