package template_export

import (
	"fmt"

	"gosume/pkg/log"
)

// PDFExporter 通过无头 Chromium 把已分页的 HTML 转换为 PDF。
type PDFExporter struct {
	browser Browser
}

// NewPDFExporter 创建 PDF 导出器。
func NewPDFExporter(browser Browser) *PDFExporter {
	return &PDFExporter{browser: browser}
}

// ExportHTML 把 HTML 包装为完整文档后渲染为 PDF。
//
// 传入的 HTML 应已由前端切分为 .resume-page 容器；
// opts.Scale 非正数时回退为 1.0。
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
