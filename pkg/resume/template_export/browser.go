package template_export

import (
	"bytes"
	"fmt"
	"gosume/pkg/log"
	"gosume/pkg/util"
	"image"
	"io"
	"math"
	"os"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-pdf/fpdf"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/go-rod/rod/lib/proto"
)

// ── 导出格式与配置 ────────────────────────────────────────────────────────────

const (
	ExportTypeSinglePDF = "single_pdf"
	ExportTypePDF       = "pdf"
	ExportTypePNG       = "png"
)

// 支持的导出格式。
const (
	FormatPDF string = "pdf"
	FormatPNG string = "png"
)

// 支持的导出格式。
var ExportFormatMap = map[string]string{
	ExportTypePDF:       FormatPDF,
	ExportTypePNG:       FormatPNG,
	ExportTypeSinglePDF: FormatPDF,
}

// ExportOptions 配置导出行为。
//
// Scale 为缩放比例（PDF 应为 1.0）；PageRange 为页码范围，为空表示全部页面。
type ExportOptions struct {
	ExportType string  `json:"export_type"` // 导出类型，单页pdf，多页pdf，png
	FileFormat string  `json:"format"`      // 导出格式
	Scale      float64 `json:"scale"`       // 缩放比例
	PageRange  string  `json:"page_range"`  // 页码范围
}

// ── 无头 Chromium 渲染 ─────────────────────────────────────────────────────────

// 健康探测超时。连接正常时探测只需几 ms；连接半死（TCP 存活但无响应）时，
// 若不设超时，探测会长时间挂起（曾观测到 ~500ms）。设短超时让探测快速失败，
// 从而走重建路径恢复，避免拖慢每次导出。
const (
	pageProbeTimeout    = 150 * time.Millisecond
	browserProbeTimeout = 150 * time.Millisecond
	renderStableTimeout = 100 * time.Millisecond // renderStableTimeout 用于渲染前/截图前的稳定等待窗口。
)

// BrowserManager 管理共享的无头 Chromium 实例，用于 PDF 与 PNG 渲染。
// 浏览器在首次使用时惰性启动，并在多次导出之间复用。
type BrowserManager struct {
	mu       sync.Mutex
	browser  *rod.Browser
	launcher *launcher.Launcher // 保存引用，避免 GC 触发清理导致 browser 进程被杀
	page     *rod.Page          // 维护全局一个page对象
}

// NewBrowserManager 创建浏览器管理器；浏览器直到首次 Acquire 才真正启动。
func NewBrowserManager() *BrowserManager {
	return &BrowserManager{}
}

// GetBrower 返回一个已连接的 rod.Browser，必要时启动新实例。
// 同一会话内的所有导出共享该实例。
//
// 若缓存的 browser 连接已断（进程崩溃、被外部关闭等），会自动重启。
// 健康检查通过 browser.Version() 实现——它是轻量的 CDP 调用，
// 连接异常时立即返回 error。
func (m *BrowserManager) GetBrower() (*rod.Browser, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.getBrower()
}

// Close 关闭浏览器并释放相关资源。
func (m *BrowserManager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.resetBrowser()
}

// getBrower 返回已连接的 browser。
func (m *BrowserManager) getBrower() (*rod.Browser, error) {
	// 缓存的 browser 仍存活则直接复用；探测带短超时，半死连接快速失败
	if m.browser != nil {
		if _, err := m.browser.Timeout(browserProbeTimeout).Version(); err == nil {
			return m.browser, nil
		}
		// 连接已断，清理后重启
		m.resetBrowser()
	}

	path := findBrowser()
	if path == "" {
		return nil, fmt.Errorf("未找到兼容的 Chromium 浏览器，请安装 Chrome 或 Edge 后重试")
	}

	// 启动无头浏览器
	l := launcher.New().Bin(path).Headless(true).NoSandbox(true).Set("disable-gpu").Set("disable-software-rasterizer")

	url, err := l.Launch()
	if err != nil {
		return nil, fmt.Errorf("启动浏览器失败: %w", err)
	}

	browser := rod.New().ControlURL(url).MustConnect()
	m.browser = browser
	m.launcher = l
	return browser, nil
}

// resetBrowser 清理缓存的 browser 与 page。
func (m *BrowserManager) resetBrowser() {
	if m.page != nil {
		_ = m.page.Close()
		m.page = nil
	}
	if m.browser != nil {
		_ = m.browser.Close()
		m.browser = nil
		m.launcher = nil
	}
}

