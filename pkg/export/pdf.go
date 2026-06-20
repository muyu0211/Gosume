package export

import (
	"fmt"

	"gosume/pkg/log"
)

// PDFExporter converts pre-paginated HTML to PDF via headless Chromium.
type PDFExporter struct {
	browser Browser
}

// NewPDFExporter creates a new PDF exporter.
func NewPDFExporter(browser Browser) *PDFExporter {
	return &PDFExporter{browser: browser}
}

// ExportHTML wraps the HTML in a standalone document and renders it to PDF.
// The HTML should already be paginated into .resume-page divs by the frontend.
func (e *PDFExporter) ExportHTML(htmlContent string, opts ExportOptions) ([]byte, error) {
	fullHTML := wrapStandaloneHTML(htmlContent)

	scale := opts.Scale
	if scale <= 0 {
		scale = 1.0
	}

	log.Info("PDF导出: 开始浏览器渲染, scale=%.2f page_range=%q", scale, opts.PageRange)
	pdf, err := e.browser.RenderPDF(fullHTML, scale, opts.PageRange)
	if err != nil {
		log.Error("PDF导出: 浏览器渲染失败: %v", err)
		return nil, fmt.Errorf("render pdf: %w", err)
	}

	log.Info("PDF导出: 浏览器渲染完成, size=%d", len(pdf))
	return pdf, nil
}
