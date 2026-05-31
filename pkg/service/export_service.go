package service

import (
	"fmt"
	"os"

	"gosume/pkg/export"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// ExportService handles exporting resumes to various formats.
type ExportService struct {
	wailsApp      *application.App
	exportManager *export.ExportManager
	resumeService *ResumeService
}

// ServiceName returns the service name.
func (s *ExportService) ServiceName() string {
	return "ExportService"
}

// Inject sets up dependencies.
func (s *ExportService) Inject(app *application.App, manager *export.ExportManager, resumeSvc *ResumeService) {
	s.wailsApp = app
	s.exportManager = manager
	s.resumeService = resumeSvc
}

// Export executes the full export pipeline: render + save dialog + write to disk.
func (s *ExportService) Export(opts export.ExportOptions) error {
	resume := s.resumeService.GetResume()
	if resume == nil {
		return fmt.Errorf("no resume to export")
	}

	s.wailsApp.Event.Emit("export:progress", 10)

	data, err := s.exportManager.Export(resume, opts)
	if err != nil {
		return fmt.Errorf("export: %w", err)
	}

	s.wailsApp.Event.Emit("export:progress", 70)

	defaultName := fmt.Sprintf("%s_简历.%s", resume.Personal.FullName, formatSuffix(opts.Format))

	filePath, err := s.wailsApp.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:    "导出简历",
		Filename: defaultName,
		Filters: []application.FileFilter{
			{DisplayName: getFilterName(opts.Format), Pattern: getFilterPattern(opts.Format)},
		},
	}).PromptForSingleSelection()
	if err != nil || filePath == "" {
		return err
	}

	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("write file: %w", err)
	}

	resume.Meta.ExportCount++
	s.wailsApp.Event.Emit("export:progress", 100)
	s.wailsApp.Event.Emit("export:completed", filePath)

	return nil
}

func getFilterName(f export.ExportFormat) string {
	switch f {
	case export.FormatPDF:
		return "PDF 文件 (*.pdf)"
	case export.FormatDOCX:
		return "Word 文档 (*.docx)"
	case export.FormatPNG:
		return "PNG 图片 (*.png)"
	default:
		return "所有文件 (*.*)"
	}
}

func getFilterPattern(f export.ExportFormat) string {
	switch f {
	case export.FormatPDF:
		return "*.pdf"
	case export.FormatDOCX:
		return "*.docx"
	case export.FormatPNG:
		return "*.png"
	default:
		return "*.*"
	}
}

func formatSuffix(f export.ExportFormat) string {
	switch f {
	case export.FormatPDF:
		return "pdf"
	case export.FormatDOCX:
		return "docx"
	case export.FormatPNG:
		return "png"
	default:
		return ""
	}
}