// RenderPDF 把已分页的 HTML 渲染为 PDF 字节流。
//
// 传入的 HTML 应包含带 page-break-after 规则的 A4 尺寸 .resume-page 容器。
// scale 必须为 1.0 才能保证分页正确——更大的值会使每个页容器溢出 A4
func (m *BrowserManager) RenderPDF(htmlContent string, pageRange string) ([]byte, error) {
	start := time.Now()
	m.mu.Lock()
	defer m.mu.Unlock()

	page, err := m.getPage()
	if err != nil {
		return nil, err
	}

	if err := page.SetDocumentContent(htmlContent); err != nil {
		return nil, fmt.Errorf("设置页面内容失败: %w", err)
	}

	// 等待页面稳定；简历为纯 HTML+CSS，用较短窗口即可，避免 MustWaitStable 固定 1 秒。
	if err := page.WaitStable(renderStableTimeout); err != nil {
		return nil, fmt.Errorf("等待页面稳定失败: %w", err)
	}

	// 获取页面尺寸
	paperSize := GetPaperSizeFromHTML(htmlContent)

	req := &proto.PagePrintToPDF{
		PaperWidth:          util.FloatPtr(paperSize.InchW),
		PaperHeight:         util.FloatPtr(paperSize.InchH),
		MarginTop:           util.FloatPtr(0),
		MarginBottom:        util.FloatPtr(0),
		MarginLeft:          util.FloatPtr(0),
		MarginRight:         util.FloatPtr(0),
		Scale:               util.FloatPtr(1.0),
		PageRanges:          pageRange,
		PrintBackground:     true,
		PreferCSSPageSize:   true,
		DisplayHeaderFooter: false,
	}

	// 生成 PDF 数据流
	reader, err := page.PDF(req)
	if err != nil {
		return nil, fmt.Errorf("生成 PDF 失败: %w", err)
	}
	pdf, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("读取 PDF 数据失败: %w", err)
	}

	log.Infof("PDF导出耗时: %v", time.Since(start))
	return pdf, nil
}

// RenderPNG 把已分页的 HTML 截取为一张连续的 PNG 图片。
//
// 前端分页器在连续模式下只输出一个高度自适应内容的 `.resume-page`，
// 因此 PNG 导出只需测量内容真实高度后整体截图，后端不再注入任何反向拆分的 CSS。
// scale 通过 deviceScaleFactor 控制输出图片的像素密度。
func (m *BrowserManager) RenderPNG(htmlContent string, scale float64) ([]byte, error) {
	start := time.Now()
	m.mu.Lock()
	defer m.mu.Unlock()

	// 获取页面
	page, err := m.getPage()
	if err != nil {
		return nil, err
	}

	// 设置页面内容（注入「撑满一页」样式：内容不足一页时 .resume-page 撑满视口，
	// 页面背景/双栏侧栏延伸到底，避免截图底部出现与内容割裂的空白块；
	// 高度测量接口不注入，保持自适应语义测得真实内容高度）
	htmlContent = InjectFullPageCSS(htmlContent)

	if err := page.SetDocumentContent(htmlContent); err != nil {
		return nil, fmt.Errorf("设置页面内容失败: %w", err)
	}

	paperSpec := GetPaperSizeFromHTML(htmlContent)

	// 先以纸张尺寸初始化视口：宽度决定文字折行位置，必须与前端分页宽度一致后才能测量出正确的内容高度。
	page.MustSetViewport(paperSpec.PxW, paperSpec.PxH, scale, false)
	if err := page.WaitStable(renderStableTimeout); err != nil {
		return nil, fmt.Errorf("等待页面稳定失败: %w", err)
	}

	// 内容实际高度, 保底为纸张高度
	cssHeight, err := m.calContentHeight(page)
	if err != nil {
		log.Errorf("测量内容高度失败: %v", err)
		return nil, fmt.Errorf("测量内容高度失败: %v", err)
	}
	cssHeight = max(cssHeight, paperSpec.PxH)

	// 视口 CSS 尺寸为纸张宽度 × 真实高度；scale 通过 deviceScaleFactor 控制输出像素密度。
	page.MustSetViewport(paperSpec.PxW, cssHeight, scale, false)
	if err := page.WaitStable(renderStableTimeout); err != nil {
		return nil, fmt.Errorf("等待页面稳定失败: %w", err)
	}

	screenshot, err := page.Screenshot(true, &proto.PageCaptureScreenshot{
		Format:                proto.PageCaptureScreenshotFormatPng,
		CaptureBeyondViewport: true,
		FromSurface:           true,
	})
	if err != nil {
		return nil, fmt.Errorf("截图失败: %w", err)
	}

	// 诊断：输出截图实际像素尺寸，便于核对 A4 规格（A4 纵向 @1x = 794×1123，
	// @scale = 794*scale × 1123*scale）。
	if cfg, _, derr := image.DecodeConfig(bytes.NewReader(screenshot)); derr == nil {
		log.Infof("PNG导出: 输出尺寸=%dx%d (cssHeight=%d, paper=%dx%d, scale=%.2f)", cfg.Width, cfg.Height, cssHeight, paperSpec.PxW, paperSpec.PxH, scale)
	}

	log.Infof("PNG导出耗时: %v", time.Since(start))

	return screenshot, nil
}

