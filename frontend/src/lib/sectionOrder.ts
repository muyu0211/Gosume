import type { Resume } from '../types/resume'

// 板块级排序的顺序内核。
//
// 设计要点：
// 1. 顺序只影响**渲染**，不移动数据：存储的是「板块 key 的有序数组」，
//    渲染后用 DOM 重排落地（见 reorderSectionsHtml），数据数组本身不动。
// 2. 自定义模块**每个都独立占位**（key = `custom:<id>`），因此顺序表里
//    自定义模块与内置板块地位相同，可任意穿插。
//    custom 是数组、模板按数组顺序渲染 {{range .Custom}}，
//    所以「第 k 个渲染出来的 custom 标题」↔「customIds[k]」是稳定映射，
//    **不需要改统一 HTML**（改统一 HTML 会碰到分页核心的 DOM 契约）。
// 3. 顺序表缺省 / 含非法项（如已删除的自定义模块）时按默认顺序补齐，
//    旧数据零迁移。

/** 参与排序的内置板块，数组顺序 = 模板默认渲染顺序。 */
export const BUILTIN_SECTIONS = [
  'education',
  'internships',
  'jobs',
  'projects',
  'awards',
  'skills',
  'summary',
] as const

export type BuiltinSection = (typeof BUILTIN_SECTIONS)[number]

/** 自定义模块 key 前缀：`custom:<sectionId>`。 */
const CUSTOM_PREFIX = 'custom:'

export function customKey(id: string): string {
  return CUSTOM_PREFIX + id
}

/** 解析 key 里的自定义模块 id；非自定义模块返回 null。 */
export function customIdOf(key: string): string | null {
  return key.startsWith(CUSTOM_PREFIX) ? key.slice(CUSTOM_PREFIX.length) : null
}

/** 排序所需上下文：当前会渲染的自定义模块 id（按数组顺序）。 */
export interface OrderContext {
  customIds: string[]
}

export function orderContextOf(resume: Resume): OrderContext {
  // 与 template.html 的渲染口径一致：toGoShape 会丢掉 hidden 的条目，
  // 隐藏的自定义模块不会被 range 出来，因此这里也要排除。
  return { customIds: (resume.custom ?? []).filter((c) => !c.hidden).map((c) => c.id) }
}

/** 默认顺序：内置板块固定序 + 自定义模块按其数组顺序排在最后（与 template.html 一致）。 */
export function defaultOrder(ctx: OrderContext): string[] {
  return [...BUILTIN_SECTIONS, ...ctx.customIds.map(customKey)]
}

/** 归一化：去重、丢弃非法/已删除项、按默认顺序补齐缺失项。 */
export function normalizeOrder(order: string[] | null | undefined, ctx: OrderContext): string[] {
  const all = defaultOrder(ctx)
  const valid = new Set(all)
  const seen = new Set<string>()
  const out: string[] = []
  for (const key of order ?? []) {
    if (!valid.has(key) || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  for (const key of all) {
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

export interface PresentSection {
  key: string
  label: string
}

function hasVisible<T extends { hidden?: boolean }>(arr?: T[] | null): boolean {
  return !!arr && arr.some((x) => !x.hidden)
}

/**
 * 当前简历里**真正会渲染**的板块（空板块 / 全隐藏不参与排序，排了也无效果）。
 * 返回顺序为默认顺序；调用方（排序 UI）按有效顺序再排一次。
 * @param labelOf 内置板块的展示名（自定义模块用其自身标题，不走这里）
 */
export function presentSections(resume: Resume, labelOf: (kind: string) => string): PresentSection[] {
  const out: PresentSection[] = []
  const push = (kind: string) => out.push({ key: kind, label: labelOf(kind) })

  if (hasVisible(resume.education)) push('education')
  if (hasVisible(resume.internships)) push('internships')
  if (hasVisible(resume.jobs)) push('jobs')
  if (hasVisible(resume.projects)) push('projects')
  if (hasVisible(resume.awards)) push('awards')
  if (hasVisible(resume.skills)) push('skills')
  if (resume.personal_summary?.summary && !resume.personal_summary.hidden) push('summary')
  for (const c of resume.custom ?? []) {
    if (c.hidden) continue
    out.push({ key: customKey(c.id), label: c.title?.trim() || labelOf('custom') })
  }
  return out
}

/**
 * 按 order 重排已渲染 HTML 里 `.r-main` 的板块。
 *
 * 切块规则：`.section-title[data-section]` **开新块**，其后随的兄弟节点归入该块，
 * 直到下一个 .section-title。这样：
 *   - 教育/实习/… 的标题 + 若干条目 = 一块；
 *   - 个人总结的 `.summary[data-section]` 与它的标题同属一块（不会被拆开）；
 *   - 每个自定义模块的标题各开一块（data-section 都是 "custom"，靠出现次序区分实例）。
 *
 * order 为空或结果与现状一致时原样返回，不做序列化（零开销、零差异）。
 */
export function reorderSectionsHtml(html: string, order: string[] | null, ctx: OrderContext): string {
  if (!order || order.length === 0) return html

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const main = doc.querySelector('.r-main')
  if (!main) return html

  const blocks: { key: string; nodes: ChildNode[] }[] = []
  let customSeen = 0
  for (const node of Array.from(main.childNodes)) {
    const el = node as Element
    const isTitle =
      el?.nodeType === 1 &&
      typeof el.classList?.contains === 'function' &&
      el.classList.contains('section-title') &&
      !!el.getAttribute('data-section')

    if (isTitle) {
      const raw = el.getAttribute('data-section') as string
      let key = raw
      if (raw === 'custom') {
        // 优先用模板打上的稳定 id（data-section-id），保证**幂等**：
        // 对已重排过的 HTML 再次重排不会把自定义模块的身份搞错。
        // 老模板/旧数据没有该属性时，退回按出现次序映射（customIds[k]）。
        const marked = el.getAttribute('data-section-id')
        const id = marked && ctx.customIds.includes(marked) ? marked : ctx.customIds[customSeen]
        key = id ? customKey(id) : `custom@${customSeen}`
        customSeen += 1
      }
      blocks.push({ key, nodes: [node] })
    } else if (blocks.length > 0) {
      blocks[blocks.length - 1].nodes.push(node)
    } else {
      // 首个标题之前的节点（模板里不存在）：单独成块并永远留在最前
      blocks.push({ key: '', nodes: [node] })
    }
  }

  const rank = new Map(order.map((k, i) => [k, i]))
  const indexed = blocks.map((b, i) => ({
    b,
    i,
    r: b.key === '' ? -1 : (rank.get(b.key) ?? Number.MAX_SAFE_INTEGER),
  }))
  const sorted = [...indexed].sort((x, y) => (x.r === y.r ? x.i - y.i : x.r - y.r))
  if (sorted.every((s, i) => s.i === i)) return html

  for (const s of sorted) {
    for (const n of s.b.nodes) main.appendChild(n)
  }
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML
}
