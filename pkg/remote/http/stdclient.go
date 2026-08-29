package http

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"gosume/pkg/config"
	"gosume/pkg/log"
	"gosume/pkg/remote"
	"io"
	"net/http"
	"time"
)

// stdCli 是以标准库 net/http 为后端的 Clients 实现
// 流式读取用 WithDoNotParse() 经 resp.Body() 完成，需要原生控制时可用 Raw() 获取 *http.Client。
type stdCli struct {
	service *config.ServiceConfig // 服务配置
	client  *http.Client
	opts    []Option
}

// NewStdHttpClient 返回指定命名服务的标准库后端 Clients 实例。
func NewStdHttpClient(serviceName string, opts ...Option) *stdCli {
	svc, ok := remote.GetService(serviceName)
	if !ok {
		panic(fmt.Sprintf("[remote/http] Client: 未找到服务 %s", serviceName))
	}
	if svc.Proto != "" && svc.Proto != remote.ProtoHTTP {
		panic(fmt.Sprintf("[remote/http] Client: 服务 %s 声明了非 HTTP 协议 %s", serviceName, svc.Proto))
	}

	c := buildStdHttpClient(svc)
	c.opts = append(c.opts, opts...)
	return c
}

func buildStdHttpClient(svc *config.ServiceConfig) *stdCli {
	var timeout time.Duration
	if timeoutSec := svc.TimeoutSec; timeoutSec != nil && *timeoutSec > 0 {
		timeout = time.Duration(*timeoutSec) * time.Second
	} else if timeoutSec == nil {
		timeout = defaultTimeoutSec * time.Second
	}
	return &stdCli{
		service: svc,
		client: &http.Client{
			Transport: remote.BuildTransport(svc, false),
			Timeout:   timeout,
		},
	}
}

// Raw 返回底层标准库 *http.Client，供需要原生控制传输层的场景使用。
func (sc *stdCli) Raw() *http.Client { return sc.client }

// Proto 返回本客户端对应的协议名，实现 remote.Client 接口。
func (sc *stdCli) Proto() string { return remote.ProtoHTTP }

// Close 释放底层连接池（调用方通常无需主动调用）。
func (sc *stdCli) Close() error {
	if t, ok := sc.client.Transport.(*http.Transport); ok {
		t.CloseIdleConnections()
	}
	return nil
}

// Get 发起 GET 请求；path 为相对服务 target 的资源路径，执行时自动拼接；
// rspBody 非 nil 时自动按 JSON 解析响应体到其中。
func (sc *stdCli) Get(ctx context.Context, path string, rspBody any, opts ...Option) (*Response, error) {
	return sc.do(ctx, http.MethodGet, path, nil, rspBody, opts...)
}

// Post 发起 POST 请求；path 为相对服务 target 的资源路径；reqBody 为请求体（nil 表示无请求体）。
func (sc *stdCli) Post(ctx context.Context, path string, reqBody any, rspBody any, opts ...Option) (*Response, error) {
	return sc.do(ctx, http.MethodPost, path, reqBody, rspBody, opts...)
}

// Put 发起 PUT 请求；path 为相对服务 target 的资源路径；reqBody 为请求体（nil 表示无请求体）。
func (sc *stdCli) Put(ctx context.Context, path string, reqBody any, rspBody any, opts ...Option) (*Response, error) {
	return sc.do(ctx, http.MethodPut, path, reqBody, rspBody, opts...)
}

// Delete 发起 DELETE 请求；path 为相对服务 target 的资源路径；reqBody 为请求体（nil 表示无请求体）。
func (sc *stdCli) Delete(ctx context.Context, path string, reqBody any, rspBody any, opts ...Option) (*Response, error) {
	return sc.do(ctx, http.MethodDelete, path, reqBody, rspBody, opts...)
}

// Patch 发起 PATCH 请求；path 为相对服务 target 的资源路径；reqBody 为请求体（nil 表示无请求体）。
func (sc *stdCli) Patch(ctx context.Context, path string, reqBody any, rspBody any, opts ...Option) (*Response, error) {
	return sc.do(ctx, http.MethodPatch, path, reqBody, rspBody, opts...)
}

// do 统一执行请求（标准库后端）：拼接 target、注入 header/查询参数/请求体，
// 状态码 >= 400 时转为 error，与 resty 后端对齐；错误分支已关闭底层连接。
func (sc *stdCli) do(ctx context.Context, method, path string, reqBody, rspBody any, opts ...Option) (*Response, error) {
	opts = append(sc.opts, opts...)
	o := apply(opts...)
	if o.forceHTTP1 {
		sc.client.Transport = remote.BuildTransport(sc.service, true)
	}

	req, err := http.NewRequestWithContext(ctx, method, remote.ResolveURL(sc.service.Target, path), nil)
	if err != nil {
		return nil, err
	}

	// 统一 User-Agent，便于服务端识别客户端与版本
	if app := config.GlobalConfig.App; app.Name != "" && app.Version != "" {
		req.Header.Set("User-Agent", fmt.Sprintf("%s/%s", app.Name, app.Version))
	}
	for k, v := range o.headers {
		req.Header.Set(k, v)
	}
	if o.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+o.authToken)
	}
	if o.basicUser != "" || o.basicPass != "" {
		req.SetBasicAuth(o.basicUser, o.basicPass)
	}
	if len(o.queryParams) > 0 {
		q := req.URL.Query()
		for k, v := range o.queryParams {
			q.Set(k, v)
		}
		req.URL.RawQuery = q.Encode()
	}

	if reqBody != nil {
		b, err := json.Marshal(reqBody)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		req.ContentLength = int64(len(b))
		req.Body = io.NopCloser(bytes.NewReader(b))
	}

	log.Infof("[stdCli] 发起 %s %s 请求", method, req.URL.String())
	res, err := sc.client.Do(req)
	if err != nil {
		return nil, err
	}
	resp := wrapHTTPResponse(res, o.doNotParse)

	if res.StatusCode >= 400 {
		resp.close()
		return resp, fmt.Errorf("%s", res.Status)
	}

	// 非流式：解析到 rspBody 或确认无响应体后主动关闭，避免连接泄漏。
	if !o.doNotParse {
		defer resp.close()
		if rspBody != nil {
			if err := json.NewDecoder(res.Body).Decode(rspBody); err != nil {
				return resp, err
			}
		}
	}
	return resp, nil
}
