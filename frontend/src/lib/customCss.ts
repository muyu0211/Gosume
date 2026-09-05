/**
 * Per-resume custom CSS（resume.custom_css）—— 单一承载体。
 *
 * 所有针对当前简历的样式调整（页边距、内容间距、头像尺寸/圆角、信息区布局等）
 * 统一以「一段带哨兵分段的 CSS」形式存在；渲染 = 模板私有 CSS + 这段注入 CSS 叠加
 * （「一静一动、一默认一定制」）。数据模型不再为单个样式特性新增字段，后续扩展
 * （全局字体 family/字号/主题色等）只需往这里追加新段。
 *
 * 空 custom_css = 无样式定制 = 渲染模板原生外观（不注入任何覆盖）。
 *
 * 哨兵段格式契约与 Go 端 pkg/resume/model/custom_css.go 共用（数据迁移生成的
 * custom_css 必须能被本模块 parseCustomCss 反向解析）。
 */

import type { HeaderLayout } from './layoutPresets'
import { findFontOption } from './fontOptions'

// ── 哨兵段 ───────────────────────────────────────────────────────────────
const SENTINEL_VARS = '/*=gosume:vars*/'
const SENTINEL_SPACING = '/*=gosume:spacing*/'
const SENTINEL_AVATAR = '/*=gosume:avatar*/'
const SENTINEL_HEADER_LAYOUT = '/*=gosume:header-layout*/'
const SENTINEL_FONT = '/*=gosume:font*/'
const SENTINEL_FONT_SIZE = '/*=gosume:font-size*/'
const SENTINEL_END = '/*=gosume:end*/'

/** 内容间距选择器契约（镜像 templates/resume-global.css）。 */
const ITEM_SELECTORS =
  '.experience-item, .education-item, .award-item, .custom-item, .skill-category, .skill-item, .sidebar-item'
const DETAIL_SELECTORS =
  '.exp-header, .exp-location, .exp-summary, .highlights li, .edu-detail, .edu-courses, .extra-row'

/** 字号四级选择器组（24 套模板一致的选择器层级，镜像 templates/AGENTS.md）。 */
const FS_NAME_SELECTORS = '.r-name'
const FS_TITLE_SELECTORS =
  '.section-title, .r-subtitle, .exp-header .company, .edu-school, .award-title, .custom-item h4, .skill-category h4'
const FS_BODY_SELECTORS =
  'body, .r-ename, .r-jobtitle, .r-yoe, .r-contact-label, .r-contact-value, .r-langs, .exp-header .title, .exp-summary, .highlights li, .skill-item'
const FS_DETAIL_SELECTORS = '.date, .exp-location, .edu-detail, .edu-courses, .subtitle, .extra-row, .award-issuer'

/** 每段可独立解析/剥除所需的哨兵列表（vars/spacing/avatar/header-layout/font/font-size/end）。 */
const ALL_SENTINELS = [
  SENTINEL_VARS,
  SENTINEL_SPACING,
  SENTINEL_AVATAR,
  SENTINEL_HEADER_LAYOUT,
  SENTINEL_FONT,
  SENTINEL_FONT_SIZE,
  SENTINEL_END,
]

/**
 * per-resume 样式状态。undefined/null = 跟随模板原生（不注入对应规则）。
 * pageMarginY/X 语义上成对（同存同空，UI 保证）：`--resume-padding` 是单栏消费的
 * 简写，无法表达"一侧原生一侧自定义"，故页边距要么都自定义要么都原生。
 */
export interface ResumeStyleState {
  pageMarginY?: number
  pageMarginX?: number
  spacingSection?: number
  spacingItem?: number
  spacingDetail?: number
  avatarWidth?: number
  avatarHeight?: number
  /** 0~100（0=直角矩形，100=圆形 50%）。 */
  avatarRadius?: number | null
  /** center | avatar-left | avatar-right（仅单栏模板生效）。 */
  headerLayout?: HeaderLayout | null
  /** 全局字体（fontOptions.ts 的 key）；null/undefined = 跟随模板原生字体。 */
  fontKey?: string | null
  /** 字号（px，四级，各自独立）：姓名/标题/正文/细节；null/undefined = 跟随模板。 */
  fontSizeName?: number | null
  fontSizeTitle?: number | null
  fontSizeBody?: number | null
  fontSizeDetail?: number | null
}

