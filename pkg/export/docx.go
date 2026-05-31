package export

import (
	"fmt"

	"gosume/pkg/model"
)

// DOCXExporter exports resumes to DOCX format.
// For MVP, this is a stub — DOCX export requires either docxr template
// filling or pandoc conversion, which will be implemented in a future phase.
type DOCXExporter struct {
	htmlRenderer HTMLRenderer
}

// NewDOCXExporter creates a new DOCX exporter.
func NewDOCXExporter(htmlRenderer HTMLRenderer) *DOCXExporter {
	return &DOCXExporter{htmlRenderer: htmlRenderer}
}

// Export returns a placeholder error for unsupported DOCX export.
func (e *DOCXExporter) Export(resume *model.Resume, opts ExportOptions) ([]byte, error) {
	return nil, fmt.Errorf("DOCX 导出功能将在后续版本中提供，请使用 PDF 格式导出")
}
