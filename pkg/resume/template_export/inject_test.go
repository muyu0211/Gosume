package template_export

import (
	"strings"
	"testing"
)

func TestInjectFullPageCSS(t *testing.T) {
	// A4 纵向：纸高 1123px，padding 45.3543+45.3543 → page/container min-height = 1123 - 90 = 1033
	html := `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><div class="resume-pages-wrapper" data-pad-top="45.3543" data-pad-bottom="45.3543" style="padding-top: 45.3543px; padding-bottom: 45.3543px;"><div class="resume-page" data-paper-size="A4" data-orientation="portrait">content</div></div></body></html>`
	out := InjectFullPageCSS(html)

	if !strings.Contains(out, `.resume-pages-wrapper{min-height:1123px;box-sizing:border-box}`) {
		t.Errorf("wrapper min-height css missing: %s", out)
	}
	if !strings.Contains(out, `.resume-page{min-height:1033px!important}`) {
		t.Errorf("page min-height wrong (want 1033px): %s", out)
	}
	if !strings.Contains(out, `.resume-container{min-height:1033px!important}`) {
		t.Errorf("container min-height wrong (双栏侧栏延伸依赖它): %s", out)
	}
	if strings.Count(out, "<style>") != 1 {
		t.Errorf("expected exactly one injected <style>, got: %s", out)
	}
}

func TestInjectFullPageCSSNoPad(t *testing.T) {
	html := `<!DOCTYPE html><html><head></head><body><div class="resume-pages-wrapper"><div class="resume-page" data-paper-size="A4"></div></div></body></html>`
	out := InjectFullPageCSS(html)
	if !strings.Contains(out, `.resume-page{min-height:1123px!important}`) {
		t.Errorf("unexpected css: %s", out)
	}
	if !strings.Contains(out, `.resume-container{min-height:1123px!important}`) {
		t.Errorf("unexpected container css: %s", out)
	}
}

func TestInjectFullPageCSSNotFullDoc(t *testing.T) {
	// 无 </head> 时原样返回（非完整文档场景）
	html := `<div class="resume-page">x</div>`
	if out := InjectFullPageCSS(html); out != html {
		t.Errorf("non-full-doc should be unchanged, got: %s", out)
	}
}

func TestParsePagePadFromHTML(t *testing.T) {
	// 浮点数（前端 mm→px 换算，如 12mm = 45.3543px）
	html := `<div class="resume-pages-wrapper" data-pad-top="45.3543" data-pad-bottom="45.3543">`
	top, bottom := parsePagePadFromHTML(html)
	if top != 45 || bottom != 45 {
		t.Errorf("got padTop=%d padBottom=%d, want 45/45", top, bottom)
	}

	html2 := `<div class="resume-pages-wrapper">`
	top2, bottom2 := parsePagePadFromHTML(html2)
	if top2 != 0 || bottom2 != 0 {
		t.Errorf("missing attrs should fallback 0, got %d/%d", top2, bottom2)
	}
}