/**
 * 滑动条 nil 占位默认值（沿用旧全局布局数值）。仅作 UI 显示起点/「另一侧」取值，
 * 不是渲染回退——渲染回退是模板原生外观。
 */
export const DISPLAY_DEFAULT_LAYOUT = {
  pageMarginY: 15,
  pageMarginX: 20,
  spacingSection: 12,
  spacingItem: 8,
  spacingDetail: 4,
} as const

// ── px ↔ mm（96dpi，与后端 util 同一口径） ───────────────────────────────
const PX_TO_MM = 25.4 / 96

function pxToMm(px: number): string {
  return `${Math.round(px * PX_TO_MM * 100) / 100}mm`
}

function mmToPx(mm: string): number | undefined {
  const m = mm.trim().match(/^([\d.]+)mm$/)
  if (!m) return undefined
  return Math.round(parseFloat(m[1]) / PX_TO_MM)
}

// ── 信息区布局覆盖（三种布局；镜像 Go 端 headerLayoutOverlay） ────────────
export function headerLayoutOverlayCss(hl: HeaderLayout | null): string {
  switch (hl) {
    case 'center':
      return [
        '.r-header{grid-template-columns:1fr!important;grid-template-areas:"avatar" "text" "contact" "langs"!important;text-align:center!important;}',
        '.r-avatar{grid-area:avatar!important;margin:0 0 8pt 0!important;justify-self:center!important;}',
        '.r-header-text{grid-area:text!important;text-align:center!important;}',
        '.r-contact{grid-area:contact!important;justify-self:center!important;}',
        '.r-langs{grid-area:langs!important;justify-self:center!important;}',
      ].join('\n')
    case 'avatar-left':
      return [
        '.r-header{grid-template-columns:auto 1fr!important;grid-template-areas:"avatar text" "avatar contact" "avatar langs"!important;align-items:center!important;text-align:left!important;justify-items:stretch!important;column-gap:12pt!important;}',
        '.r-avatar{grid-area:avatar!important;margin:0!important;justify-self:center!important;}',
        '.r-header-text{grid-area:text!important;text-align:left!important;}',
        '.r-contact{grid-area:contact!important;justify-content:flex-start!important;text-align:left!important;}',
        '.r-langs{grid-area:langs!important;justify-content:flex-start!important;text-align:left!important;}',
      ].join('\n')
    case 'avatar-right':
      return [
        '.r-header{grid-template-columns:1fr auto!important;grid-template-areas:"text avatar" "contact avatar" "langs avatar"!important;align-items:center!important;text-align:left!important;justify-items:stretch!important;column-gap:12pt!important;}',
        '.r-avatar{grid-area:avatar!important;margin:0!important;justify-self:center!important;}',
        '.r-header-text{grid-area:text!important;text-align:left!important;}',
        '.r-contact{grid-area:contact!important;justify-content:flex-start!important;text-align:left!important;}',
        '.r-langs{grid-area:langs!important;justify-content:flex-start!important;text-align:left!important;}',
      ].join('\n')
    default:
      return ''
  }
}

// ── 生成 ─────────────────────────────────────────────────────────────────
/**
 * 按哨兵段生成 custom_css。空状态（全部 nil）返回空串（= 模板原生外观）。
 * buildCustomCss ∘ parseCustomCss 对已知段是恒等变换，供 updateCustomCss 合并用。
 */
