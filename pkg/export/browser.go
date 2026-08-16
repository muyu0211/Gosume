package export

import (
	"fmt"
	"io"
	"os"
	"runtime"
	"strings"
	"sync"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/go-rod/rod/lib/proto"
)

// BrowserManager manages a shared headless Chromium instance for PDF and PNG rendering.
// The browser is launched lazily on first use and reused across exports.
type BrowserManager struct {
	mu       sync.Mutex
	browser  *rod.Browser
	launcher *launcher.Launcher // 保存引用，避免 GC 触发清理导致 browser 进程被杀
}

// NewBrowserManager creates a new browser manager. The browser is not launched
// until the first Acquire() call.
func NewBrowserManager() *BrowserManager {
	return &BrowserManager{}
}

// Acquire returns a connected rod.Browser, launching one if necessary.
// The browser is shared across all exports in a session.
//
// 若缓存的 browser 连接已断（进程崩溃、被外部关闭等），会自动重启。
// 健康检查通过 browser.Version() 实现——它是轻量的 CDP 调用，
// 连接异常时立即返回 error。
func (m *BrowserManager) Acquire() (*rod.Browser, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// 缓存的 browser 仍存活则直接复用
	if m.browser != nil {
		if _, err := m.browser.Version(); err == nil {
			return m.browser, nil
		}
		// 连接已断，清理后重启
		m.browser = nil
		m.launcher = nil
	}

	path := findBrowser()
	if path == "" {
		return nil, fmt.Errorf("未找到兼容的 Chromium 浏览器，请安装 Chrome 或 Edge 后重试")
	}

	l := launcher.New().
		Bin(path).
		Headless(true).
		NoSandbox(true).
		Set("disable-gpu").
		Set("disable-software-rasterizer")

	url, err := l.Launch()
	if err != nil {
		return nil, fmt.Errorf("启动浏览器失败: %w", err)
	}

	browser := rod.New().ControlURL(url).MustConnect()
	m.browser = browser
	m.launcher = l
	return browser, nil
}

// Close shuts down the browser.
func (m *BrowserManager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.browser != nil {
		_ = m.browser.Close()
		m.browser = nil
		m.launcher = nil
	}
}

// resetBrowser 强制清理缓存的 browser，下次 Acquire() 会重启。
// 用于渲染过程中检测到连接断开时强制恢复。
func (m *BrowserManager) resetBrowser() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.browser != nil {
		_ = m.browser.Close()
		m.browser = nil
		m.launcher = nil
	}
}

// newPage 创建一个新页面。若 browser 连接已断则自动重启并重试一次。
// PDF/PNG 渲染共用此方法，统一处理"缓存 browser 连接失效"的情况。
func (m *BrowserManager) newPage() (*rod.Page, error) {
	browser, err := m.Acquire()
	if err != nil {
		return nil, err
	}

	page, err := browser.Page(proto.TargetCreateTarget{})
	if err == nil {
		return page, nil
	}

	// Page 失败通常意味着连接已断——强制重置后重启 browser，重试一次。
	m.resetBrowser()
	browser, err = m.Acquire()
	if err != nil {
		return nil, err
	}
	page, err = browser.Page(proto.TargetCreateTarget{})
	if err != nil {
		return nil, fmt.Errorf("创建页面失败: %w", err)
	}
	return page, nil
}

