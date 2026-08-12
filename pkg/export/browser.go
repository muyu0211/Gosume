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

// RenderPNG captures pre-paginated HTML as a continuous PNG screenshot.
//
// PNG 不同于 PDF：PDF 按物理 A4 分页输出多页，每页空白是纸张本身；而 PNG 是
// 把所有 .resume-page 拍成一张长图。分页算法给每个 .resume-page 写死了
// height:297mm + overflow:hidden，导致内容不足一页时页底出现大段空白，
// 多页拼在一起就成了"几张纸摞起来"的割裂观感。
//
// 这里采用"连续渲染"模式：注入 CSS 让 .resume-page 收缩到实际内容高度，
// 取消强制分页，再测量文档真实高度后按该高度截图。scale 通过
// deviceScaleFactor 控制输出物理像素密度（scale=2 → 1588×2H 物理）。
// PDF 路径不注入此 CSS，仍按物理 A4 分页，互不影响。
func (m *BrowserManager) RenderPNG(htmlContent string, scale float64) ([]byte, error) {
	page, err := m.newPage()
	if err != nil {
		return nil, err
	}
	defer page.Close()

	if err := page.SetDocumentContent(htmlContent); err != nil {
		return nil, fmt.Errorf("设置页面内容失败: %w", err)
	}

	// 先用 A4 单页尺寸初始化 viewport，确保后续测量 scrollHeight 时
	// 内容按正确宽度布局（viewport 宽度会影响文本换行与最终高度）。
	page.MustSetViewport(794, 1123, 1.0, false)
	page.MustWaitStable()

	// 注入连续渲染 CSS：让每个 .resume-page 收缩到实际内容高度，
	// 取消分页算法强制的固定 297mm 高度 + overflow:hidden + page-break。
	//
	// 注意：rod 的 page.Eval(js) 会把 js 包成
	//   function() { return (<js>).apply(this, arguments) }
	// 因此 js 必须是"函数表达式"（如 `() => {...}`），不能是已立即执行
	// 完的 IIFE（`(() => {...})()` 返回 undefined，再 .apply 会报错）。
	if _, err := page.Eval(pngContinuousCSSJS); err != nil {
		return nil, fmt.Errorf("注入连续渲染 CSS 失败: %w", err)
	}
	page.MustWaitStable()

	// 测量文档实际 CSS 高度（与 scale 无关）。按此设置 viewport 高度，
	// 避免 CaptureBeyondViewport 截到末尾多余空白。
	// 同样传函数表达式，由 rod 包装后 .apply 调用。
	result, err := page.Eval(`() => Math.ceil(document.documentElement.scrollHeight)`)
	if err != nil {
		return nil, fmt.Errorf("测量文档高度失败: %w", err)
	}
	cssHeight := int(result.Value.Num())
	if cssHeight <= 0 {
		cssHeight = 1123
	}

	// viewport CSS 尺寸固定为 A4 宽 × 实际高，scale 通过 deviceScaleFactor
	// 控制输出物理像素密度。
	page.MustSetViewport(794, cssHeight, scale, false)
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

// pngContinuousCSSJS 注入到导出页面，让分页后的 .resume-page 在 PNG 截图时
// 收缩到实际内容高度并消除页间隙。仅用于 PNG 导出；PDF 导出不注入此脚本。
//
// 页间隙来源：每个 .resume-page 都有上下 padding（如 14mm），多页堆叠时
// page1.padding-bottom + page2.padding-top 累加成大段空白。这里把所有 page
// 的上下 padding 归零，改在 .resume-pages-wrapper 层统一加首尾边距（值取自
// 首个 page 的原始 padding），左右 padding 保留不动。
//
// 注意：rod 的 page.Eval(js) 会把 js 包成
//   function() { return (<js>).apply(this, arguments) }
// 因此这里必须返回一个"函数表达式"，由 rod 包装后 .apply 调用。
// 不能写成 IIFE（`(() => {...})()`），否则 IIFE 返回 undefined，再 .apply 报错。
// Go 原始字符串用反引号包裹，故 JS 内部不能再用反引号（模板字符串），
// CSS 文本改用单引号字符串拼接。
const pngContinuousCSSJS = `() => {
	var pages = document.querySelectorAll('.resume-page');
	var padTop = '0px', padBottom = '0px';
	if (pages.length > 0) {
		var cs = getComputedStyle(pages[0]);
		padTop = cs.paddingTop;
		padBottom = cs.paddingBottom;
	}
	var style = document.createElement('style');
	style.id = 'png-continuous-style';
	style.textContent = '.resume-page{height:auto !important;min-height:0 !important;overflow:visible !important;page-break-after:auto !important;break-after:auto !important;margin:0 auto !important;padding-top:0 !important;padding-bottom:0 !important}.resume-pages-wrapper{display:block !important;padding-top:' + padTop + ' !important;padding-bottom:' + padBottom + ' !important}html,body{height:auto !important;overflow:visible !important}';
	document.head.appendChild(style);
}`

// wrapStandaloneHTML ensures the HTML is a complete document with @page and body
// print rules for headless Chromium. If the input is already a full HTML document
// (has <!DOCTYPE), it injects the CSS into the existing <head>; otherwise it
// wraps the content in a minimal document.
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
