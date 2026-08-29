package http

import (
	"context"
	"fmt"
	"gosume/pkg/config"
	"gosume/pkg/remote"
	"net/http"
	"net/url"
	"strings"
	"time"

	"resty.dev/v3"
)

const (
	defaultTimeoutSec = 15
	defaultRetryCount = 2
)

// Clients 是面向调用方的统一 HTTP 请求门面：封装基本的 REST 请求方法，
// 调用方一行代码即可完成请求发起与响应解析。
// 各方法的 path 均为相对服务 target 的资源路径（执行时自动拼接），传绝对 URL 则按原样请求；
// 返回的 *Response 自行负责响应流的释放，调用方无需手动关闭。
type Clients interface {
	Get(ctx context.Context, path string, rspBody any, opts ...Option) (*Response, error)
	Post(ctx context.Context, path string, reqBody any, rspBody any, opts ...Option) (*Response, error)
	Put(ctx context.Context, path string, reqBody any, rspBody any, opts ...Option) (*Response, error)
	Delete(ctx context.Context, path string, reqBody any, rspBody any, opts ...Option) (*Response, error)
	Patch(ctx context.Context, path string, reqBody any, rspBody any, opts ...Option) (*Response, error)
}

// cli 是 Clients 接口的实现，同时实现 remote.Client 接口以纳入统一客户端工厂。
type cli struct {
	service *config.ServiceConfig // 服务配置
	client  *resty.Client
	opts    []Option
}

// NewHttpClient 返回指定命名服务的 Clients 门面实例。
func NewHttpClient(serviceName string, opts ...Option) *cli {
	svc, ok := remote.GetService(serviceName)
	if !ok {
		panic(fmt.Sprintf("[remote/http] Client: 未找到服务 %s", serviceName))
	}
	if svc.Proto != "" && svc.Proto != remote.ProtoHTTP {
		panic(fmt.Sprintf("[remote/http] Client: 服务 %s 声明了非 HTTP 协议 %s", serviceName, svc.Proto))
	}
	c := buildClient(svc)
	c.opts = append(c.opts, opts...)
	return c
}

// buildClient 按服务声明构建并返回 HTTP resty 客户端
func buildClient(svc *config.ServiceConfig) *cli {
	c := resty.New()
	c.SetBaseURL(svc.Target)

	// 超时：优先服务级显式配置，否则回退客户端级，再否则用内建默认。
	// 显式 0 表示不设整体超时（下载类长请求，由调用方通过 context 或请求级 SetTimeout 控制）。
	timeoutSec := svc.TimeoutSec
	if timeoutSec != nil && *timeoutSec > 0 {
		c.SetTimeout(time.Duration(*timeoutSec) * time.Second)
	} else if timeoutSec == nil {
		c.SetTimeout(defaultTimeoutSec * time.Second)
	}

	// 重试：优先服务级，否则回退客户端级，再否则用内建默认。
	// resty 内建语义为仅幂等请求重试；默认条件覆盖网络错误，
	// 此处补充 5xx 与 429（限流）两类可重试的服务端状态。
	retryCount := svc.RetryCount
	if retryCount <= 0 {
		retryCount = defaultRetryCount
	}
	c.SetRetryCount(retryCount)
	c.AddRetryConditions(resty.RetryConditionStatus5XX, resty.RetryConditionStatusTooManyRequests)

	// 代理：服务级配置，留空不设
	if proxy := svc.Proxy; proxy != "" {
		c.SetProxy(proxy)
	}

	// 统一 User-Agent，便于服务端识别客户端与版本
	app := config.GlobalConfig.App
	c.SetHeader("User-Agent", fmt.Sprintf("%s/%s", app.Name, app.Version))

	// 默认每请求新建独立上下文；超时等全局设置已作用到客户端
	return &cli{service: svc, client: c}
}