// findBrowser locates a Chromium-based browser on the system.
// Checks GOSUME_CHROMIUM_PATH env var first, then PATH, then well-known install locations.
func findBrowser() string {
	if p := os.Getenv("GOSUME_CHROMIUM_PATH"); p != "" {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}

	if p, _ := launcher.LookPath(); p != "" {
		return p
	}

	switch runtime.GOOS {
	case "windows":
		for _, p := range []string{
			`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
			`C:\Program Files\Microsoft\Edge\Application\msedge.exe`,
			`C:\Program Files\Google\Chrome\Application\chrome.exe`,
			`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
		} {
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
	case "darwin":
		for _, p := range []string{
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
		} {
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
	case "linux":
		for _, p := range []string{
			"/usr/bin/google-chrome",
			"/usr/bin/chromium-browser",
			"/usr/bin/chromium",
		} {
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
	}
	return ""
}

func floatPtr(v float64) *float64 { return &v }

// RenderPDF renders pre-paginated HTML to PDF bytes.
// The HTML should contain A4-sized .resume-page divs with page-break-after rules.
// scale must be 1.0 for correct pagination — larger values cause each page div
// to overflow A4, producing blank pages after each content page.
func (m *BrowserManager) RenderPDF(htmlContent string, scale float64, pageRange string) ([]byte, error) {
	page, err := m.newPage()
	if err != nil {
		return nil, err
	}
	defer page.Close()

	if err := page.SetDocumentContent(htmlContent); err != nil {
		return nil, fmt.Errorf("设置页面内容失败: %w", err)
	}

	page.MustWaitStable()

	paper := PaperFromHTML(htmlContent)

	req := &proto.PagePrintToPDF{
		PaperWidth:          floatPtr(paper.InchW),
		PaperHeight:         floatPtr(paper.InchH),
		MarginTop:           floatPtr(0),
		MarginBottom:        floatPtr(0),
		MarginLeft:          floatPtr(0),
		MarginRight:         floatPtr(0),
		PrintBackground:     true,
		PreferCSSPageSize:   true,
		DisplayHeaderFooter: false,
	}
	if scale > 0 {
		req.Scale = floatPtr(scale)
	}
	if pageRange != "" {
		req.PageRanges = pageRange
	}

	r, err := page.PDF(req)
	if err != nil {
		return nil, fmt.Errorf("生成 PDF 失败: %w", err)
	}
	pdf, err := io.ReadAll(r)
	if err != nil {
		return nil, fmt.Errorf("读取 PDF 数据失败: %w", err)
	}
	return pdf, nil
}

// RenderPNG captures pre-paginated HTML as a continuous PNG screenshot.
//
// The frontend paginator emits a single seamless `.resume-page` (continuous
// mode) whose height fits its content, so PNG export only has to measure the
// document height and screenshot it — no reverse-splitting CSS is injected on
// the backend. scale drives the output pixel density via deviceScaleFactor.
func (m *BrowserManager) RenderPNG(htmlContent string, scale float64) ([]byte, error) {
	page, err := m.newPage()
	if err != nil {
		return nil, err
	}
	defer page.Close()

	if err := page.SetDocumentContent(htmlContent); err != nil {
		return nil, fmt.Errorf("设置页面内容失败: %w", err)
	}

	paper := PaperFromHTML(htmlContent)

	// Initialize the viewport with the paper size so text wraps at the correct
	// width before we measure the document height.
	page.MustSetViewport(paper.PxW, paper.PxH, 1.0, false)
	page.MustWaitStable()

	// Measure the document's real CSS height (independent of scale), then size
	// the viewport to it so CaptureBeyondViewport does not add trailing space.
	result, err := page.Eval(`() => Math.ceil(document.documentElement.scrollHeight)`)
	if err != nil {
		return nil, fmt.Errorf("测量文档高度失败: %w", err)
	}
	cssHeight := int(result.Value.Num())
	if cssHeight <= 0 {
		cssHeight = paper.PxH
	}

	// viewport CSS size is paper width × real height; scale controls the output
	// pixel density via deviceScaleFactor.
	page.MustSetViewport(paper.PxW, cssHeight, scale, false)
	page.MustWaitStable()

	screenshot, err := page.Screenshot(true, &proto.PageCaptureScreenshot{
		Format:                proto.PageCaptureScreenshotFormatPng,
		CaptureBeyondViewport: true,
		FromSurface:           true,
	})
	if err != nil {
		return nil, fmt.Errorf("截图失败: %w", err)
	}

	return screenshot, nil
}

// wrapStandaloneHTML ensures the HTML is a complete document with @page and body
// print rules for headless Chromium. If the input is already a full HTML document
// (has <!DOCTYPE), it injects the CSS into the existing <head>; otherwise it
// wraps the content in a minimal document.
func wrapStandaloneHTML(bodyHTML string) string {
	paper := PaperFromHTML(bodyHTML)
	size := paper.Name
	if m := orientationRe.FindStringSubmatch(bodyHTML); m != nil && m[1] == "landscape" {
		size = paper.Name + " landscape"
	}
	css := fmt.Sprintf(
		`@page { size: %s; margin: 0; } body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`,
		size,
	)
	if !strings.Contains(bodyHTML, "<!DOCTYPE") {
		return fmt.Sprintf(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>%s</style></head><body>%s</body></html>`, css, bodyHTML)
	}
	return strings.Replace(bodyHTML, "</head>", "<style>"+css+"</style></head>", 1)
}
