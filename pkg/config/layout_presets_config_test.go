package config

import (
	"strings"
	"testing"
)

func TestValidateLayoutPresetsDefaults(t *testing.T) {
	if err := ValidateLayoutPresets(DefaultLayoutPresets()); err != nil {
		t.Fatalf("default presets failed validation: %v", err)
	}
}

func TestValidateLayoutPresetsRules(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(cfg *LayoutPresetConfig)
		wantErr string
	}{
		{
			name:    "删除标准页边距档位",
			mutate:  func(c *LayoutPresetConfig) { c.Margins = c.Margins[:2] },
			wantErr: "保留",
		},
		{
			name: "删除标准内容间距档位",
			mutate: func(c *LayoutPresetConfig) {
				var kept []SpacingPresetTier
				for _, s := range c.Spacings {
					if s.Key != SpacingTierNormalKey {
						kept = append(kept, s)
					}
				}
				c.Spacings = kept
			},
			wantErr: "保留",
		},
		{
			name: "修改标准内容间距档位数值",
			mutate: func(c *LayoutPresetConfig) {
				for i := range c.Spacings {
					if c.Spacings[i].Key == SpacingTierNormalKey {
						c.Spacings[i].SectionGap = ptr(10.0)
					}
				}
			},
			wantErr: "模板内置",
		},
		{
			name: "页边距数值越界",
			mutate: func(c *LayoutPresetConfig) {
				c.Margins[0].PaddingY = 100
			},
			wantErr: "mm",
		},
		{
			name: "间距 key 重复",
			mutate: func(c *LayoutPresetConfig) {
				c.Margins[1].Key = c.Margins[0].Key
			},
			wantErr: "重复",
		},
		{
			name: "自定义档位合法",
			mutate: func(c *LayoutPresetConfig) {
				c.Margins = append(c.Margins, MarginPresetTier{Key: "custom-a", Label: "我的档位", PaddingY: 11, PaddingX: 13})
				c.Spacings = append(c.Spacings, SpacingPresetTier{Key: "custom-b", Label: "特宽", SectionGap: ptr(24.0), ItemGap: ptr(12.0), DetailGap: ptr(5.0)})
			},
			wantErr: "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := DefaultLayoutPresets()
			tt.mutate(&cfg)
			err := ValidateLayoutPresets(cfg)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("expected valid, got error: %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("expected error containing %q, got: %v", tt.wantErr, err)
			}
		})
	}
}