// RenderOnePagePDF 把整页内容 PNG 按比例缩放入单页纸张 PDF（一页导出）。
//
// png 为 RenderPNG 输出：宽 = 纸张宽 px × scale，高 = 内容高 px × scale
// （scale 是 deviceScaleFactor，不影响换算后的 mm 比例）。
//
// 缩放策略（保持宽高比，不放大）：
//   - 内容高度 > 纸张高度（典型场景）：高度充满页面，宽度按比例压缩，水平居中
//   - 内容高度 ≤ 纸张高度：宽度保持不变（不放大），内容顶部对齐，下方留白
//
// 页面尺寸跟随 paper（A4 / Letter / 横向由 PaperSpec 决定）。
func (m *BrowserManager) RenderSinglePDF(htmlContent string, scale float64) ([]byte, error) {
	start := time.Now()

	// 获取页面尺寸
	paperSpec := GetPaperSizeFromHTML(htmlContent)

	// // 如果内容高度小于一页A4纸高度,则走传统PDF导出流程
	// if paperSpec.PxH <= PaperA4.PxH {
	// 	return m.RenderPDF(htmlContent, "")
	// }

	png, err := m.RenderPNG(htmlContent, scale)
	cfg, _, err := image.DecodeConfig(bytes.NewReader(png))
	if err != nil {
		log.Errorf("解析 PNG 失败: %v", err)
		return nil, fmt.Errorf("解析 PNG 失败: %w", err)
	}
	if cfg.Width <= 0 || cfg.Height <= 0 {
		log.Errorf("PNG 尺寸无效: %dx%d", cfg.Width, cfg.Height)
		return nil, fmt.Errorf("PNG 尺寸无效: %dx%d", cfg.Width, cfg.Height)
	}

	// 像素 → 毫米
	pngWmm := util.PxToMm(cfg.Width)
	pngHmm := util.PxToMm(cfg.Height)

	fit := math.Min(math.Min(paperSpec.MmW/pngWmm, paperSpec.MmH/pngHmm), 1)

	drawW, drawH := pngWmm*fit, pngHmm*fit
	x, y := (paperSpec.MmW-drawW)/2, 0.0 // 水平居中, 顶部对齐

	// 生成 PDF
	pdf := fpdf.NewCustom(&fpdf.InitType{
		UnitStr: "mm",
		Size:    fpdf.SizeType{Wd: paperSpec.MmW, Ht: paperSpec.MmH},
	})
	pdf.AddPage()
	pdf.RegisterImageReader("onepage", "PNG", bytes.NewReader(png))
	pdf.ImageOptions("onepage", x, y, drawW, drawH, false, fpdf.ImageOptions{ImageType: "PNG"}, 0, "")

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		log.Errorf("生成 PDF 失败: %v", err)
		return nil, fmt.Errorf("生成 PDF 失败: %w", err)
	}

	log.Infof("单页PDF渲染耗时: %v", time.Since(start))
	return buf.Bytes(), nil
}

// MeasureContentHeight 把 HTML 渲染进复用的 page，按纸张宽度排版后测量内容高度。
//
// htmlContent 应为完整文档（可先用 EnableStandaloneHTML 包装）。宽度决定文字折行位置，
// 与前端分页宽度保持一致后才能测得正确的内容高度；返回值为 CSS 像素高度。
func (m *BrowserManager) MeasureContentHeight(htmlContent string, scale float64) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	start := time.Now()

	// 获取页面
	page, err := m.getPage()
	if err != nil {
		return 0, err
	}

	// 设置页面内容
	if err := page.SetDocumentContent(htmlContent); err != nil {
		return 0, fmt.Errorf("设置页面内容失败: %w", err)
	}

	paper := GetPaperSizeFromHTML(htmlContent)

	// 先以纸张尺寸初始化视口：宽度决定文字折行位置，必须与前端分页宽度一致
	// 后才能测量出正确的内容高度。
	page.MustSetViewport(paper.PxW, paper.PxH, scale, false)
	page.WaitStable(time.Millisecond * 100)

	// 内容实际高度, 保底为纸张高度
	cssHeight, err := m.calContentHeight(page)
	if err != nil {
		log.Errorf("测量内容高度失败: %v", err)
		return 0, fmt.Errorf("测量内容高度失败: %v", err)
	}

	log.Infof("内容高度策略耗时: %v", time.Since(start))
	return cssHeight, nil
}