export function buildCustomCss(s: ResumeStyleState): string {
  const segs: string[] = []

  // vars（页边距，成对）
  if (s.pageMarginY != null && s.pageMarginX != null) {
    const y = pxToMm(s.pageMarginY)
    const x = pxToMm(s.pageMarginX)
    segs.push(
      `${SENTINEL_VARS}\n:root { --resume-padding-y: ${y}; --resume-padding-x: ${x}; --resume-padding: ${y} ${x}; }`,
    )
  }

  // spacing（模块/条目/细节，三段独立）
  const spacing: string[] = []
  if (s.spacingSection != null) {
    spacing.push(
      `*:has(+ .section-title) { margin-bottom: 0 !important; }\n* + .section-title { margin-top: ${pxToMm(s.spacingSection)} !important; }`,
    )
  }
  if (s.spacingItem != null) {
    const item = pxToMm(s.spacingItem)
    spacing.push(`.section-title { margin-bottom: ${item} !important; }\n${ITEM_SELECTORS} { margin-bottom: ${item} !important; }`)
  }
  if (s.spacingDetail != null) {
    spacing.push(`${DETAIL_SELECTORS}, .extra-row { margin-bottom: ${pxToMm(s.spacingDetail)} !important; }`)
  }
  if (spacing.length > 0) segs.push(`${SENTINEL_SPACING}\n${spacing.join('\n')}`)

  // avatar（尺寸/圆角，各属性独立）
  const avatar: string[] = []
  if (s.avatarWidth != null) avatar.push(`width: ${s.avatarWidth}px !important`)
  if (s.avatarHeight != null) avatar.push(`height: ${s.avatarHeight}px !important`)
  if (s.avatarRadius != null) avatar.push(`border-radius: ${s.avatarRadius / 2}% !important`)
  if (avatar.length > 0) segs.push(`${SENTINEL_AVATAR}\n.r-avatar img { ${avatar.join('; ')}; }`)

  // header-layout（仅单栏注入；key 用注释行编码，供 parse 回读）
  if (s.headerLayout) {
    segs.push(`${SENTINEL_HEADER_LAYOUT}\n/* value: ${s.headerLayout} */\n${headerLayoutOverlayCss(s.headerLayout)}`)
  }

  // font（全局字体）：覆盖模板的 --font-family/-heading/--mono 变量。
  // 模板统一经变量消费字体，改变量即改全简历字体（含各模板专用 heading/mono）。
  // key 用注释行编码，供 parse 回读。
  if (s.fontKey) {
    const opt = findFontOption(s.fontKey)
    if (opt) {
      segs.push(
        `${SENTINEL_FONT}\n/* value: ${s.fontKey} */\n:root { --font-family: ${opt.stack} !important; --font-family-heading: ${opt.stack} !important; --mono-font: ${opt.stack} !important; }`,
      )
    }
  }

  // font-size（四级字号，各自独立；px 覆盖模板对应选择器组的原生 pt 值）
  const fsRules: string[] = []
  if (s.fontSizeName != null) fsRules.push(`${FS_NAME_SELECTORS} { font-size: ${s.fontSizeName}px !important; }`)
  if (s.fontSizeTitle != null) fsRules.push(`${FS_TITLE_SELECTORS} { font-size: ${s.fontSizeTitle}px !important; }`)
  if (s.fontSizeBody != null) fsRules.push(`${FS_BODY_SELECTORS} { font-size: ${s.fontSizeBody}px !important; }`)
  if (s.fontSizeDetail != null) fsRules.push(`${FS_DETAIL_SELECTORS} { font-size: ${s.fontSizeDetail}px !important; }`)
  if (fsRules.length > 0) segs.push(`${SENTINEL_FONT_SIZE}\n${fsRules.join('\n')}`)

  return segs.length > 0 ? `${segs.join('\n')}\n${SENTINEL_END}` : ''
}

// ── 解析 ─────────────────────────────────────────────────────────────────
/**
 * 取出指定哨兵段的内容（不含哨兵本身，截到下一个哨兵或结尾）。
 * 各段可能含相同格式的 `/* value: ... *​/` 注释（header-layout / font），
 * 必须按段解析，避免全局匹配串段。
 */
function extractSegment(css: string, sentinel: string): string {
  const start = css.indexOf(sentinel)
  if (start === -1) return ''
  const rest = css.slice(start + sentinel.length)
  let end = rest.length
  for (const s of ALL_SENTINELS) {
    if (s === sentinel) continue
    const at = rest.indexOf(s)
    if (at !== -1 && at < end) end = at
  }
  return rest.slice(0, end)
}

/**
 * 反向解析 custom_css 为样式状态（供控件显示当前值）。无法识别的段忽略；
 * 返回的字段仅包含能成功解析出的值。
 */
