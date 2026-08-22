package service

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"gosume/pkg/event"
	"gosume/pkg/log"
	"gosume/pkg/resume/template_export"
	"gosume/pkg/util"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// ExportService 负责把简历导出为 PDF 与 PNG。
//
// 架构约定：模板渲染与分页（把内容切分为 A4 尺寸的 .resume-page 容器）由前端
// 完成，后端只负责用无头 Chromium 把已分页的 HTML 转换为目标格式。
type ExportService struct {
	app            *application.App
	browserManager *template_export.BrowserManager
}

// exportItem 是批量导出中的一份已分页 HTML 文档。
type exportItem struct {
	Name string `json:"name"`
	HTML string `json:"html"`
}

// ServiceName 返回服务名，供 Wails 绑定与前端调用使用。
func (s *ExportService) ServiceName() string {
	return "ExportService"
}

// Inject 注入依赖。
func (s *ExportService) Inject(app *application.App, browser *template_export.BrowserManager) {
	s.app = app
	s.browserManager = browser
}

// Export 把已分页的 HTML 导出为目标格式，用于单份简历导出。
//
// 参数：
//   - htmlContent：前端已完成分页的 HTML
//   - exportType: 前端导出类型: "pdf" , "png", "single_pdf"
//   - scale：缩放比例；PDF 默认 1.0，否则内容溢出会产生空白页
//   - resumeName：保存对话框的默认文件名，为空时回退为「简历」
//
// 返回最终保存路径；用户取消保存时返回空路径且不报错。
func (s *ExportService) Export(htmlContent string, exportType string, scale float64, resumeName string) (string, error) {
	log.Infof("[export_service] Export: 开始导出 format=%s scale=%.2f name=%s", exportType, scale, resumeName)
	opts, err := parseFormat(exportType, scale)
	if err != nil {
		log.Errorf("[export_service] Export: 解析导出格式失败: %v", err)
		return "", err
	}

	s.app.Event.Emit(event.EXPORT_PROGRESS, 10)
	data, err := s.renderOne(htmlContent, opts)
	if err != nil {
		log.Errorf("[export_service] Export: 渲染导出失败: %v", err)
		return "", err
	}
	s.app.Event.Emit(event.EXPORT_PROGRESS, 70)

	// 去除文件名中的路径分隔符
	baseName := util.SanitizeFilename(resumeName)
	if baseName == "" {
		baseName = "简历"
	}

	defaultName := fmt.Sprintf("%s.%s", baseName, formatSuffix(opts.FileFormat))
	filePath, err := s.showSaveDialog(defaultName, opts, "导出简历")
	if err != nil || filePath == "" {
		return filePath, err
	}

	if err := s.writeFile(filePath, data); err != nil {
		return "", err
	}

	log.Infof("[export_service] Export: 导出完成 file=%s", filePath)
	s.app.Event.Emit(event.EXPORT_PROGRESS, 100)
	s.app.Event.Emit(event.EXPORT_COMPLETED, filePath)
	return filePath, nil
}

// ExportBatch 批量导出多份已分页的 HTML 文档。
//
// itemsJSON 为 exportItem 数组的 JSON 文本；第一份文件会弹出保存对话框，
// 其余文件自动保存到同一目录。
func (s *ExportService) ExportBatch(itemsJSON string, exportType string, scale float64) ([]string, error) {
	var items []exportItem
	if err := json.Unmarshal([]byte(itemsJSON), &items); err != nil {
		log.Errorf("[export_service] ExportBatch: 解析导出数据失败: %v", err)
		return nil, util.DoRsp(util.ErrCode, "解析导出数据失败", nil)
	}
	log.Infof("[export_service] ExportBatch: 批量导出 %d 份 format=%s", len(items), exportType)
	return s.exportBatch(items, exportType, scale)
}

// GetResumeContentHeight 获取当前简历渲染内容的高度（px），供前端参考。
//
// 渲染与浏览器测量分离：仅在读锁内完成数据快照与 HTML 渲染，测量耗时操作在
// 释放读锁后执行，避免长时间阻塞对简历的写操作。
func (s *ExportService) GetResumeContentHeight(htmlContent string, scale float64) *util.Response {
	h, err := s.browserManager.MeasureContentHeight(htmlContent, scale)
	if err != nil {
		log.Errorf("[export_service] GetResumeContentHeight: 测量内容高度失败: %v", err)
		return util.DoRsp(util.ErrCode, "测量内容高度失败", err)
	}
	log.Infof("[export_service] GetResumeContentHeight: 内容高度=%d", h)
	return util.DoRsp(util.SuccCode, "测量内容高度成功", h)
}

