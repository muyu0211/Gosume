package export

import (
	"fmt"

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
	html, err := e.htmlRenderer.Render(resume)
	if err != nil {
		return nil, fmt.Errorf("pdf export render: %w", err)
	}

	fullHTML := wrapStandaloneHTML(html)

	scale := opts.Scale
	if scale <= 0 {
		scale = 1.0
	}

	pdf, err := e.browser.RenderPDF(fullHTML, scale, opts.PageRange)
	if err != nil {
		return nil, fmt.Errorf("render pdf: %w", err)
	}

	return pdf, nil
}