export function parseCustomCss(css: string | undefined | null): ResumeStyleState {
  if (!css) return {}
  const s: ResumeStyleState = {}

  // vars：--resume-padding-y / --resume-padding-x
  const y = css.match(/--resume-padding-y:\s*([\d.]+mm)/)
  const x = css.match(/--resume-padding-x:\s*([\d.]+mm)/)
  if (y?.[1]) s.pageMarginY = mmToPx(y[1])
  if (x?.[1]) s.pageMarginX = mmToPx(x[1])

  // spacing：* + .section-title { margin-top: Xmm } → 模块；.section-title { margin-bottom: Xmm } → 条目；detail 选择器行 → 细节
  const section = css.match(/\* \+ \.section-title \{[^}]*margin-top:\s*([\d.]+mm)/)
  if (section?.[1]) s.spacingSection = mmToPx(section[1])
  const item = css.match(/\.section-title \{[^}]*margin-bottom:\s*([\d.]+mm)/)
  if (item?.[1]) s.spacingItem = mmToPx(item[1])
  const detail = css.match(new RegExp(`${escapeRegExp(DETAIL_SELECTORS)}, \\.extra-row \\{[^}]*margin-bottom:\\s*([\\d.]+mm)`))
  if (detail?.[1]) s.spacingDetail = mmToPx(detail[1])

  // avatar：.r-avatar img { width/height/border-radius }
  const av = css.match(/\.r-avatar img \{([^}]*)\}/)
  if (av?.[1]) {
    const w = av[1].match(/width:\s*(\d+)px/)
    const h = av[1].match(/height:\s*(\d+)px/)
    const r = av[1].match(/border-radius:\s*(\d+(?:\.\d+)?)%/)
    if (w?.[1]) s.avatarWidth = parseInt(w[1], 10)
    if (h?.[1]) s.avatarHeight = parseInt(h[1], 10)
    if (r?.[1]) s.avatarRadius = Math.round(parseFloat(r[1]) * 2)
  }

  // header-layout：段内 /* value: <key> */
  const hl = extractSegment(css, SENTINEL_HEADER_LAYOUT).match(/\/\* value:\s*(\S+?)\s*\*\//)
  if (hl?.[1]) s.headerLayout = hl[1] as HeaderLayout

  // font：段内 /* value: <key> */
  const font = extractSegment(css, SENTINEL_FONT).match(/\/\* value:\s*(\S+?)\s*\*\//)
  if (font?.[1]) s.fontKey = font[1]

  // font-size：段内按四级选择器组读 px（各规则用各自组首选择器定位）
  const fsSeg = extractSegment(css, SENTINEL_FONT_SIZE)
  const fsName = fsSeg.match(new RegExp(`${escapeRegExp(FS_NAME_SELECTORS)}\\s*\\{[^}]*font-size:\\s*(\\d+)px`))
  if (fsName?.[1]) s.fontSizeName = parseInt(fsName[1], 10)
  const fsTitle = fsSeg.match(new RegExp(`${escapeRegExp(FS_TITLE_SELECTORS.split(',')[0].trim())}[^}]*\\{[^}]*font-size:\\s*(\\d+)px`))
  if (fsTitle?.[1]) s.fontSizeTitle = parseInt(fsTitle[1], 10)
  const fsBody = fsSeg.match(new RegExp(`body[^}]*\\{[^}]*font-size:\\s*(\\d+)px`))
  if (fsBody?.[1]) s.fontSizeBody = parseInt(fsBody[1], 10)
  const fsDetail = fsSeg.match(new RegExp(`${escapeRegExp(FS_DETAIL_SELECTORS.split(',')[0].trim())}[^}]*\\{[^}]*font-size:\\s*(\\d+)px`))
  if (fsDetail?.[1]) s.fontSizeDetail = parseInt(fsDetail[1], 10)

  return s
}

// ── 剥除 ─────────────────────────────────────────────────────────────────
/**
 * 删除 custom_css 中的 header-layout 段（双栏模板护栏：侧栏固定头像位置，
 * 不允许信息区布局覆盖，避免破坏持久侧栏结构）。
 */
export function stripHeaderLayoutCss(css: string): string {
  const idx = css.indexOf(SENTINEL_HEADER_LAYOUT)
  if (idx === -1) return css
  const before = css.slice(0, idx)
  const rest = css.slice(idx)
  // 段落到下一个哨兵（含结束哨兵）为止
  let nextIdx = -1
  for (const sent of ALL_SENTINELS) {
    if (sent === SENTINEL_HEADER_LAYOUT) continue
    const at = rest.indexOf(sent, SENTINEL_HEADER_LAYOUT.length)
    if (at !== -1 && (nextIdx === -1 || at < nextIdx)) nextIdx = at
  }
  return nextIdx === -1 ? before.trimEnd() : before + rest.slice(nextIdx)
}

/** 返回当前简历的注入规则；空串表示无样式定制（渲染原生外观）。 */
export function resolveCustomCss(resume: { custom_css?: string }): string {
  return resume.custom_css ?? ''
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
