package export

import (
	"fmt"

	"gosume/pkg/model"
)

// PNGExporter exports resumes to PNG format using headless Chromium screenshot.
type PNGExporter struct {
	htmlRenderer HTMLRenderer
	browser      Browser
}

// NewPNGExporter creates a new PNG exporter.
func NewPNGExporter(htmlRenderer HTMLRenderer, browser Browser) *PNGExporter {
	return &PNGExporter{htmlRenderer: htmlRenderer, browser: browser}
}

// Export renders the resume to HTML, then captures it as a PNG screenshot.
func (e *PNGExporter) Export(resume *model.Resume, opts ExportOptions) ([]byte, error) {
	html, err := e.htmlRenderer.Render(resume)
	if err != nil {
		return nil, fmt.Errorf("png export render: %w", err)
	}

	fullHTML := wrapStandaloneHTML(html)

	scale := opts.Scale
	if scale <= 0 {
		scale = 1.0
	}

	png, err := e.browser.RenderPNG(fullHTML, scale)
	if err != nil {
		return nil, fmt.Errorf("render png: %w", err)
	}

	return png, nil
}
