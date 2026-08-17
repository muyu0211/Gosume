package user_config

import "gosume/pkg/util"

// ---------------------------------------------------------------------------
// 布局档位配置（页边距 + 内容间距）
//
// 用户可在设置页自定义档位的数值、名称和数量，档位列表持久化到数据目录内的
// config.json，由前端布局引擎（frontend/src/lib/layoutPresets.ts）消费——
// 后端不计算 CSS。
//
// resume.meta.page_margin / section_spacing 存的是档位 key；引用已删除的 key
// 时，前端回退到 normal 档。
// ---------------------------------------------------------------------------

// MarginPresetTier 是一个页边距档位。
//
// 数值单位为毫米，同时作用于单栏（.resume-page）与分栏模板的内层容器
// （注入为 --resume-padding / --resume-padding-y/-x）。
type MarginPresetTier struct {
	Key      string  `json:"key"`
	Label    string  `json:"label"`
	PaddingY float64 `json:"padding_y"` // 毫米，纵向
	PaddingX float64 `json:"padding_x"` // 毫米，横向
}

// SpacingPresetTier 是一个内容间距档位。
//
// 数值单位为磅（pt）；为 nil 表示「沿用模板默认节奏」——该取值只允许出现在
// normal 档，此时不注入任何 CSS，保留各模板自身的间距设计。
type SpacingPresetTier struct {
	Key        string   `json:"key"`
	Label      string   `json:"label"`
	SectionGap *float64 `json:"section_gap"` // 磅，模块 ↔ 模块；nil 表示模板默认
	ItemGap    *float64 `json:"item_gap"`    // 磅，条目 ↔ 条目；nil 表示模板默认
	DetailGap  *float64 `json:"detail_gap"`  // 磅，细节 ↔ 细节；nil 表示模板默认
}

// LayoutPresetConfig 是持久化的布局档位配置。
type LayoutPresetConfig struct {
	Margins  []MarginPresetTier  `json:"margins"`
	Spacings []SpacingPresetTier `json:"spacings"`
}

// DefaultLayoutPresets 返回默认的布局档位配置。
func DefaultLayoutPresets() LayoutPresetConfig {
	return LayoutPresetConfig{
		Margins: []MarginPresetTier{
			{Key: "compact", Label: "紧凑", PaddingY: 8, PaddingX: 10},
			{Key: "narrow", Label: "较窄", PaddingY: 10, PaddingX: 12},
			{Key: "normal", Label: "标准", PaddingY: 12, PaddingX: 14},
			{Key: "wide", Label: "较宽", PaddingY: 14, PaddingX: 16},
			{Key: "comfortable", Label: "宽松", PaddingY: 16, PaddingX: 18},
		},
		Spacings: []SpacingPresetTier{
			{Key: "compact", Label: "紧凑", SectionGap: util.FloatPtr(4.0), ItemGap: util.FloatPtr(3.0), DetailGap: util.FloatPtr(1.0)},
			{Key: "narrow", Label: "较窄", SectionGap: util.FloatPtr(8.0), ItemGap: util.FloatPtr(4.0), DetailGap: util.FloatPtr(2.0)},
			{Key: "normal", Label: "标准", SectionGap: nil, ItemGap: nil, DetailGap: nil},
			{Key: "wide", Label: "较宽", SectionGap: util.FloatPtr(14.0), ItemGap: util.FloatPtr(8.0), DetailGap: util.FloatPtr(3.0)},
			{Key: "comfortable", Label: "宽松", SectionGap: util.FloatPtr(20.0), ItemGap: util.FloatPtr(11.0), DetailGap: util.FloatPtr(4.0)},
		},
	}
}
