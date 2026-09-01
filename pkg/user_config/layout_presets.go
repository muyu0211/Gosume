package user_config

import "fmt"

// ---------------------------------------------------------------------------
// 全局布局（页边距 + 内容间距，px 数值）
//
// 直接存像素绝对值，所有简历共享（全局配置），替代旧的「档位 key」体系。
// 渲染时前端按 util 口径把 px 换算为 mm 注入 CSS。
// ---------------------------------------------------------------------------

// 全局布局数值的范围约束（px）。
const (
	LayoutMarginPxMin  = 1  // 上下/左右页边距最小值
	LayoutMarginPxMax  = 60 // 上下/左右页边距最大值
	LayoutSpacingPxMin = 1  // 模块/条目/细节间距最小值
	LayoutSpacingPxMax = 20 // 模块/条目/细节间距最大值
)

// GlobalLayout 是全局布局的 px 数值配置。
type GlobalLayout struct {
	PageMarginY    int `json:"page_margin_y"`    // px，上下页边距
	PageMarginX    int `json:"page_margin_x"`    // px，左右页边距
	SpacingSection int `json:"spacing_section"`  // px，模块间距
	SpacingItem    int `json:"spacing_item"`     // px，条目间距
	SpacingDetail  int `json:"spacing_detail"`   // px，细节间距
}

// DefaultGlobalLayout 返回全局布局的默认值。
func DefaultGlobalLayout() GlobalLayout {
	return GlobalLayout{
		PageMarginY:    15,
		PageMarginX:    20,
		SpacingSection: 12,
		SpacingItem:    8,
		SpacingDetail:  4,
	}
}

// ValidateGlobalLayout 校验全局布局数值是否在允许范围内，返回面向用户的错误信息。
func ValidateGlobalLayout(l GlobalLayout) error {
	if l.PageMarginY < LayoutMarginPxMin || l.PageMarginY > LayoutMarginPxMax {
		return fmt.Errorf("页边距（上下）需在 %d–%dpx 之间", LayoutMarginPxMin, LayoutMarginPxMax)
	}
	if l.PageMarginX < LayoutMarginPxMin || l.PageMarginX > LayoutMarginPxMax {
		return fmt.Errorf("页边距（左右）需在 %d–%dpx 之间", LayoutMarginPxMin, LayoutMarginPxMax)
	}
	for name, v := range map[string]int{
		"模块": l.SpacingSection, "条目": l.SpacingItem, "细节": l.SpacingDetail,
	} {
		if v < LayoutSpacingPxMin || v > LayoutSpacingPxMax {
			return fmt.Errorf("%s间距需在 %d–%dpx 之间", name, LayoutSpacingPxMin, LayoutSpacingPxMax)
		}
	}
	return nil
}