package export

import (
	"fmt"

	"gosume/pkg/log"
	"gosume/pkg/model"
)

// PDFExporter exports resumes to PDF format using headless Chromium.
type PDFExporter struct {
	htmlRenderer HTMLRenderer
	browser      Browser
}

// NewPDFExporter creates a new PDF exporter.
func NewPDFExporter(htmlRenderer HTMLRenderer, browser Browser) *PDFExporter {
	return &PDFExporter{htmlRenderer: htmlRenderer, browser: browser}
}

// Export renders the resume to HTML, then converts it to PDF via headless Chromium.
func (e *PDFExporter) Export(resume *model.Resume, opts ExportOptions) ([]byte, error) {
	log.Info("PDF导出: 开始渲染HTML")
	html, err := e.htmlRenderer.Render(resume)
	if err != nil {
		log.Error("PDF导出: HTML渲染失败: %v", err)
		return nil, fmt.Errorf("pdf export render: %w", err)
	}
	log.Info("PDF导出: HTML渲染完成, size=%d", len(html))

	fullHTML := wrapStandaloneHTML(html)

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
