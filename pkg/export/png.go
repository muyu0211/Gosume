package export

import (
	"fmt"

	"gosume/pkg/model"
)

// PNGExporter exports resumes to PNG format.
// For MVP, this returns the HTML content — actual PNG rendering
// will use go-rod screenshot in a future phase.
type PNGExporter struct {
	htmlRenderer HTMLRenderer
}

// NewPNGExporter creates a new PNG exporter.
func NewPNGExporter(htmlRenderer HTMLRenderer) *PNGExporter {
	return &PNGExporter{htmlRenderer: htmlRenderer}
}

// Export renders the resume to an HTML document suitable for PNG screenshot.
func (e *PNGExporter) Export(resume *model.Resume, opts ExportOptions) ([]byte, error) {
	html, err := e.htmlRenderer.Render(resume)
	if err != nil {
		return nil, fmt.Errorf("png export render: %w", err)
	}
	return []byte(html), nil
}
