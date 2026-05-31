package export

import (
	"fmt"

	"gosume/pkg/model"
)

// PDFExporter exports resumes to PDF format.
type PDFExporter struct {
	htmlRenderer HTMLRenderer
}

// NewPDFExporter creates a new PDF exporter.
func NewPDFExporter(htmlRenderer HTMLRenderer) *PDFExporter {
	return &PDFExporter{htmlRenderer: htmlRenderer}
}

// Export renders the resume to HTML and wraps it for PDF output.
// For MVP, we return the HTML with print CSS — the actual PDF conversion
// happens via go-rod browser print or system print dialog.
func (e *PDFExporter) Export(resume *model.Resume, opts ExportOptions) ([]byte, error) {
	html, err := e.htmlRenderer.Render(resume)
	if err != nil {
		return nil, fmt.Errorf("pdf export render: %w", err)
	}

	// Wrap in a full HTML document with print styles
	pdfHTML := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
@media print {
  @page {
    size: A4;
    margin: 0;
  }
  body {
    margin: 0;
    padding: 0;
  }
}
</style>
</head>
<body>
%s
</body>
</html>`, html)

	return []byte(pdfHTML), nil
}