// EnableStandaloneHTML 确保 HTML 是可被无头 Chromium 正确排版的完整文档。
//
// 若输入已是完整文档（含 <!DOCTYPE），则原样返回，不注入额外 CSS, 避免前后端排版出现出入。
func EnableStandaloneHTML(bodyHTML string) string {
	if strings.Contains(bodyHTML, "<!DOCTYPE") {
		return bodyHTML
	}

	paper := GetPaperSizeFromHTML(bodyHTML)
	size := paper.Name
	if m := orientationRe.FindStringSubmatch(bodyHTML); m != nil && m[1] == "landscape" {
		size = paper.Name + " landscape"
	}
	css := fmt.Sprintf(
		`@page { size: %s; margin: 0; } body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`,
		size,
	)
	return fmt.Sprintf(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>%s</style></head><body>%s</body></html>`, css, bodyHTML)
}

// InjectFullPageCSS 为 PNG 截图注入「撑满一页」样式。
//
// 内容不足一页时，.resume-page 撑满一页纸高，且其内的 .resume-container
// （单栏 block / 双栏 grid）一并撑满——双栏模板的侧栏（.r-header）作为 grid
// 子项默认 stretch，随行高延伸到底，避免截图底部出现与内容割裂的白色块；
// 内容超一页时 min-height 仅作下限，长图不受影响。
func InjectFullPageCSS(html string) string {
	if !strings.Contains(html, "</head>") {
		return html
	}
	paper := GetPaperSizeFromHTML(html)
	padTop, padBottom := parsePagePadFromHTML(html)
	pageMinH := paper.PxH - padTop - padBottom
	if pageMinH < 0 {
		pageMinH = 0
	}
	css := fmt.Sprintf(
		`<style>.resume-pages-wrapper{min-height:%dpx;box-sizing:border-box}`+
			`.resume-page{min-height:%dpx!important}`+
			`.resume-container{min-height:%dpx!important}</style>`,
		paper.PxH, pageMinH, pageMinH,
	)
	return strings.Replace(html, "</head>", css+"</head>", 1)
}

// parsePagePadFromHTML 读取前端连续分页标注在 .resume-pages-wrapper 上的
// data-pad-top / data-pad-bottom（上下页边距 px，用于撑满一页的 min-height
// 计算）。缺失或非法时回退 0。
func parsePagePadFromHTML(html string) (padTop, padBottom int) {
	padTop = parseNumAttr(html, "data-pad-top")
	padBottom = parseNumAttr(html, "data-pad-bottom")
	return
}

// parseNumAttr 读取 HTML 中 `attr="(数字)"` 的数值（支持小数，如 45.3543，
// 四舍五入为整数 px），缺失时返回 0。
func parseNumAttr(html, attr string) int {
	re := regexp.MustCompile(attr + `="([0-9]+(?:\.[0-9]+)?)"`)
	if m := re.FindStringSubmatch(html); m != nil {
		if v, err := strconv.ParseFloat(m[1], 64); err == nil {
			return int(math.Round(v))
		}
	}
	return 0
}

// getPage 返回可复用的 page。
// 浏览器首次使用时惰性启动，之后在多次导出之间复用同一个 page，避免反复创建/销毁页面。
// 若缓存的 page 或 browser 已失效，会自动重建并重试一次。
func (m *BrowserManager) getPage() (*rod.Page, error) {
	// 复用已有 page：用带短超时的轻量 Eval 探测连接是否仍存活，半死连接会在超时内快速失败，而不是长时间挂起。
	if m.page != nil {
		if _, err := m.page.Timeout(pageProbeTimeout).Eval(`1`); err == nil {
			return m.page, nil
		}
		// page 已失效，清理后重建
		m.resetBrowser()
	}

	if _, err := m.getBrower(); err != nil {
		return nil, err
	}

	page, err := m.browser.Page(proto.TargetCreateTarget{})
	if err == nil {
		m.page = page
		return page, nil
	}

	// Page 失败通常意味着连接已断——强制重置后重启 browser，重试一次。
	m.resetBrowser()
	if _, err := m.getBrower(); err != nil {
		return nil, err
	}
	page, err = m.browser.Page(proto.TargetCreateTarget{})
	if err != nil {
		return nil, fmt.Errorf("创建页面失败: %w", err)
	}
	m.page = page
	return page, nil
}

// calContentHeight 计算传入 page 的内容高度。
//
// 注意：必须使用调用方当前持有的 page，绝不在此处再次调用 getPage()。
func (m *BrowserManager) calContentHeight(page *rod.Page) (int, error) {
	if page == nil {
		return 0, fmt.Errorf("page 为 nil")
	}
	result, err := page.Eval(`() => {
		const wrapper = document.querySelector('.resume-pages-wrapper')
		const h = wrapper ? wrapper.getBoundingClientRect().height : document.body.scrollHeight
		return Math.ceil(h)
	}`)
	if err != nil {
		return 0, err
	}
	return int(result.Value.Num()), nil
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
