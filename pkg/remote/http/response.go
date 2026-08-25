package http

import (
	"io"
	"net/http"
	"runtime"
	"sync"

	"resty.dev/v3"
)

// Response 封装 resty.Response，将响应流的释放责任收敛到 http 包内部，
// 调用方无需（也不应）手动关闭响应体：
//   - 流式场景（WithDoNotParse）下的响应体读至 EOF 或出错时自动关闭；
//   - 即便调用方既未读尽也未关闭，Response 被 GC 回收时也会兜底释放底层连接。
type Response struct {
	res  *resty.Response
	body io.ReadCloser // 流式场景下的响应流；非流式时为 nil
}

// Body 返回可供流式读取的响应体；仅在 WithDoNotParse() 场景下非 nil。
// 读取至 EOF 后会被自动关闭，调用方不要（也无需）手动 Close()。
func (r *Response) Body() io.ReadCloser { return r.body }

// Header 返回响应头。
func (r *Response) Header() http.Header { return r.res.Header() }

// Size 返回响应体已读取的字节数。
func (r *Response) Size() int64 { return r.res.Size() }

// StatusCode 返回 HTTP 状态码。
func (r *Response) StatusCode() int { return r.res.StatusCode() }

// Status 返回 HTTP 状态字符串。
func (r *Response) Status() string { return r.res.Status() }

// IsStatusFailure 判断响应是否为失败状态（状态码 >= 400）。
func (r *Response) IsStatusFailure() bool { return r.res.IsStatusFailure() }

// close 显式释放底层连接（幂等）；供错误分支或 finalizer 调用。
func (r *Response) close() {
	if r.body != nil {
		r.body.Close()
	}
}

// wrapResponse 按请求结果构造 Response；doNotParse 为真时接管流式响应体的释放。
func wrapResponse(res *resty.Response, doNotParse bool) *Response {
	r := &Response{res: res}
	if doNotParse {
		r.body = &autoCloser{rc: res.Body}
		runtime.SetFinalizer(r, func(v *Response) { v.close() })
	}
	return r
}

// autoCloser 是读至 EOF 或出错即自动关闭的响应流，同时支持显式 Close（幂等）。
type autoCloser struct {
	rc   io.ReadCloser
	once sync.Once
	err  error
}

// Read 读取数据；读到 EOF 或出错时自动释放底层连接。
func (a *autoCloser) Read(p []byte) (int, error) {
	n, err := a.rc.Read(p)
	if err != nil {
		a.close()
	}
	return n, err
}

// Close 显式关闭响应流（幂等）。
func (a *autoCloser) Close() error {
	a.once.Do(func() { a.err = a.rc.Close() })
	return a.err
}

// close 幂等释放底层连接，供读至 EOF 与 finalizer 复用。
func (a *autoCloser) close() {
	a.once.Do(func() { a.err = a.rc.Close() })
}
