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

// BrowserManager 管理共享的无头 Chromium 实例，用于 PDF 与 PNG 渲染。
// 浏览器在首次使用时惰性启动，并在多次导出之间复用。
type BrowserManager struct {
	mu       sync.Mutex
	browser  *rod.Browser
	launcher *launcher.Launcher // 保存引用，避免 GC 触发清理导致 browser 进程被杀
}

// NewBrowserManager 创建浏览器管理器；浏览器直到首次 Acquire 才真正启动。
func NewBrowserManager() *BrowserManager {
	return &BrowserManager{}
}

// Acquire 返回一个已连接的 rod.Browser，必要时启动新实例。
// 同一会话内的所有导出共享该实例。
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

// Close 关闭浏览器并释放相关资源。
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

// findBrowser 在系统中定位基于 Chromium 的浏览器。
// 查找顺序：GOSUME_CHROMIUM_PATH 环境变量 → PATH → 各平台常见安装路径。
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

// floatPtr 返回 float64 的指针，用于填充 CDP 请求中的可选参数。
func floatPtr(v float64) *float64 { return &v }

// RenderPDF 把已分页的 HTML 渲染为 PDF 字节流。
//
// 传入的 HTML 应包含带 page-break-after 规则的 A4 尺寸 .resume-page 容器。
// scale 必须为 1.0 才能保证分页正确——更大的值会使每个页容器溢出 A4，
// 导致每张内容页后面多出一张空白页。
// pageRange 为空时导出全部页面。
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

// RenderPNG 把已分页的 HTML 截取为一张连续的 PNG 图片。
//
// 前端分页器在连续模式下只输出一个高度自适应内容的 `.resume-page`，
// 因此 PNG 导出只需测量文档真实高度后整体截图，后端不再注入任何反向拆分的 CSS。
// scale 通过 deviceScaleFactor 控制输出图片的像素密度。
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

	// 先以纸张尺寸初始化视口，确保文字按正确宽度折行后再测量文档高度
	page.MustSetViewport(paper.PxW, paper.PxH, 1.0, false)
	page.MustWaitStable()

	// 测量文档真实的 CSS 高度（与 scale 无关），再把视口调整为该高度，
	// 避免 CaptureBeyondViewport 在图片底部留下多余空白。
	result, err := page.Eval(`() => Math.ceil(document.documentElement.scrollHeight)`)
	if err != nil {
		return nil, fmt.Errorf("测量文档高度失败: %w", err)
	}
	cssHeight := int(result.Value.Num())
	if cssHeight <= 0 {
		cssHeight = paper.PxH
	}

	// 视口 CSS 尺寸为纸张宽度 × 真实高度；scale 通过 deviceScaleFactor
	// 控制输出像素密度。
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

// wrapStandaloneHTML 确保 HTML 是包含 @page 与 body 打印规则的完整文档，
// 以便无头 Chromium 正确排版。
//
// 若输入已是完整文档（含 <!DOCTYPE），则把 CSS 注入已有的 <head>；
// 否则用一个最小文档骨架包裹内容。
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
