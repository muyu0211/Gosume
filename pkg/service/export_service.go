package service

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gosume/pkg/template_export"
	"gosume/pkg/util"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// ExportService 负责把简历导出为 PDF 与 PNG。
//
// 架构约定：模板渲染与分页（把内容切分为 A4 尺寸的 .resume-page 容器）由前端
// 完成，后端只负责用无头 Chromium 把已分页的 HTML 转换为目标格式。
type ExportService struct {
	wailsApp      *application.App
	exportManager *template_export.ExportManager
}

// ServiceName 返回服务名，供 Wails 绑定与前端调用使用。
func (s *ExportService) ServiceName() string {
	return "ExportService"
}

// Inject 注入依赖。
func (s *ExportService) Inject(app *application.App, manager *template_export.ExportManager) {
	s.wailsApp = app
	s.exportManager = manager
}

// ── 对外接口 ──────────────────────────────────────────────────────────────────

// ExportHTML 把已分页的 HTML 导出为目标格式，用于单份简历导出。
//
// 参数：
//   - htmlContent：前端已完成分页的 HTML
//   - format：目标格式，必须为 "pdf" 或 "png"
//   - scale：缩放比例；PDF 应传 1.0，否则内容溢出会产生空白页
//   - resumeName：保存对话框的默认文件名，为空时回退为「简历」
//
// 返回最终保存路径；用户取消保存时返回空路径且不报错。
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

// exportItem 是批量导出中的一份已分页 HTML 文档。
type exportItem struct {
	Name string `json:"name"`
	HTML string `json:"html"`
}

// ExportBatchHTML 批量导出多份已分页的 HTML 文档。
//
// itemsJSON 为 exportItem 数组的 JSON 文本；第一份文件会弹出保存对话框，
// 其余文件自动保存到同一目录。
func (s *ExportService) ExportBatchHTML(itemsJSON string, format string, scale float64) ([]string, error) {
	var items []exportItem
	if err := json.Unmarshal([]byte(itemsJSON), &items); err != nil {
		return nil, util.UserMsg("解析导出数据失败")
	}
	return s.exportBatch(items, format, scale)
}

// ── 内部辅助 ──────────────────────────────────────────────────────────────────

// parseFormat 把前端传入的格式字符串解析为导出选项，格式不支持时报错。
func parseFormat(format string, scale float64) (template_export.ExportOptions, error) {
	switch format {
	case "pdf":
		return template_export.ExportOptions{Format: template_export.FormatPDF, Scale: scale}, nil
	case "png":
		return template_export.ExportOptions{Format: template_export.FormatPNG, Scale: scale}, nil
	default:
		return template_export.ExportOptions{}, util.UserMsg("不支持的导出格式: " + format)
	}
}

// renderOne 把一份已分页的 HTML 转换为目标格式的字节流。
func (s *ExportService) renderOne(html string, opts template_export.ExportOptions) ([]byte, error) {
	data, err := s.exportManager.ExportHTML(html, opts)
	if err != nil {
		return nil, util.UserWrap(err, "导出失败")
	}
	return data, nil
}

// showSaveDialog 弹出保存对话框让用户选择保存位置。
// 用户取消时返回空路径且不报错。
func (s *ExportService) showSaveDialog(defaultName string, opts template_export.ExportOptions, title string) (string, error) {
	filePath, err := s.wailsApp.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:    title,
		Filename: defaultName,
		Filters: []application.FileFilter{
			{DisplayName: getFilterName(opts.Format), Pattern: getFilterPattern(opts.Format)},
		},
	}).PromptForSingleSelection()
	if err != nil {
		if util.IsCancel(err) {
			return "", nil
		}
		return "", util.UserWrap(err, "打开保存对话框失败")
	}
	return filePath, nil
}

// writeFile 写出导出结果文件，失败时包装为用户可读错误。
func (s *ExportService) writeFile(path string, data []byte) error {
	if err := os.WriteFile(path, data, 0644); err != nil {
		return util.UserWrap(err, "写入文件失败")
	}
	return nil
}

// exportBatch 执行批量导出循环。
//
// 第一份文件通过保存对话框确定输出目录，其余文件自动写入该目录；
// 单份渲染或写入失败时跳过该份，继续导出其余文件。
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

// ── 文件名辅助 ────────────────────────────────────────────────────────────────

// sanitizeFilename 把文件名中不被文件系统允许的字符替换为下划线。
func sanitizeFilename(name string) string {
	replacer := strings.NewReplacer(
		"/", "_", "\\", "_", ":", "_", "*", "_",
		"?", "_", "\"", "_", "<", "_", ">", "_", "|", "_",
	)
	return replacer.Replace(name)
}

// dedupName 对重名文件追加序号后缀，避免批量导出时相互覆盖。
// used 记录各名称已出现的次数，由调用方在一次批量导出内复用。
func dedupName(name string, used map[string]int) string {
	if cnt, exists := used[name]; exists {
		used[name] = cnt + 1
		return fmt.Sprintf("%s_%d", name, cnt+1)
	}
	used[name] = 0
	return name
}

// getFilterName 返回保存对话框中该格式的显示名称。
func getFilterName(f template_export.ExportFormat) string {
	switch f {
	case template_export.FormatPDF:
		return "PDF 文件 (*.pdf)"
	case template_export.FormatPNG:
		return "PNG 图片 (*.png)"
	default:
		return "所有文件 (*.*)"
	}
}

// getFilterPattern 返回保存对话框中该格式的通配符模式。
func getFilterPattern(f template_export.ExportFormat) string {
	switch f {
	case template_export.FormatPDF:
		return "*.pdf"
	case template_export.FormatPNG:
		return "*.png"
	default:
		return "*.*"
	}
}

// formatSuffix 返回该格式对应的文件扩展名（不含点号）。
func formatSuffix(f template_export.ExportFormat) string {
	switch f {
	case template_export.FormatPDF:
		return "pdf"
	case template_export.FormatPNG:
		return "png"
	default:
		return ""
	}
}
