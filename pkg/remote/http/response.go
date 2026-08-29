package http

import (
	"io"
	"net/http"
	"runtime"
	"sync"

	"resty.dev/v3"
)

// Response 封装底层 HTTP 响应（resty 或标准库后端），将响应流的释放责任收敛到本包内部，
// 调用方无需（也不应）手动关闭响应体：
//   - 流式场景（WithDoNotParse）下的响应体读至 EOF 或出错时自动关闭；
//   - 即便调用方既未读尽也未关闭，Response 被 GC 回收时也会兜底释放底层连接。
type Response struct {
	core responseCore
	body io.ReadCloser // 流式（WithDoNotParse）下经自动关闭逻辑包装的响应流；非流式为 nil
}

// responseCore 抽象底层响应访问，resty 与标准库两种后端各自实现。
type responseCore interface {
	Header() http.Header
	StatusCode() int
	Status() string
	IsStatusFailure() bool
	size() int64
	body() io.ReadCloser
	close()
}

// Body 返回可供流式读取的响应体；仅在 WithDoNotParse() 场景下非 nil。
// 读取至 EOF 或出错后会被自动关闭，调用方不要（也无需）手动 Close()。
func (r *Response) Body() io.ReadCloser { return r.body }

// Header 返回响应头。
func (r *Response) Header() http.Header { return r.core.Header() }

// Size 返回响应体已读取的字节数（流式）或响应体长度（已解析/Content-Length）。
func (r *Response) Size() int64 { return r.core.size() }

// StatusCode 返回 HTTP 状态码。
func (r *Response) StatusCode() int { return r.core.StatusCode() }

// Status 返回 HTTP 状态字符串。
func (r *Response) Status() string { return r.core.Status() }

// IsStatusFailure 判断响应是否为失败状态（状态码 >= 400）。
func (r *Response) IsStatusFailure() bool { return r.core.IsStatusFailure() }

// close 显式释放底层连接（幂等）；供错误分支或 finalizer 调用。
func (r *Response) close() {
	if r.body != nil {
		r.body.Close()
	}
	r.core.close()
}

// restyCore 实现基于 resty.Response 的后端。无响应体可读时无需额外处理
// （resty 已维护缓冲），close 为幂等空操作。
type restyCore struct{ res *resty.Response }

func (c restyCore) Header() http.Header   { return c.res.Header() }
func (c restyCore) StatusCode() int       { return c.res.StatusCode() }
func (c restyCore) Status() string        { return c.res.Status() }
func (c restyCore) IsStatusFailure() bool { return c.res.IsStatusFailure() }
func (c restyCore) size() int64           { return c.res.Size() }
func (c restyCore) body() io.ReadCloser   { return c.res.Body }
func (c restyCore) close()                {}

// httpCore 实现基于标准库 *http.Response 的后端。
type httpCore struct{ res *http.Response }

func (c httpCore) Header() http.Header   { return c.res.Header }
func (c httpCore) StatusCode() int       { return c.res.StatusCode }
func (c httpCore) Status() string        { return c.res.Status }
func (c httpCore) IsStatusFailure() bool { return c.res.StatusCode >= 400 }
func (c httpCore) size() int64           { return c.res.ContentLength }
func (c httpCore) body() io.ReadCloser   { return c.res.Body }
func (c httpCore) close()                { c.res.Body.Close() }

// wrapRestyResponse 基于 resty 请求结果构造 Response；doNotParse 为真时接管流式响应体的释放。
func wrapRestyResponse(res *resty.Response, doNotParse bool) *Response {
	r := &Response{core: restyCore{res: res}}
	if doNotParse {
		r.body = &autoCloser{rc: res.Body}
		runtime.SetFinalizer(r, func(v *Response) { v.close() })
	}
	return r
}

// wrapHTTPResponse 基于标准库响应构造 Response；doNotParse 为真时接管流式响应体的释放，
// 非流式场景由调用方（do）读取解析后主动关闭。
func wrapHTTPResponse(res *http.Response, doNotParse bool) *Response {
	r := &Response{core: httpCore{res: res}}
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