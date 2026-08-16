/**
 * Page layout tiers: page margin + section spacing.
 *
 * Tier lists are user-customizable in the settings page (values, labels,
 * and count) and persisted via SystemService.Get/SetLayoutPresets to
 * config.json; built-in defaults below mirror
 * pkg/config/layout_presets.go (wire format is snake_case).
 *
 * resume.meta.page_margin / section_spacing still store tier KEYS:
 *
 *   resume.meta.page_margin     ← margin tier key
 *   resume.meta.section_spacing ← spacing tier key
 *
 * A resume referencing a deleted key falls back to the mandatory "normal"
 * tier. The frontend owns the mapping tier → concrete CSS values;
 * rendering is pure frontend CSS injection.
 */

// ---------------------------------------------------------------------------
// Tier types (wire format, matches pkg/config/layout_presets.go)
// ---------------------------------------------------------------------------

/** One page-margin tier. Values are millimeters. */
export interface MarginTier {
  key: string
  label: string
  padding_y: number // mm, vertical
  padding_x: number // mm, horizontal
}

/**
 * One section-spacing tier. Values are points; null gaps mean
 * "template default" (only allowed for the normal tier, which injects
 * no CSS and preserves each template's native rhythm).
 */
export interface SpacingTier {
  key: string
  label: string
  section_gap: number | null // pt, module ↔ module
  item_gap: number | null // pt, entry ↔ entry
  detail_gap: number | null // pt, detail ↔ detail
}

export interface LayoutPresetSettings {
  margins: MarginTier[]
  spacings: SpacingTier[]
}

/** Key of the mandatory fallback tier in both lists. */
export const NORMAL_TIER_KEY = 'normal'

// ---------------------------------------------------------------------------
// Built-in defaults (mirror DefaultLayoutPresets in pkg/config/layout_presets.go)
// ---------------------------------------------------------------------------

export const DEFAULT_LAYOUT_SETTINGS: LayoutPresetSettings = {
  margins: [
    { key: 'compact', label: '紧凑', padding_y: 8, padding_x: 10 },
    { key: 'narrow', label: '较窄', padding_y: 10, padding_x: 12 },
    { key: 'normal', label: '标准', padding_y: 12, padding_x: 14 },
    { key: 'wide', label: '较宽', padding_y: 14, padding_x: 16 },
    { key: 'comfortable', label: '宽松', padding_y: 16, padding_x: 18 },
  ],
  spacings: [
    { key: 'compact', label: '紧凑', section_gap: 4, item_gap: 3, detail_gap: 1 },
    { key: 'narrow', label: '较窄', section_gap: 8, item_gap: 5, detail_gap: 2 },
    { key: 'normal', label: '标准', section_gap: null, item_gap: null, detail_gap: null },
    { key: 'wide', label: '较宽', section_gap: 14, item_gap: 8, detail_gap: 3 },
    { key: 'comfortable', label: '宽松', section_gap: 20, item_gap: 11, detail_gap: 4 },
  ],
}

export const DEFAULT_MARGIN_KEY = NORMAL_TIER_KEY
export const DEFAULT_SECTION_SPACING_KEY = NORMAL_TIER_KEY

/** Interim builds briefly stored numeric mm strings; map them back to keys. */
const LEGACY_NUMERIC_MARGIN: Record<string, string> = {
  '8': 'compact',
  '10': 'narrow',
  '12': 'normal',
  '14': 'wide',
  '16': 'comfortable',
}

// ---------------------------------------------------------------------------
// Tier resolvers
// ---------------------------------------------------------------------------

/** Returns the margin tier matching the stored key, falling back to normal. */
export function findMarginTier(key: string | undefined | null, tiers: MarginTier[]): MarginTier {
  const resolved = LEGACY_NUMERIC_MARGIN[key ?? ''] ?? key
  return tiers.find((t) => t.key === resolved) ?? findNormalTier(tiers)
}

/** Returns the spacing tier matching the stored key, falling back to normal. */
export function findSpacingTier(key: string | undefined | null, tiers: SpacingTier[]): SpacingTier {
  return tiers.find((t) => t.key === key) ?? findNormalTier(tiers)
}

function findNormalTier<T extends { key: string }>(tiers: T[]): T {
  return tiers.find((t) => t.key === NORMAL_TIER_KEY) ?? tiers[0]
}

/** Short UI description for a margin tier, e.g. "12mm / 14mm". */
export function marginTierDescription(t: MarginTier): string {
  return `${t.padding_y}mm / ${t.padding_x}mm`
}

