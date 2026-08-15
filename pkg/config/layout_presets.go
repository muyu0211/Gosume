package config

import (
	"fmt"
	"strings"
)

// ---------------------------------------------------------------------------
// Layout preset configuration (page margin + section spacing tiers)
//
// Users can customize the layout tiers in the settings page: values, labels,
// and the number of tiers (add/remove). The full tier list is persisted in
// config.json alongside data_dir and consumed by the frontend layout engine
// (frontend/src/lib/layoutPresets.ts) — the backend never computes CSS.
//
// resume.meta.page_margin / section_spacing still store tier KEYS; a resume
// referencing a deleted key falls back to the "normal" tier on the frontend.
// ---------------------------------------------------------------------------

// MarginPresetTier is one page-margin tier. Values are in millimeters and
// apply to both single-column (.resume-page) and split-column inner
// containers (injected as --resume-padding / --resume-padding-y/-x).
type MarginPresetTier struct {
	Key      string  `json:"key"`
	Label    string  `json:"label"`
	PaddingY float64 `json:"padding_y"` // mm, vertical
	PaddingX float64 `json:"padding_x"` // mm, horizontal
}

// SpacingPresetTier is one section-spacing tier. Values are in points;
// nil gaps mean "template default" (only allowed for the normal tier,
// which injects no CSS and preserves each template's native rhythm).
type SpacingPresetTier struct {
	Key        string   `json:"key"`
	Label      string   `json:"label"`
	SectionGap *float64 `json:"section_gap"` // pt, module ↔ module; nil = template default
	ItemGap    *float64 `json:"item_gap"`    // pt, entry ↔ entry; nil = template default
	DetailGap  *float64 `json:"detail_gap"`  // pt, detail ↔ detail; nil = template default
}

// LayoutPresetConfig is the persisted layout tier configuration.
type LayoutPresetConfig struct {
	Margins   []MarginPresetTier  `json:"margins"`
	Spacings  []SpacingPresetTier `json:"spacings"`
}

// Tier keys reserved for the built-in default tiers. The "normal" tier is
// the mandatory fallback for both lists and cannot be removed; for spacings
// it must keep nil gaps (template default).
const (
	MarginTierNormalKey   = "normal"
	SpacingTierNormalKey  = "normal"
	marginValueMin, marginValueMax = 5.0, 30.0 // mm
	gapValueMin, gapValueMax       = 0.0, 40.0 // pt
)

// DefaultLayoutPresets returns the built-in default tiers (mirrors the
// constants in frontend/src/lib/layoutPresets.ts).
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
			{Key: "compact", Label: "紧凑", SectionGap: ptr(4.0), ItemGap: ptr(3.0), DetailGap: ptr(1.0)},
			{Key: "narrow", Label: "较窄", SectionGap: ptr(8.0), ItemGap: ptr(5.0), DetailGap: ptr(2.0)},
			{Key: "normal", Label: "标准", SectionGap: nil, ItemGap: nil, DetailGap: nil},
			{Key: "wide", Label: "较宽", SectionGap: ptr(14.0), ItemGap: ptr(8.0), DetailGap: ptr(3.0)},
			{Key: "comfortable", Label: "宽松", SectionGap: ptr(20.0), ItemGap: ptr(11.0), DetailGap: ptr(4.0)},
		},
	}
}

// ptr is a small helper for building default float pointers.
func ptr(v float64) *float64 { return &v }

// ValidateLayoutPresets checks a candidate layout preset configuration.
func ValidateLayoutPresets(cfg LayoutPresetConfig) error {
	if len(cfg.Margins) == 0 {
		return fmt.Errorf("页边距档位至少保留一个")
	}
	if len(cfg.Spacings) == 0 {
		return fmt.Errorf("内容间距档位至少保留一个")
	}

	marginKeys := map[string]bool{}
	for _, t := range cfg.Margins {
		if err := validTierKey(t.Key); err != nil {
			return fmt.Errorf("页边距档位 %s", err)
		}
		if marginKeys[t.Key] {
			return fmt.Errorf("页边距档位 key 重复: %s", t.Key)
		}
		marginKeys[t.Key] = true
		if strings.TrimSpace(t.Label) == "" {
			return fmt.Errorf("页边距档位 %s 的名称为空", t.Key)
		}
		if t.PaddingY < marginValueMin || t.PaddingY > marginValueMax ||
			t.PaddingX < marginValueMin || t.PaddingX > marginValueMax {
			return fmt.Errorf("页边距档位“%s”的数值需在 %.0f–%.0fmm 之间", t.Label, marginValueMin, marginValueMax)
		}
	}
	if !marginKeys[MarginTierNormalKey] {
		return fmt.Errorf("页边距必须保留“标准”档位（未选中档位时的回退值）")
	}

	spacingKeys := map[string]bool{}
	for _, t := range cfg.Spacings {
		if err := validTierKey(t.Key); err != nil {
			return fmt.Errorf("内容间距档位 %s", err)
		}
		if spacingKeys[t.Key] {
			return fmt.Errorf("内容间距档位 key 重复: %s", t.Key)
		}
		spacingKeys[t.Key] = true
		if strings.TrimSpace(t.Label) == "" {
			return fmt.Errorf("内容间距档位 %s 的名称为空", t.Key)
		}
		for name, v := range map[string]*float64{
			"模块间距": t.SectionGap, "条目间距": t.ItemGap, "细节间距": t.DetailGap,
		} {
			if v != nil && (*v < gapValueMin || *v > gapValueMax) {
				return fmt.Errorf("内容间距档位“%s”的%s需在 %.0f–%.0fpt 之间", t.Label, name, gapValueMin, gapValueMax)
			}
		}
	}
	if !spacingKeys[SpacingTierNormalKey] {
		return fmt.Errorf("内容间距必须保留“标准”档位（模板默认 + 回退值）")
	}
	// The normal spacing tier must stay "template default" (nil gaps).
	for _, t := range cfg.Spacings {
		if t.Key == SpacingTierNormalKey &&
			(t.SectionGap != nil || t.ItemGap != nil || t.DetailGap != nil) {
			return fmt.Errorf("内容间距“标准”档位为模板内置节奏，不允许修改其数值")
		}
	}
	return nil
}

func validTierKey(key string) error {
	if key == "" {
		return fmt.Errorf("key 不能为空")
	}
	for _, r := range key {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_') {
			return fmt.Errorf("key %q 含非法字符（仅限字母、数字、-、_）", key)
		}
	}
	if len(key) > 64 {
		return fmt.Errorf("key %q 超过 64 字符", key)
	}
	return nil
}
