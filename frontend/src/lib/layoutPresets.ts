/**
 * Global page layout: page margins + content spacing, stored as exact px values.
 *
 * Values live in global config (shared by all resumes) and are injected as mm
 * during rendering:
 *   mm = px * 25.4 / 96   (same convention as backend util.PxToMm)
 */

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

/** 全局布局（px 绝对数值）。 */
export interface GlobalLayout {
  pageMarginY: number // px，上下页边距
  pageMarginX: number // px，左右页边距
  spacingSection: number // px，模块间距
  spacingItem: number // px，条目间距
  spacingDetail: number // px，细节间距
}

/** 页边距可调范围（px）。 */
export const MARGIN_PX_MIN = 1
export const MARGIN_PX_MAX = 60
/** 内容间距可调范围（px）。 */
export const SPACING_PX_MIN = 1
export const SPACING_PX_MAX = 20

export const DEFAULT_GLOBAL_LAYOUT: GlobalLayout = {
  pageMarginY: 15,
  pageMarginX: 20,
  spacingSection: 12,
  spacingItem: 8,
  spacingDetail: 4,
}

// ---------------------------------------------------------------------------
// px → mm (96dpi, 与后端 util.PxToMm 同一口径)
// ---------------------------------------------------------------------------

const PX_TO_MM = 25.4 / 96

function pxToMm(px: number): number {
  return px * PX_TO_MM
}

/** 毫米值格式：保留两位小数并带单位。 */
function fmtMm(mm: number): string {
  return `${Math.round(mm * 100) / 100}mm`
}

// ---------------------------------------------------------------------------
// CSS injection
// ---------------------------------------------------------------------------

/** 布局注入的固定 style id（iframe 内），供增量更新。 */
export const LAYOUT_STYLE_ID = 'layout-inject'
/** 头像尺寸注入的固定 style id。 */
export const AVATAR_STYLE_ID = 'avatar-inject'

/**
 * Template item-level components (entries inside a module) that share the
 * `item` rhythm. Names follow templates/AGENTS.md; unknown selectors in a
 * given template simply don't match.
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
 * Intra-item detail elements (rows inside one entry) that share the `detail`
 * rhythm. All templates express these gaps with margin-bottom
 * (enforced by templates/AGENTS.md), so a single injected rule works everywhere.
 */
const DETAIL_SELECTORS =
  '.exp-header, .exp-location, .exp-summary, .highlights li, .edu-detail, .edu-courses'

/**
 * 构建布局 CSS 规则（不含 `<style>` 标签）。
 *
 * 页边距注入为 `--resume-padding[-y/-x]`（mm），模板 `.resume-page` 消费；
 * 内容间距分三层（模块/条目/细节）注入 mm 数值。规则用 `!important` 覆盖
 * 各模板自身的 item 间距（部分模板用更高优先级选择器如 `.resume-main .xxx`）。
 *
 * 供 injectLayoutCss 使用，也供 PreviewPanel 增量更新时直接写入 iframe 内 style。
 */
export function buildLayoutCss(layout: GlobalLayout): string {
  const mmY = pxToMm(layout.pageMarginY)
  const mmX = pxToMm(layout.pageMarginX)
  const mmSection = pxToMm(layout.spacingSection)
  const mmItem = pxToMm(layout.spacingItem)
  const mmDetail = pxToMm(layout.spacingDetail)

  const marginRule =
    `:root { --resume-padding: ${fmtMm(mmY)} ${fmtMm(mmX)}; ` +
    `--resume-padding-y: ${fmtMm(mmY)}; --resume-padding-x: ${fmtMm(mmX)}; }`

  const spacingRule =
    `\n.section-title { margin-bottom: ${fmtMm(mmItem)} !important; }\n` +
    `${ITEM_SELECTORS} { margin-bottom: ${fmtMm(mmItem)} !important; }\n` +
    `${DETAIL_SELECTORS}, .extra-row { margin-bottom: ${fmtMm(mmDetail)} !important; }\n` +
    `*:has(+ .section-title) { margin-bottom: 0 !important; }\n` +
    `* + .section-title { margin-top: ${fmtMm(mmSection)} !important; }\n`

  return marginRule + spacingRule
}

/** 构建头像尺寸 CSS 规则（不含 `<style>` 标签）。无头像尺寸时返回空字符串。 */
export function buildAvatarCss(personal?: { avatar_width?: number; avatar_height?: number }): string {
  const w = personal?.avatar_width
  const h = personal?.avatar_height
  if (!w || !h) return ''
  return `.r-avatar img { width: ${w}px !important; height: ${h}px !important; }`
}

/**
 * 注入布局 CSS（页边距 + 内容间距）为独立的 `<style id="layout-inject">`，
 * 插到 `</head>` 前（source order 在模板 `<style>` 之后）。
 */
export function injectLayoutCss(html: string, layout: GlobalLayout): string {
  return injectStyleTag(html, buildLayoutCss(layout), LAYOUT_STYLE_ID)
}

/**
 * 注入头像尺寸 CSS 到 `<style id="avatar-inject">`。任一维度缺失或非正数时不注入。
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