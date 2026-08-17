package template_export

import (
	"fmt"

	"gosume/pkg/log"
)

// ExportFormat 表示导出的输出格式。
type ExportFormat string

// 支持的导出格式。
const (
	FormatPDF ExportFormat = "pdf"
	FormatPNG ExportFormat = "png"
)

// ExportOptions 配置导出行为。
//
// Scale 为缩放比例（PDF 应为 1.0）；PageRange 为页码范围，为空表示全部页面。
type ExportOptions struct {
	Format    ExportFormat `json:"format"`
	Scale     float64      `json:"scale"`
	PageRange string       `json:"page_range"`
}

// Browser 是无头 Chromium 渲染能力的抽象接口，便于测试时替换实现。
type Browser interface {
	RenderPDF(htmlContent string, scale float64, pageRange string) ([]byte, error)
	RenderPNG(htmlContent string, scale float64) ([]byte, error)
}

// ExportManager 通过无头 Chromium 把已分页的 HTML 转换为 PDF 或 PNG。
// 模板渲染与分页由前端完成，后端只负责最终的格式转换。
type ExportManager struct {
	pdfExporter *PDFExporter
	pngExporter *PNGExporter
}

// NewExportManager 创建导出管理器，并初始化各格式的导出器。
func NewExportManager(browser Browser) *ExportManager {
	return &ExportManager{
		pdfExporter: NewPDFExporter(browser),
		pngExporter: NewPNGExporter(browser),
	}
}

// ExportHTML 把已渲染并已分页的 HTML 转换为目标格式。
//
// 调用方（前端）需先完成模板渲染，并把内容切分为 A4 尺寸的
// .resume-page 容器；格式不支持时返回错误。
func (m *ExportManager) ExportHTML(htmlContent string, opts ExportOptions) ([]byte, error) {
	switch opts.Format {
	case FormatPDF:
		return m.pdfExporter.ExportHTML(htmlContent, opts)
	case FormatPNG:
		return m.pngExporter.ExportHTML(htmlContent, opts)
	default:
		log.Error("不支持的导出格式: %s", opts.Format)
		return nil, fmt.Errorf("unsupported format: %s", opts.Format)
	}
}
