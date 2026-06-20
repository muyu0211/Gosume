package export

import (
	"fmt"

	"gosume/pkg/log"
	"gosume/pkg/model"
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

// HTMLRenderer is the interface for the HTML renderer.
type HTMLRenderer interface {
	Render(resume *model.Resume) (string, error)
}

// ExportManager coordinates exporting resumes to various formats.
type ExportManager struct {
	pdfExporter *PDFExporter
	pngExporter *PNGExporter
	browser     Browser
}

// NewExportManager creates a new export manager.
func NewExportManager(browser Browser, html HTMLRenderer) *ExportManager {
	return &ExportManager{
		pdfExporter: NewPDFExporter(html, browser),
		pngExporter: NewPNGExporter(html, browser),
		browser:     browser,
	}
}

// Export renders and exports the resume to the specified format.
func (m *ExportManager) Export(resume *model.Resume, opts ExportOptions) ([]byte, error) {
	var result []byte
	var err error

	switch opts.Format {
	case FormatPDF:
		result, err = m.pdfExporter.Export(resume, opts)
	case FormatPNG:
		result, err = m.pngExporter.Export(resume, opts)
	default:
		log.Error("不支持的导出格式: %s", opts.Format)
		return nil, fmt.Errorf("unsupported format: %s", opts.Format)
	}

	if err != nil {
		log.Error("导出失败: format=%s err=%v", opts.Format, err)
		return nil, err
	}

	return result, nil
}
