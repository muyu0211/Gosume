package template_export

import (
	"fmt"

	"gosume/pkg/log"
)

// PNGExporter 通过无头 Chromium 截图把已分页的 HTML 转换为 PNG。
type PNGExporter struct {
	browser Browser
}

// NewPNGExporter 创建 PNG 导出器。
func NewPNGExporter(browser Browser) *PNGExporter {
	return &PNGExporter{browser: browser}
}

// ExportHTML 把 HTML 包装为完整文档后截图为 PNG。
//
// 传入的 HTML 应已由前端切分为 .resume-page 容器；
// opts.Scale 非正数时回退为 1.0。
func (e *PNGExporter) ExportHTML(htmlContent string, opts ExportOptions) ([]byte, error) {
	fullHTML := wrapStandaloneHTML(htmlContent)

	scale := opts.Scale
	if scale <= 0 {
		scale = 1.0
	}

	log.Info("PNG导出: 开始浏览器截图, scale=%.2f", scale)
	png, err := e.browser.RenderPNG(fullHTML, scale)
	if err != nil {
		log.Error("PNG导出: 浏览器截图失败: %v", err)
		return nil, fmt.Errorf("render png: %w", err)
	}

	log.Info("PNG导出: 浏览器截图完成, size=%d", len(png))
	return png, nil
}
