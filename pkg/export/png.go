package export

import (
	"fmt"

	"gosume/pkg/log"
)

// PNGExporter converts pre-paginated HTML to PNG via headless Chromium screenshot.
type PNGExporter struct {
	browser Browser
}

// NewPNGExporter creates a new PNG exporter.
func NewPNGExporter(browser Browser) *PNGExporter {
	return &PNGExporter{browser: browser}
}

// ExportHTML wraps the HTML in a standalone document and captures it as a PNG.
// The HTML should already be paginated into .resume-page divs by the frontend.
func (e *PNGExporter) ExportHTML(htmlContent string, opts ExportOptions) ([]byte, error) {
	fullHTML := wrapStandaloneHTML(htmlContent)

	scale := opts.Scale
	if scale <= 0 {
		scale = 1.0
	}

	log.Info("PNG导出: 开始浏览器截图, scale=%.2f", scale)
	png, err := e.browser.RenderPNG(fullHTML, scale)
	if err != nil {
		log.Error("PNG导出: 浏览器截图失败: %v", err)
		return nil, fmt.Errorf("render png: %w", err)
	}

	log.Info("PNG导出: 浏览器截图完成, size=%d", len(png))
	return png, nil
}
