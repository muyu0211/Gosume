package export

import (
	"fmt"

	"gosume/pkg/model"
)

// ExportFormat represents the output format.
type ExportFormat string

const (
	FormatPDF  ExportFormat = "pdf"
	FormatDOCX ExportFormat = "docx"
	FormatPNG  ExportFormat = "png"
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
	pdfExporter  *PDFExporter
	docxExporter *DOCXExporter
	pngExporter  *PNGExporter
	browser      Browser
}

// NewExportManager creates a new export manager.
func NewExportManager(browser Browser, html HTMLRenderer) *ExportManager {
	return &ExportManager{
		pdfExporter:  NewPDFExporter(html, browser),
		docxExporter: NewDOCXExporter(html),
		pngExporter:  NewPNGExporter(html, browser),
		browser:      browser,
	}
}

// Export renders and exports the resume to the specified format.
func (m *ExportManager) Export(resume *model.Resume, opts ExportOptions) ([]byte, error) {
	switch opts.Format {
	case FormatPDF:
		return m.pdfExporter.Export(resume, opts)
	case FormatDOCX:
		return m.docxExporter.Export(resume, opts)
	case FormatPNG:
		return m.pngExporter.Export(resume, opts)
	default:
		return nil, fmt.Errorf("unsupported format: %s", opts.Format)
	}
}