// resolveURL 把请求 path 显式拼接服务基地址（服务配置的 target），
// 使 target 的作用可预期、对接层配置保持「target + 相对资源路径」的语义：
//   - path 为绝对 URL（含 scheme，如完整 http(s) 地址）时按原样返回；
//   - 否则视为相对资源路径，规整前后斜杠后拼接在 target 后。
func resolveURL(base, path string) string {
	if u, err := url.Parse(path); err == nil && u.IsAbs() {
		return path
	}
	return strings.TrimRight(base, "/") + "/" + strings.TrimLeft(path, "/")
}

// Close 释放底层连接池（调用方通常无需主动调用，进程退出前如需要可调用）。
func (ci *cli) Close() error {
	return ci.client.Close()
}

// Get 发起 GET 请求；path 为相对服务 target 的资源路径，执行时自动拼接；
// rspBody 非 nil 时自动按 JSON 解析响应体到其中。
func (ci *cli) Get(ctx context.Context, path string, rspBody any, opts ...Option) (*Response, error) {
	return ci.do(ctx, http.MethodGet, path, nil, rspBody, opts...)
}

// Post 发起 POST 请求；path 为相对服务 target 的资源路径；reqBody 为请求体（nil 表示无请求体）。
func (ci *cli) Post(ctx context.Context, path string, reqBody any, rspBody any, opts ...Option) (*Response, error) {
	return ci.do(ctx, http.MethodPost, path, reqBody, rspBody, opts...)
}

// Put 发起 PUT 请求；path 为相对服务 target 的资源路径；reqBody 为请求体（nil 表示无请求体）。
func (ci *cli) Put(ctx context.Context, path string, reqBody any, rspBody any, opts ...Option) (*Response, error) {
	return ci.do(ctx, http.MethodPut, path, reqBody, rspBody, opts...)
}

// Delete 发起 DELETE 请求；path 为相对服务 target 的资源路径；reqBody 为请求体（nil 表示无请求体）。
func (ci *cli) Delete(ctx context.Context, path string, reqBody any, rspBody any, opts ...Option) (*Response, error) {
	return ci.do(ctx, http.MethodDelete, path, reqBody, rspBody, opts...)
}

// Patch 发起 PATCH 请求；path 为相对服务 target 的资源路径；reqBody 为请求体（nil 表示无请求体）。
func (ci *cli) Patch(ctx context.Context, path string, reqBody any, rspBody any, opts ...Option) (*Response, error) {
	return ci.do(ctx, http.MethodPatch, path, reqBody, rspBody, opts...)
}

// ping 发起 GET /ping 请求，用于检查服务是否正常响应。
func (ci *cli) ping(ctx context.Context) error {
	resp, err := ci.do(ctx, http.MethodGet, "/ping", nil, nil, ci.opts...)
	if err != nil {
		return err
	}
	if resp.IsStatusFailure() {
		return fmt.Errorf("ping failed: %s", resp.Status())
	}
	return nil
}

// do 统一执行请求：应用选项、注入 method/请求体/响应体，
// HTTP 状态码 >= 400 时转为 error。
// 调用方只需检查 error 即可覆盖网络错误与业务状态错误两类失败。
// 返回的 *Response 已接管响应流的释放，调用方无需手动关闭。
func (ci *cli) do(ctx context.Context, method, path string, reqBody, rspBody any, opts ...Option) (*Response, error) {
	option := apply(opts...)
	if option.forceHTTP1 {
		ci.client.SetTransport(remote.BuildTransport(ci.service, true))
	}
	r := option.apply(ci.client.R().SetContext(ctx))
	r.SetMethod(method)

	if reqBody != nil {
		r.SetBody(reqBody)
	}
	if rspBody != nil && !option.doNotParse {
		r.SetResult(rspBody)
	}

	res, err := r.Execute(method, resolveURL(ci.client.BaseURL(), path))
	if err != nil {
		return nil, err
	}
	resp := wrapRestyResponse(res, option.doNotParse)

	if res.IsStatusFailure() {
		resp.close()
		return resp, fmt.Errorf("HTTP %d: %s", res.StatusCode(), res.Status())
	}
	return resp, nil
}
