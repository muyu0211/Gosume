/**
 * Page margin presets for resume pages.
 *
 * Each preset defines vertical (top/bottom) and horizontal (left/right)
 * padding values. These are exposed to templates via two CSS variables:
 *
 *   --resume-padding   ← full shorthand "V H" (used by single-column
 *                        templates whose .resume-page owns the padding)
 *   --resume-padding-y ← vertical only (used by split-column templates
 *                        where .resume-page has no padding and inner
 *                        columns own their own padding)
 *   --resume-padding-x ← horizontal only (same as above)
 *
 * Split-column templates (gradient, creative) reference -y / -x on their
 * inner containers so the page-margin slider still works there.
 */
export interface MarginPreset {
  /** Machine-stored value (persisted in resume.meta.page_margin) */
  key: string
  /** Short label shown in the UI */
  label: string
  /** Longer description shown in the UI */
  description: string
  /** Full CSS padding shorthand "V H" */
  padding: string
  /** Vertical padding only (top & bottom) */
  paddingY: string
  /** Horizontal padding only (left & right) */
  paddingX: string
}

export const MARGIN_PRESETS: MarginPreset[] = [
  {
    key: 'compact',
    label: '紧凑',
    description: '8mm / 10mm',
    padding: '8mm 10mm',
    paddingY: '8mm',
    paddingX: '10mm',
  },
  {
    key: 'narrow',
    label: '较窄',
    description: '10mm / 12mm',
    padding: '10mm 12mm',
    paddingY: '10mm',
    paddingX: '12mm',
  },
  {
    key: 'normal',
    label: '标准',
    description: '12mm / 14mm',
    padding: '12mm 14mm',
    paddingY: '12mm',
    paddingX: '14mm',
  },
  {
    key: 'wide',
    label: '较宽',
    description: '14mm / 16mm',
    padding: '14mm 16mm',
    paddingY: '14mm',
    paddingX: '16mm',
  },
  {
    key: 'comfortable',
    label: '宽松',
    description: '16mm / 18mm',
    padding: '16mm 18mm',
    paddingY: '16mm',
    paddingX: '18mm',
  },
]

export const DEFAULT_MARGIN_KEY = 'normal'

/** Returns the preset matching the given key, falling back to 'normal'. */
export function getMarginPreset(key: string | undefined | null): MarginPreset {
  return MARGIN_PRESETS.find((p) => p.key === key) ?? MARGIN_PRESETS.find((p) => p.key === DEFAULT_MARGIN_KEY)!
}

/** Returns the index of the preset matching the given key (0-based). */
export function getMarginPresetIndex(key: string | undefined | null): number {
  const idx = MARGIN_PRESETS.findIndex((p) => p.key === key)
  return idx >= 0 ? idx : MARGIN_PRESETS.findIndex((p) => p.key === DEFAULT_MARGIN_KEY)!
}

/**
 * Injects CSS variables on `:root` so templates can consume them:
 *
 *   --resume-padding     ← "V H" shorthand, used by single-column
 *                          templates whose .resume-page owns the padding
 *   --resume-padding-y   ← vertical only, used by split-column templates
 *   --resume-padding-x   ← horizontal only, used by split-column templates
 *
 * Why variables instead of overriding `.resume-page { padding: ... }`?
 *   - Each template's `.resume-page` (and for split-column templates,
 *     their inner containers) padding is referenced via
 *     `var(--resume-padding[-y/-x], <original-default>)`. Setting the
 *     variable here lets the template's own CSS handle the change with
 *     no white-margin or stacking artifacts.
 *   - Internal elements (e.g. `.summary`, `.section-title`) keep their
 *     own padding/border which is intentional design; only the page
 *     padding is affected.
 *   - `@media print` rules that also reference the variable stay in sync
 *     automatically (modern/leaf/swiss had print/screen mismatch before).
 *
 * Shared by the live preview (usePreview) and batch export
 * (ResumeListDrawer) so both honor resume.meta.page_margin.
 *
 * If no `<style>` tag is found, appends a new one before `</head>`.
 */
export function injectMarginCss(html: string, preset: MarginPreset): string {
  const rule = `\n:root { --resume-padding: ${preset.padding}; --resume-padding-y: ${preset.paddingY}; --resume-padding-x: ${preset.paddingX}; }\n`
  // Try to inject before the first closing </style> tag so it wins over
  // any `:root` rules already present in the template.
  const styleCloseIdx = html.indexOf('</style>')
  if (styleCloseIdx !== -1) {
    return html.slice(0, styleCloseIdx) + rule + html.slice(styleCloseIdx)
  }
  // Fallback: inject a new <style> before </head>
  const headCloseIdx = html.indexOf('</head>')
  if (headCloseIdx !== -1) {
    return html.slice(0, headCloseIdx) + `<style>${rule}</style>` + html.slice(headCloseIdx)
  }
  // Last resort: prepend
  return `<style>${rule}</style>` + html
}
