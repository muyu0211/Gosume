package export

import (
	"math"
	"regexp"
	"strings"
)

// PaperSpec describes a physical paper size for pagination and export.
// Values mirror frontend/src/lib/paper.ts. px uses the CSS reference pixel
// (96dpi) so 1in = 96px and 1mm = 96/25.4 px, matching how headless Chromium
// lays out mm-based CSS and how it reports PDF paper size in inches.
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
	// PaperA4 is the A4-portrait spec (210 × 297 mm).
	PaperA4 = makePaper("A4", 210, 297)
	// PaperLetter is the Letter-portrait spec (8.5 × 11 in).
	PaperLetter = makePaper("Letter", 215.9, 279.4)
)

const mmToPx = 96 / 25.4

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

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

// ResolvePaper returns the paper spec for a name and a landscape flag.
// Unknown names fall back to A4.
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

var (
	paperSizeRe   = regexp.MustCompile(`data-paper-size="([^"]*)"`)
	orientationRe = regexp.MustCompile(`data-orientation="([^"]*)"`)
)

// PaperFromHTML extracts the paper spec tagged on the .resume-page element by
// the frontend renderer. Falls back to A4 portrait when the tag is absent.
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