// parseFormat 把前端传入的导出类型字符串解析为导出文件格式，格式不支持时报错。
func parseFormat(exportType string, scale float64) (template_export.ExportOptions, error) {
	opt := template_export.ExportOptions{
		Scale:      scale,
		ExportType: exportType,
	}

	// 映射成导出文件格式
	if v, ok := template_export.ExportFormatMap[exportType]; ok {
		opt.FileFormat = v
		return opt, nil
	}
	return opt, fmt.Errorf("不支持的导出格式: %v", exportType)
}

// renderOne 把一份已分页的 HTML 按格式分发给无头 Chromium 渲染。
// 包装为完整文档后交给 BrowserManager，得到目标格式的字节流。
func (s *ExportService) renderOne(htmlContent string, opts template_export.ExportOptions) ([]byte, error) {
	htmlContent = template_export.EnableStandaloneHTML(htmlContent)
	var (
		data []byte
		err  error
	)
	switch opts.ExportType {
	case template_export.ExportTypePDF:
		data, err = s.browserManager.RenderPDF(htmlContent, opts.PageRange)
	case template_export.ExportTypePNG:
		data, err = s.browserManager.RenderPNG(htmlContent, opts.Scale)
	case template_export.ExportTypeSinglePDF:
		data, err = s.browserManager.RenderSinglePDF(htmlContent, opts.Scale)
	default:
		log.Errorf("不支持的导出格式: %v", opts.FileFormat)
		return nil, fmt.Errorf("不支持的导出格式: %v", opts.FileFormat)
	}

	if err != nil {
		log.Errorf("导出失败, err: %v", err)
		return nil, util.DoRsp(util.ErrCode, "导出失败", nil)
	}

	return data, nil
}

// showSaveDialog 弹出保存对话框让用户选择保存位置。
// 用户取消时返回空路径且不报错。
func (s *ExportService) showSaveDialog(defaultName string, opts template_export.ExportOptions, title string) (string, error) {
	filePath, err := s.app.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:    title,
		Filename: defaultName,
		Filters: []application.FileFilter{
			{DisplayName: getFilterName(opts.FileFormat), Pattern: getFilterPattern(opts.FileFormat)},
		},
	}).PromptForSingleSelection()
	if err != nil {
		// 用户主动取消
		if util.IsCancel(err) {
			return "", nil
		}
		log.Errorf("打开保存对话框失败: %v", err)
		return "", util.DoRsp(util.ErrCode, "打开保存对话框失败", nil)
	}
	return filePath, nil
}

// writeFile 写出导出结果文件，失败时包装为用户可读错误。
func (s *ExportService) writeFile(path string, data []byte) error {
	if err := os.WriteFile(path, data, 0644); err != nil {
		log.Errorf("写入文件失败, err: %v", err)
		return util.DoRsp(util.ErrCode, "写入文件失败", nil)
	}
	return nil
}

// exportBatch 执行批量导出循环。
//
// 第一份文件通过保存对话框确定输出目录，其余文件自动写入该目录；
// 单份渲染或写入失败时跳过该份，继续导出其余文件。
func (s *ExportService) exportBatch(items []exportItem, exportType string, scale float64) ([]string, error) {
	opts, err := parseFormat(exportType, scale)
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
			log.Errorf("[export_service] exportBatch: 渲染跳过 name=%s: %v", item.Name, err)
			continue
		}

		s.app.Event.Emit(event.EXPORT_PROGRESS, int(float64(i+1)/float64(total)*100))

		safeName := dedupName(util.SanitizeFilename(item.Name), usedNames)
		defaultName := fmt.Sprintf("%s.%s", safeName, formatSuffix(opts.FileFormat))

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

	log.Infof("[export_service] exportBatch: 批量导出完成，成功 %d/%d", len(saved), total)
	return saved, nil
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

var filterNameMap = map[string]string{
	template_export.FormatPDF: "PDF 文件 (*.pdf)",
	template_export.FormatPNG: "PNG 图片 (*.png)",
}

var filterPatternMap = map[string]string{
	template_export.FormatPDF: "*.pdf",
	template_export.FormatPNG: "*.png",
}

var formatSuffixMap = map[string]string{
	template_export.FormatPDF: "pdf",
	template_export.FormatPNG: "png",
}

// getFilterName 返回保存对话框中该格式的显示名称。
func getFilterName(fileFormat string) string {
	if name, exists := filterNameMap[fileFormat]; exists {
		return name
	}
	return "所有文件 (*.*)"
}

// getFilterPattern 返回保存对话框中该格式的通配符模式。
func getFilterPattern(fileFormat string) string {
	if pattern, exists := filterPatternMap[fileFormat]; exists {
		return pattern
	}
	return "*.*"
}

// formatSuffix 返回该格式对应的文件扩展名（不含点号）。
func formatSuffix(fileFormat string) string {
	if suffix, exists := formatSuffixMap[fileFormat]; exists {
		return suffix
	}
	return ""
}
