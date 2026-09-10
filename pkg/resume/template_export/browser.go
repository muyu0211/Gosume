package template_export

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"gosume/pkg/log"
	"gosume/pkg/util"
	"image"
	"io"
	"math"
	"os"
	"path/filepath"
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
	// browserLaunchTimeout 限制单次「启动并连接浏览器」的耗时。
	// 浏览器起来后若始终不输出 DevTools 地址，rod 会一直等；而调用方持有
	// BrowserManager 的锁，会把后续所有导出请求一起拖死，故必须设上限。
	browserLaunchTimeout = 20 * time.Second
)

// browserDebugPort 是无头 Chromium 使用的固定 CDP 调试端口。
//
// 禁用 leakless 后浏览器不再随主进程强杀，进程被强制结束时可能残留。固定端口让
// rod 优先复用该端口上已存在的实例（见 openBrowser），把残留数收敛到 1 个，
// 而不是每次启动都新增一个。代价是本机其它进程可预测地连上它。可接受：
// Chromium 的 --remote-debugging-port 只监听 127.0.0.1，该实例仅渲染本地简历
// HTML、不持有任何登录态或凭据。
const browserDebugPort = 32717

// leaklessEnv 是开启 rod leakless 守护进程的环境变量开关（值为 "1" 时开启）。
const leaklessEnv = "GOSUME_ENABLE_LEAKLESS"

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

	// 全新启动前，先回收上次会话残留的无头浏览器。
	//
	// 禁用 leakless 后，主进程被强杀时浏览器不会随主进程退，残留进程会锁住固定的
	// profile 目录与调试端口。若不清理直接启动：rod 连上这种半死残留实例会报
	// "connection ... unexpected EOF"，或新 Edge 因 profile 被锁启动即退出
	// （"Failed to get the debug url"）。先杀掉才是实现「固定端口收敛残留」的前提。
	m.reapLeftovers()

	path := findBrowser()
	if path == "" {
		return nil, &BrowserLaunchError{
			Message: "未找到兼容的 Chromium 浏览器，请安装 Chrome 或 Edge 后重试",
			Err:     errors.New("no chromium browser found"),
		}
	}

	l, browser, err := openBrowser(path)
	if err != nil {
		return nil, &BrowserLaunchError{Message: launchHint(err), Err: err}
	}
	m.browser = browser
	m.launcher = l
	return browser, nil
}

// newLauncher 构造无头浏览器启动器。
//
// port 为 0 时使用随机调试端口；非 0 时固定端口（见 browserDebugPort）。
func newLauncher(bin string, port int) *launcher.Launcher {
	l := launcher.New().Bin(bin).Headless(true).NoSandbox(true).
		Set("disable-gpu").Set("disable-software-rasterizer").
		UserDataDir(chromiumProfileDir())
	if port > 0 {
		l = l.RemoteDebuggingPort(port)
	}
	if !leaklessEnabled() {
		l = l.Leakless(false)
	}
	return l
}

// leaklessEnabled 判断是否启用 rod 的 leakless 守护进程。
//
// leakless 会把内置守护 exe 释放到 %TEMP% 后执行，用于父进程被强杀时回收浏览器。
// 该行为与黑客工具高度相似，Windows Defender、火绒、360 等常把它判为 HackTool 或
// PUA 并直接拦截执行，错误形如 "fork/exec ...\leakless.exe: ... contains a virus
// or potentially unwanted software"，一旦被拦导出功能就完全不可用。
//
// 它不是渲染必需能力：退出时由 BrowserManager.Close 回收浏览器，并配合固定调试
// 端口复用残留实例。因此默认关闭，仅调试时用 GOSUME_ENABLE_LEAKLESS=1 打开。
func leaklessEnabled() bool {
	return os.Getenv(leaklessEnv) == "1"
}

// chromiumProfileDir 返回无头 Chromium 的固定 profile 目录；不可用时返回空串，
// 交给 rod 回落到默认位置。
//
// 不使用 rod 默认的 %TEMP%/rod/user-data/<随机>：一是 %TEMP% 常被企业策略
// （AppLocker / SRP）禁止写入或执行，与 leakless 同属一个雷区；二是每次启动都新建
// 随机目录会持续堆积。改用系统缓存目录下的固定路径，稳定且可复用。
func chromiumProfileDir() string {
	base, err := os.UserCacheDir()
	if err != nil || base == "" {
		return ""
	}
	dir := filepath.Join(base, "Gosume", "chromium-profile")
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Warnf("[browser] 创建浏览器 profile 目录失败，回退默认位置: %v", err)
		return ""
	}
	return dir
}

