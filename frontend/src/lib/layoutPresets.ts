/**
 * 渲染注入层：把 per-resume custom_css 注入到渲染 HTML。
 *
 * 样式定制的生成/解析/剥除见 ./customCss.ts（resume.custom_css 单一承载体）；
 * 本文件保留模板 CSS 检测（单/双栏、信息区原生布局）、注入工具与常量。
 * 空 custom_css → 不注入 → 模板原生外观。
 */

import { resolveCustomCss, stripHeaderLayoutCss } from './customCss'

/** 信息区（头部）布局三态。 */
export type HeaderLayout = 'center' | 'avatar-left' | 'avatar-right'
/** 信息区布局全部取值（不含 nil 跟随模板）。 */
export const HEADER_LAYOUT_VALUES: HeaderLayout[] = ['center', 'avatar-left', 'avatar-right']

/** 页边距可调范围（px） */
export const MARGIN_PX_MIN = 0
export const MARGIN_PX_MAX = 80

/** 内容间距可调范围（px） */
export const SPACING_PX_MIN = 0
export const SPACING_PX_MAX = 40

export const DETIAL_SPACING_PX_MIN = 0
export const DETIAL_SPACING_PX_MAX = 15

/** 头像圆角程度可调范围（0=直角矩形，100=圆形）。 */
export const AVATAR_RADIUS_MIN = 0
export const AVATAR_RADIUS_MAX = 100

/**
 * 动态注入的固定 style id（iframe 内），供增量更新。
 * 与静态文件 templates/resume-global.css 区分：本 id 注入的是 per-resume
 * 的 custom_css（运行时增删），命名取 "custom" 而非 "global"。
 */
export const RESUME_CUSTOM_STYLE_ID = 'resume-custom'

/**
 * 判断一段模板 CSS 是否为双栏布局。
 * 双栏模板 `.resume-container` 必含 `display:grid` + `grid-template-columns`；
 * 单栏为 `max-width:100%`。用于在注入信息区布局覆盖前决定是否允许覆盖（跨模板
 * 全局泄漏防护：双栏模板上必须剥除 header-layout 段，避免破坏侧栏结构）。
 */
export function isDoubleColumnCss(css: string): boolean {
  const blocks = css.match(/\.resume-container\s*\{[^}]*\}/g)
  if (!blocks) return false
  return blocks.some((b) => /display\s*:\s*grid/i.test(b) && /grid-template-columns\s*:/i.test(b))
}

/**
 * 推断单栏模板「信息区原生布局」对应的三态。
 * 依据 `.r-header` 的 `grid-template-areas`（真正的排布定义）判断头像方向：
 *   每行单 token（单列）= 居中；头像在每行最右 = 头像居右；头像在每行最左 = 头像居左。
 * 取首个含 grid-template-areas 的 `.r-header` 主块，避免被媒体查询回退块干扰。
 * 无法判定时兜底居中。仅对单栏模板有意义（双栏由调用方先排除）。
 */
export function detectHeaderLayoutCss(css: string): HeaderLayout {
  const blocks = css.match(/\.r-header\s*\{[^}]*\}/g) ?? []
  for (const b of blocks) {
    if (!/grid-template-areas/i.test(b)) continue
    const rows = Array.from(b.matchAll(/"([^"]*)"/g), (m) => m[1])
    if (rows.length === 0) continue
    const tokenRows = rows.map((r) => r.trim().split(/\s+/).filter(Boolean))
    if (tokenRows.every((tr) => tr.length <= 1)) return 'center'
    const avRows = tokenRows.filter((tr) => tr.includes('avatar'))
    if (avRows.length === 0) return 'center'
    if (avRows.every((tr) => tr.indexOf('avatar') === 0)) return 'avatar-left'
    if (avRows.every((tr) => tr[tr.length - 1] === 'avatar')) return 'avatar-right'
    return 'center'
  }
  return 'center'
}

/** 从渲染 html 中提取模板的私有 CSS（内联在首个 `<style>` 中）。 */
function extractTemplateCss(html: string): string {
  return html.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? ''
}

/**
 * 注入 per-resume custom_css 为独立的 `<style id="resume-custom">`，
 * 插到 `</head>` 前（source order 在静态全局样式与模板 css 之后）。
 *
 * - custom_css 为空 → 不注入，模板原生外观。
 * - 双栏模板 → 剥除 header-layout 段（避免破坏持久侧栏）。
 */
export function injectGlobalVarsCss(
  html: string,
  resume: { custom_css?: string },
): string {
  let rule = resolveCustomCss(resume)
  if (!rule) return html
  if (isDoubleColumnCss(extractTemplateCss(html))) {
    rule = stripHeaderLayoutCss(rule)
    if (!rule) return html
  }
  return injectStyleTag(html, rule, RESUME_CUSTOM_STYLE_ID)
}

/** 把规则包成 `<style id>` 标签插到 `</head>` 前（source order 在模板 style 之后）。 */
function injectStyleTag(html: string, rule: string, id: string): string {
  const headCloseIdx = html.indexOf('</head>')
  if (headCloseIdx !== -1) {
    return html.slice(0, headCloseIdx) + `<style id="${id}">${rule}</style>` + html.slice(headCloseIdx)
  }
  return `<style id="${id}">${rule}</style>` + html
}
