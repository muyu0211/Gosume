package http

import (
	"time"

	"resty.dev/v3"
)

// Options 承载单次请求的可选配置，由 Option（选项模式）注入，
// 未注入的字段沿用服务级配置（见 utils.go 的 buildClient）。
type Options struct {
	timeout     time.Duration     // 请求级超时；0 表示沿用服务级配置
	retryCount  *int              // 请求级重试次数；nil 表示沿用服务级配置
	headers     map[string]string // 请求级附加 Header
	queryParams map[string]string // 请求级 URL 查询参数
	authToken   string            // 请求级 Bearer Token（Authorization: Bearer <token>）
	basicUser   string            // 请求级 Basic 认证用户名
	basicPass   string            // 请求级 Basic 认证密码
	forceJSON   bool              // 强制按 JSON 解析响应体（服务器 Content-Type 不规范时）
	doNotParse  bool              // 不解析响应体（流式读取大文件时，rspBody 应传 nil）
}

// Option 是选项模式的注入函数，按需修改 Options 中的字段。
type Option func(*Options)

func apply(opts ...Option) *Options {
	o := &Options{}
	for _, opt := range opts {
		opt(o)
	}
	return o
}

// WithTimeout 设置单次请求的整体超时，覆盖服务级配置。
func WithTimeout(d time.Duration) Option {
	return func(o *Options) { o.timeout = d }
}

// WithRetryCount 设置单次请求的重试次数，覆盖服务级配置。
// 传 0 表示本次请求不重试（如大文件下载）。
func WithRetryCount(n int) Option {
	return func(o *Options) { o.retryCount = &n }
}

// WithHeader 附加单个请求 Header（如 Authorization）。
// 与 WithHeaders 混用时逐个合并，重复 key 以最后设置者为准。
func WithHeader(key, value string) Option {
	return func(o *Options) {
		if o.headers == nil {
			o.headers = map[string]string{}
		}
		o.headers[key] = value
	}
}

// WithHeaders 一次性附加多个请求 Header。
func WithHeaders(headers map[string]string) Option {
	return func(o *Options) {
		for k, v := range headers {
			o.headers[k] = v
		}
	}
}

// WithQueryParam 附加单个 URL 查询参数。
func WithQueryParam(key, value string) Option {
	return func(o *Options) {
		if o.queryParams == nil {
			o.queryParams = map[string]string{}
		}
		o.queryParams[key] = value
	}
}

// WithBearerAuth 为本次请求附加 Bearer Token（Authorization: Bearer <token>）。
func WithBearerAuth(token string) Option {
	return func(o *Options) { o.authToken = token }
}

// WithBasicAuth 为本次请求附加 Basic 认证（Authorization: Basic <base64>）。
func WithBasicAuth(username, password string) Option {
	return func(o *Options) {
		o.basicUser = username
		o.basicPass = password
	}
}

// WithForceJSON 强制按 JSON 解析响应体到 rspBody，
// 用于服务器返回 Content-Type 不规范（如 text/plain）但实为 JSON 的场景。
func WithForceJSON() Option {
	return func(o *Options) { o.forceJSON = true }
}

// WithDoNotParse 禁用响应体自动解析：响应体经 resp.Body 流式读取，
// 用于下载大文件等场景（此时 rspBody 参数应传 nil）。
func WithDoNotParse() Option {
	return func(o *Options) { o.doNotParse = true }
}

// apply 将 Options 应用到 resty 请求上，返回配置好的请求。
func (o *Options) apply(r *resty.Request) *resty.Request {
	if o.timeout > 0 {
		r.SetTimeout(o.timeout)
	}
	if o.retryCount != nil {
		r.SetRetryCount(*o.retryCount)
	}
	if len(o.headers) > 0 {
		r.SetHeaders(o.headers)
	}
	if len(o.queryParams) > 0 {
		r.SetQueryParams(o.queryParams)
	}
	if o.authToken != "" {
		r.SetAuthToken(o.authToken)
	}
	if o.basicUser != "" || o.basicPass != "" {
		r.SetBasicAuth(o.basicUser, o.basicPass)
	}
	if o.forceJSON {
		r.SetResponseForceContentType("application/json")
	}
	if o.doNotParse {
		r.SetResponseDoNotParse(true)
	}
	return r
}
