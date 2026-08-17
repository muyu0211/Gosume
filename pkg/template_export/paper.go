package template_export

import (
	"math"
	"regexp"
	"strings"
)

// PaperSpec 描述用于分页与导出的物理纸张规格。
//
// 各字段取值与前端 frontend/src/lib/paper.ts 保持一致。px 采用 CSS 参考像素
// （96dpi），即 1in = 96px、1mm = 96/25.4 px——与无头 Chromium 排版 mm 单位
// CSS 的方式，以及它以英寸上报 PDF 纸张尺寸的方式一致。
type PaperSpec struct {
	Name  string
	MmW   float64
	MmH   float64
	PxW   int
	PxH   int
	InchW float64
	InchH float64
}

var (
	// PaperA4 是 A4 纵向规格（210 × 297 mm）。
	PaperA4 = makePaper("A4", 210, 297)
	// PaperLetter 是 Letter 纵向规格（8.5 × 11 in）。
	PaperLetter = makePaper("Letter", 215.9, 279.4)
)

// mmToPx 是毫米到 CSS 参考像素的换算系数（96dpi）。
const mmToPx = 96 / 25.4

// makePaper 由毫米尺寸推导出像素与英寸尺寸，构造完整的纸张规格。
func makePaper(name string, mmW, mmH float64) PaperSpec {
	return PaperSpec{
		Name:  name,
		MmW:   mmW,
		MmH:   mmH,
		PxW:   int(math.Round(mmW * mmToPx)),
		PxH:   int(math.Round(mmH * mmToPx)),
		InchW: round2(mmW / 25.4),
		InchH: round2(mmH / 25.4),
	}
}

// round2 保留两位小数，用于英寸尺寸取整。
func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

// ResolvePaper 按纸张名称与横向标记返回对应规格。
// 名称未知时回退到 A4；landscape 为 true 时交换宽高。
func ResolvePaper(name string, landscape bool) PaperSpec {
	var base PaperSpec
	switch strings.ToLower(name) {
	case "letter":
		base = PaperLetter
	default:
		base = PaperA4
	}
	if !landscape {
		return base
	}
	return PaperSpec{
		Name:  base.Name,
		MmW:   base.MmH,
		MmH:   base.MmW,
		PxW:   base.PxH,
		PxH:   base.PxW,
		InchW: base.InchH,
		InchH: base.InchW,
	}
}

// 用于从 HTML 中提取前端标注的纸张规格属性。
var (
	paperSizeRe   = regexp.MustCompile(`data-paper-size="([^"]*)"`)
	orientationRe = regexp.MustCompile(`data-orientation="([^"]*)"`)
)

// PaperFromHTML 读取前端渲染器标注在 .resume-page 元素上的纸张规格。
// 未找到相应属性时回退到 A4 纵向。
func PaperFromHTML(html string) PaperSpec {
	name := ""
	orientation := ""
	if m := paperSizeRe.FindStringSubmatch(html); m != nil {
		name = m[1]
	}
	if m := orientationRe.FindStringSubmatch(html); m != nil {
		orientation = m[1]
	}
	return ResolvePaper(name, orientation == "landscape")
}
