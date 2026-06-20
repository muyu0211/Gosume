package export

import (
	"fmt"

	"gosume/pkg/log"
	"gosume/pkg/model"
)

// PNGExporter exports resumes to PNG format using headless Chromium screenshot.
type PNGExporter struct {
	htmlRenderer HTMLRenderer
	browser      Browser
}

// NewPNGExporter creates a new PNG exporter.
func NewPNGExporter(htmlRenderer HTMLRenderer, browser Browser) *PNGExporter {
	return &PNGExporter{htmlRenderer: htmlRenderer, browser: browser}
}

// Export renders the resume to HTML, then captures it as a PNG screenshot.
func (e *PNGExporter) Export(resume *model.Resume, opts ExportOptions) ([]byte, error) {
	log.Info("PNG导出: 开始渲染HTML")
	html, err := e.htmlRenderer.Render(resume)
	if err != nil {
		log.Error("PNG导出: HTML渲染失败: %v", err)
		return nil, fmt.Errorf("png export render: %w", err)
	}
	log.Info("PNG导出: HTML渲染完成, size=%d", len(html))

	fullHTML := wrapStandaloneHTML(html)

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
