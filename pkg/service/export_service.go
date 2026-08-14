package service

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gosume/pkg/export"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// ExportService handles exporting resumes to PDF and PNG formats.
//
// Architecture: the frontend handles template rendering and pagination
// (splitting content into A4 .resume-page divs). The backend only converts
// the pre-paginated HTML to the target format via headless Chromium.
type ExportService struct {
	wailsApp      *application.App
	exportManager *export.ExportManager
}

// ServiceName returns the service name.
func (s *ExportService) ServiceName() string {
	return "ExportService"
}

// Inject sets up dependencies.
func (s *ExportService) Inject(app *application.App, manager *export.ExportManager) {
	s.wailsApp = app
	s.exportManager = manager
}

// ── Public API ────────────────────────────────────────────────────────────────

// ExportHTML exports pre-paginated HTML to the target format.
// The frontend calls this for individual resume export.
// resumeName is used as the default save filename; if empty it falls back to "简历".
// format must be "pdf" or "png". For PDF, scale should be 1.0 to avoid
// content overflow that produces blank pages.
func (s *ExportService) ExportHTML(htmlContent string, format string, scale float64, resumeName string) (string, error) {
	opts, err := parseFormat(format, scale)
	if err != nil {
		return "", err
	}

	s.wailsApp.Event.Emit("export:progress", 10)
	data, err := s.renderOne(htmlContent, opts)
	if err != nil {
		return "", err
	}
	s.wailsApp.Event.Emit("export:progress", 70)

	baseName := strings.TrimSpace(resumeName)
	if baseName == "" {
		baseName = "简历"
	} else {
		baseName = sanitizeFilename(baseName)
	}
	defaultName := fmt.Sprintf("%s.%s", baseName, formatSuffix(opts.Format))
	filePath, err := s.showSaveDialog(defaultName, opts, "导出简历")
	if err != nil || filePath == "" {
		return filePath, err
	}

	if err := s.writeFile(filePath, data); err != nil {
		return "", err
	}

	s.wailsApp.Event.Emit("export:progress", 100)
	s.wailsApp.Event.Emit("export:completed", filePath)
	return filePath, nil
}

// exportItem is a single pre-paginated HTML item for batch export.
type exportItem struct {
	Name string `json:"name"`
	HTML string `json:"html"`
}

// ExportBatchHTML exports multiple pre-paginated HTML documents.
// The first file prompts a save dialog; all subsequent files are saved to the
// same directory automatically.
func (s *ExportService) ExportBatchHTML(itemsJSON string, format string, scale float64) ([]string, error) {
	var items []exportItem
	if err := json.Unmarshal([]byte(itemsJSON), &items); err != nil {
		return nil, UserMsg("解析导出数据失败")
	}
	return s.exportBatch(items, format, scale)
}

// ── Shared helpers ────────────────────────────────────────────────────────────

func parseFormat(format string, scale float64) (export.ExportOptions, error) {
	switch format {
	case "pdf":
		return export.ExportOptions{Format: export.FormatPDF, Scale: scale}, nil
	case "png":
		return export.ExportOptions{Format: export.FormatPNG, Scale: scale}, nil
	default:
		return export.ExportOptions{}, UserMsg("不支持的导出格式: " + format)
	}
}

// renderOne converts pre-paginated HTML to the target format bytes.
func (s *ExportService) renderOne(html string, opts export.ExportOptions) ([]byte, error) {
	data, err := s.exportManager.ExportHTML(html, opts)
	if err != nil {
		return nil, UserWrap(err, "导出失败")
	}
	return data, nil
}

// showSaveDialog prompts the user for a save location.
func (s *ExportService) showSaveDialog(defaultName string, opts export.ExportOptions, title string) (string, error) {
	filePath, err := s.wailsApp.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:    title,
		Filename: defaultName,
		Filters: []application.FileFilter{
			{DisplayName: getFilterName(opts.Format), Pattern: getFilterPattern(opts.Format)},
		},
	}).PromptForSingleSelection()
	if err != nil {
		if IsCancel(err) {
			return "", nil
		}
		return "", UserWrap(err, "打开保存对话框失败")
	}
	return filePath, nil
}

func (s *ExportService) writeFile(path string, data []byte) error {
	if err := os.WriteFile(path, data, 0644); err != nil {
		return UserWrap(err, "写入文件失败")
	}
	return nil
}

// exportBatch runs the shared batch export loop.
// The first item triggers a save dialog to pick the output directory;
// subsequent items are saved to the same directory automatically.
func (s *ExportService) exportBatch(items []exportItem, format string, scale float64) ([]string, error) {
	opts, err := parseFormat(format, scale)
	if err != nil {
		return nil, err
	}

	var saved []string
	var exportDir string
	usedNames := make(map[string]int)
	total := len(items)

	for i, item := range items {
		data, err := s.renderOne(item.HTML, opts)
		if err != nil {
			continue
		}

		s.wailsApp.Event.Emit("export:progress", int(float64(i+1)/float64(total)*100))

		safeName := dedupName(sanitizeFilename(item.Name), usedNames)
		defaultName := fmt.Sprintf("%s.%s", safeName, formatSuffix(opts.Format))

		if exportDir == "" {
			filePath, err := s.showSaveDialog(defaultName, opts, "批量导出 — 选择保存位置")
			if err != nil {
				return saved, nil
			}
			if filePath == "" {
				return saved, nil
			}
			exportDir = filepath.Dir(filePath)
			if err := s.writeFile(filePath, data); err != nil {
				continue
			}
			saved = append(saved, filePath)
		} else {
			filePath := filepath.Join(exportDir, defaultName)
			if err := s.writeFile(filePath, data); err != nil {
				continue
			}
			saved = append(saved, filePath)
		}
	}

	return saved, nil
}

// ── Filename helpers ──────────────────────────────────────────────────────────

func sanitizeFilename(name string) string {
	replacer := strings.NewReplacer(
		"/", "_", "\\", "_", ":", "_", "*", "_",
		"?", "_", "\"", "_", "<", "_", ">", "_", "|", "_",
	)
	return replacer.Replace(name)
}

func dedupName(name string, used map[string]int) string {
	if cnt, exists := used[name]; exists {
		used[name] = cnt + 1
		return fmt.Sprintf("%s_%d", name, cnt+1)
	}
	used[name] = 0
	return name
}

func getFilterName(f export.ExportFormat) string {
	switch f {
	case export.FormatPDF:
		return "PDF 文件 (*.pdf)"
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
	case export.FormatPNG:
		return "png"
	default:
		return ""
	}
}
