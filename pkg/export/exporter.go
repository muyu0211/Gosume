package export

import (
	"fmt"

	"gosume/pkg/log"
)

// ExportFormat represents the output format.
type ExportFormat string

const (
	FormatPDF ExportFormat = "pdf"
	FormatPNG ExportFormat = "png"
)

// ExportOptions configures the export output.
type ExportOptions struct {
	Format    ExportFormat `json:"format"`
	Scale     float64      `json:"scale"`
	PageRange string       `json:"page_range"`
}

// Browser is the interface for headless Chromium rendering.
type Browser interface {
	RenderPDF(htmlContent string, scale float64, pageRange string) ([]byte, error)
	RenderPNG(htmlContent string, scale float64) ([]byte, error)
}

// ExportManager converts pre-paginated HTML to PDF or PNG via headless Chromium.
// Template rendering and pagination happen on the frontend — the backend only
// handles the final format conversion.
type ExportManager struct {
	pdfExporter *PDFExporter
	pngExporter *PNGExporter
}

// NewExportManager creates a new export manager.
func NewExportManager(browser Browser) *ExportManager {
	return &ExportManager{
		pdfExporter: NewPDFExporter(browser),
		pngExporter: NewPNGExporter(browser),
	}
}

// ExportHTML converts pre-rendered, pre-paginated HTML to the target format.
// The frontend is responsible for template rendering and splitting content into
// A4-sized .resume-page divs before calling this method.
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