// openBrowser 按降级链启动并连接无头浏览器：
//
//  1. 固定调试端口。rod 在禁用 leakless 时会先尝试连接该端口上已存在的浏览器，
//     于是上次强杀留下的残留进程会被复用而不是不断累积。
//  2. 固定端口被其它程序占用时（连不上或拿到非 CDP 响应）回退随机端口，
//     保证导出功能始终可用。
//
// 任一级失败都继续尝试下一级，不再按错误信息判断原因：杀软可能先把 leakless.exe
// 隔离再报 "The system cannot find the file specified"，或直接 "Access is denied"，
// 这类文案不含任何可识别关键字，字符串匹配会漏判并把错误原样抛给用户。
func openBrowser(bin string) (*launcher.Launcher, *rod.Browser, error) {
	l, browser, err := tryLaunch(newLauncher(bin, browserDebugPort))
	if err == nil {
		return l, browser, nil
	}
	log.Warnf("[browser] 固定调试端口 %d 不可用，回退随机端口: %v", browserDebugPort, err)

	l, browser, randErr := tryLaunch(newLauncher(bin, 0))
	if randErr == nil {
		return l, browser, nil
	}
	// 两个候选都失败：合并上报，便于一次看到两种原因。
	return nil, nil, errors.Join(err, randErr)
}

// tryLaunch 启动并连接浏览器；任一步失败都回收已产生的进程，避免残留。
func tryLaunch(l *launcher.Launcher) (*launcher.Launcher, *rod.Browser, error) {
	ctx, cancel := context.WithTimeout(context.Background(), browserLaunchTimeout)
	defer cancel()

	url, err := l.Context(ctx).Launch()
	if err != nil {
		killLauncher(l)
		return nil, nil, err
	}

	browser := rod.New().ControlURL(url)
	if err := browser.Connect(); err != nil {
		killLauncher(l)
		return nil, nil, fmt.Errorf("连接浏览器失败: %w", err)
	}
	return l, browser, nil
}

// killLauncher 仅在确有进程时强杀。launcher.Kill 内含 1s 固定等待，
// 而启动阶段失败（或复用已有实例）时 PID 为 0，跳过可避免无谓延迟。
func killLauncher(l *launcher.Launcher) {
	if l.PID() != 0 {
		l.Kill()
	}
}

// BrowserLaunchError 表示无头浏览器启动或连接失败。
//
// Message 是面向用户的可操作提示（中文、不含技术细节），Err 为底层错误；
// 上层（ExportService）用 errors.As 取出 Message 直接透传给前端。
// Message 为空表示无法归类，此时 Error() 退化为普通的技术性报错。
type BrowserLaunchError struct {
	Message string
	Err     error
}

// Error 实现 error 接口。
func (e *BrowserLaunchError) Error() string {
	if e.Message == "" {
		return "启动浏览器失败: " + e.Err.Error()
	}
	return e.Message + "（" + e.Err.Error() + "）"
}

// Unwrap 暴露底层错误，便于 errors.Is / errors.As 继续下探。
func (e *BrowserLaunchError) Unwrap() error { return e.Err }

// launchHint 把浏览器启动/连接的底层错误翻译为面向用户的可操作提示，
// 无法归类时返回空串。
//
// 最常见的失败原因是 Windows 安全软件把无头浏览器（或其守护进程）判为病毒/PUA
// 后拦截执行，而原始错误只有 "fork/exec ..." 这类技术细节，用户无从下手。
func launchHint(err error) string {
	if err == nil {
		return ""
	}
	msg := strings.ToLower(err.Error())
	switch {
	case strings.Contains(msg, "virus"),
		strings.Contains(msg, "unwanted software"),
		strings.Contains(msg, "leakless"),
		strings.Contains(msg, "operation did not complete successfully"),
		strings.Contains(msg, "access is denied"),
		strings.Contains(msg, "permission denied"):
		return "被安全软件拦截，请把 Gosume 加入杀毒软件白名单（或关闭「可能不需要的应用」防护）后重试"
	case strings.Contains(msg, "deadline exceeded"),
		strings.Contains(msg, "i/o timeout"),
		strings.Contains(msg, "timed out"):
		return "被安全软件拦截或系统资源不足，请检查后重试"
	default:
		return ""
	}
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
	}
	// 无论 CDP 关闭是否报错都杀进程树。
	//
	// browser.Close 只下发优雅关闭命令，返回 nil 也不代表所有子进程都已退出；且降级
	// 模式（无 leakless）下进程回收完全依赖这里。不主动清理，残留浏览器就会锁住固定
	// profile 目录 / 调试端口，导致下次导出出现 "unexpected EOF" 或 "Failed to get
	// the debug url"。此方法仅在被复用缓存失效/应用退出时调用，Kill 的 1s 等待可忽略。
	if m.launcher != nil {
		killLauncher(m.launcher)
		m.launcher = nil
	}
}

// reapLeftovers 回收本站残留的无头浏览器进程，避免其锁死固定 profile 目录与调试端口。
func (m *BrowserManager) reapLeftovers() {
	markers := []string{"remote-debugging-port=" + strconv.Itoa(browserDebugPort)}
	if d := chromiumProfileDir(); d != "" {
		markers = append(markers, d)
	}
	reapLeftoverBrowsers(markers)
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
	if err != nil {
		// 直接透传：渲染阶段（含浏览器启动失败）的错误需要原样上抛，
		// 否则会被下面的 DecodeConfig 覆盖成误导性的「解析 PNG 失败」。
		return nil, err
	}
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
	if err := page.WaitStable(renderStableTimeout); err != nil {
		return 0, fmt.Errorf("等待页面稳定失败: %w", err)
	}

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
