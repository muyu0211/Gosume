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
type BrowserManager struct {
	mu      sync.Mutex
	browser *rod.Browser
}

// NewBrowserManager creates a new browser manager. The browser is not launched
// until the first export call.
func NewBrowserManager() *BrowserManager {
	return &BrowserManager{}
}

// Acquire returns a connected rod.Browser, launching one if necessary.
func (m *BrowserManager) Acquire() (*rod.Browser, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.browser != nil {
		return m.browser, nil
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
	return browser, nil
}

// Close shuts down the browser.
func (m *BrowserManager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.browser != nil {
		m.browser.Close()
		m.browser = nil
	}
}

// findBrowser locates a Chromium-based browser on the system.
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

// RenderPDF renders HTML content to PDF bytes using headless Chromium.
func (m *BrowserManager) RenderPDF(htmlContent string, scale float64, pageRange string) ([]byte, error) {
	browser, err := m.Acquire()
	if err != nil {
		return nil, err
	}

	page, err := browser.Page(proto.TargetCreateTarget{})
	if err != nil {
		return nil, fmt.Errorf("创建页面失败: %w", err)
	}
	defer page.Close()

	if err := page.SetDocumentContent(htmlContent); err != nil {
		return nil, fmt.Errorf("设置页面内容失败: %w", err)
	}

	page.MustWaitStable()

	req := &proto.PagePrintToPDF{
		PaperWidth:          floatPtr(8.27),
		PaperHeight:         floatPtr(11.69),
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

// RenderPNG renders HTML content to PNG screenshot bytes using headless Chromium.
func (m *BrowserManager) RenderPNG(htmlContent string, scale float64) ([]byte, error) {
	browser, err := m.Acquire()
	if err != nil {
		return nil, err
	}

	page, err := browser.Page(proto.TargetCreateTarget{})
	if err != nil {
		return nil, fmt.Errorf("创建页面失败: %w", err)
	}
	defer page.Close()

	if err := page.SetDocumentContent(htmlContent); err != nil {
		return nil, fmt.Errorf("设置页面内容失败: %w", err)
	}

	page.MustWaitStable()

	width := int(794.0 * scale)
	height := int(1123.0 * scale)
	page.MustSetViewport(width, height, 1.0, false)

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

// wrapStandaloneHTML produces a complete HTML document for headless Chromium rendering.
func wrapStandaloneHTML(bodyHTML string) string {
	css := `@page { size: A4; margin: 0; }
body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`
	if !strings.Contains(bodyHTML, "<!DOCTYPE") {
		return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>%s</style>
</head>
<body>
%s
</body>
</html>`, css, bodyHTML)
	}
	return strings.Replace(bodyHTML, "</head>", "<style>"+css+"</style></head>", 1)
}