/** Short UI description for a spacing tier (module / entry / detail pt). */
export function spacingTierDescription(t: SpacingTier): string {
  if (t.section_gap === null || t.item_gap === null || t.detail_gap === null) {
    return '模板默认'
  }
  return `模块 ${fmt(t.section_gap)}pt / 条目 ${fmt(t.item_gap)}pt / 细节 ${fmt(t.detail_gap)}pt`
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

// ---------------------------------------------------------------------------
// Section spacing CSS selectors
// ---------------------------------------------------------------------------

/**
 * Template item-level components (entries inside a module) that share the
 * `itemGap` rhythm. Names follow the templates/AGENTS.md naming
 * convention and are shared by all built-in templates; unknown selectors
 * in a given template simply don't match.
 */
const ITEM_SELECTORS = [
  '.experience-item',
  '.education-item',
  '.award-item',
  '.custom-item',
  '.skill-category',
  '.skill-item',
  '.sidebar-item',
].join(', ')

/**
 * Intra-item detail elements (rows inside one entry) that share the
 * `detailGap` rhythm. All templates express these gaps with
 * margin-bottom (enforced by templates/AGENTS.md), so a single injected
 * rule produces consistent behavior everywhere.
 */
const DETAIL_SELECTORS =
  '.exp-header, .exp-location, .exp-summary, .highlights li, .edu-detail, .edu-courses'

// ---------------------------------------------------------------------------
// CSS injection
// ---------------------------------------------------------------------------

/**
 * Injects layout CSS variables / rules so templates can consume them.
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
 *     automatically.
 *
 * Section spacing is applied on three tiers — module ↔ module (gap above
 * each .section-title), entry ↔ entry inside a module, and detail rows
 * inside one entry — so every content component participates in the
 * rhythm. The normal tier (null gaps) injects no spacing rules and keeps
 * each template's native rhythm. Rules use `!important` on purpose: they
 * must win over per-template item margins (some templates use
 * higher-specificity selectors like `.resume-main .experience-item`).
 *
 * Shared by the live preview (usePreview) and batch export
 * (ResumeListDrawer) so both honor the same layout settings.
 *
 * If no `<style>` tag is found, appends a new one before `</head>`.
 */
/** 布局档位注入的固定 style id（iframe 内），供增量更新（方案 4 的 CSS 注入改造）。 */
export const LAYOUT_STYLE_ID = 'layout-inject'
/** 头像尺寸注入的固定 style id。 */
export const AVATAR_STYLE_ID = 'avatar-inject'

/**
 * 构建布局档位 CSS 规则（不含 `<style>` 标签）。
 * 供 injectLayoutCss 使用，也供 PreviewPanel 增量更新时直接写入 iframe 内 style。
 */
export function buildLayoutCss(
  marginKey: string | undefined | null,
  sectionSpacingKey: string | undefined | null,
  settings?: LayoutPresetSettings,
): string {
  const margins = settings?.margins?.length ? settings.margins : DEFAULT_LAYOUT_SETTINGS.margins
  const spacings = settings?.spacings?.length
    ? settings.spacings
    : DEFAULT_LAYOUT_SETTINGS.spacings

  const margin = findMarginTier(marginKey, margins)
  let rule = `:root { --resume-padding: ${margin.padding_y}mm ${margin.padding_x}mm; --resume-padding-y: ${margin.padding_y}mm; --resume-padding-x: ${margin.padding_x}mm; }`

  const spacing = findSpacingTier(sectionSpacingKey, spacings)
  if (spacing.section_gap !== null && spacing.item_gap !== null && spacing.detail_gap !== null) {
    const { section_gap: sectionGap, item_gap: itemGap, detail_gap: detailGap } = spacing
    rule +=
      // Title → first entry of its module
      `\n.section-title { margin-bottom: ${itemGap}pt !important; }\n` +
      // Entry ↔ entry inside a module (jobs, education, awards, skills, …)
      `${ITEM_SELECTORS} { margin-bottom: ${itemGap}pt !important; }\n` +
      // Detail rows inside one entry (header/location/summary/bullets/edu rows/extras)
      `${DETAIL_SELECTORS}, .extra-row { margin-bottom: ${detailGap}pt !important; }\n` +
      // Zero the trailing margin of the last block before a module title so
      // the module gap below is the single source of truth. MUST come after
      // the item rules above: same specificity + !important → source order
      // decides.
      `*:has(+ .section-title) { margin-bottom: 0 !important; }\n` +
      // Module ↔ module gap
      `* + .section-title { margin-top: ${sectionGap}pt !important; }\n`
  }

  return rule
}

/**
 * 构建头像尺寸 CSS 规则（不含 `<style>` 标签）。无头像尺寸时返回空字符串。
 */
export function buildAvatarCss(personal?: { avatar_width?: number; avatar_height?: number }): string {
  const w = personal?.avatar_width
  const h = personal?.avatar_height
  if (!w || !h) return ''
  return `.r-avatar img { width: ${w}px !important; height: ${h}px !important; }`
}

/**
 * Injects layout CSS (page margin + section spacing) from the meta tier keys.
 * 规则以独立的 `<style id="layout-inject">` 标签插入 `</head>` 前（source order
 * 在模板 `<style>` 之后），便于实时预览增量更新时只改写该 style，不重写文档。
 */
export function injectLayoutCss(
  html: string,
  marginKey: string | undefined | null,
  sectionSpacingKey: string | undefined | null,
  settings?: LayoutPresetSettings,
): string {
  const rule = buildLayoutCss(marginKey, sectionSpacingKey, settings)
  return injectStyleTag(html, rule, LAYOUT_STYLE_ID)
}

/**
 * Injects a CSS rule that overrides the rendered avatar's display size.
 * 规则以独立的 `<style id="avatar-inject">` 标签插入 `</head>` 前。
 * No-op if either dimension is missing or non-positive.
 */
export function injectAvatarSizeCss(
  html: string,
  personal?: { avatar_width?: number; avatar_height?: number },
): string {
  const rule = buildAvatarCss(personal)
  if (!rule) return html
  return injectStyleTag(html, rule, AVATAR_STYLE_ID)
}

/** 把规则包成 `<style id>` 标签插到 `</head>` 前（source order 在模板 style 之后）。 */
function injectStyleTag(html: string, rule: string, id: string): string {
  const headCloseIdx = html.indexOf('</head>')
  if (headCloseIdx !== -1) {
    return html.slice(0, headCloseIdx) + `<style id="${id}">${rule}</style>` + html.slice(headCloseIdx)
  }
  return `<style id="${id}">${rule}</style>` + html
}
