/**
 * M2 行级拆分子系统：文本块（段落 / 单条 bullet）按行断页。
 *
 * 与 `paginationCore.ts` 的依赖关系：
 *   - 本模块从 paginationCore 导入共享常量（MAX_SPLIT_DEPTH / OVERFLOW_TOLERANCE）
 *     与类型（PageCtx / Cursor，type-only，编译期擦除）；
 *   - paginationCore 从本模块导入 splitLinesInPlace（行级拆分实现）；
 *   - 行级可拆判定（canSplitLines）归 paginationCore 的通用结构规则，两模块共用。
 *
 * 行为契约：
 *   - 仅对「叶子文本块」（无块级子元素）生效（判定见 paginationCore.canSplitLines）；
 *   - 用页底实测行数 + R4（孤儿 ≥1 行）确定留页行数；
 *   - 字符级二分找断点 k，`Range.cloneContents()` 真实切分头部/续接文本
 *     （保留行内结构，`<br>` 归头部，避免续页首行空行）——保留 PDF 文本层；
 *   - 续接块在顶层（无父条目壳承载续接标记）时打 data-cont-of，避免预览
 *     FLIP 以 data-id 为 key 时两页克隆冲突。
 */

import { MAX_SPLIT_DEPTH, OVERFLOW_TOLERANCE } from './paginationCore'
import type { PageCtx, Cursor } from './paginationCore'

/** R4 孤儿/寡行：页底最少保留的行数。简历场景取 1——只要页底能放 ≥1 行、
 *  页顶能续 ≥1 行即按行拆分，避免「模块标题 + 名称行 + 简述行」整段粘滞到下一页
 *  （≥2 行的排版门槛会造成页 1 欠填充，这是用户实测反馈的粘滞根因）。 */
const ORPHAN_LINES = 1

interface LineBox {
  top: number
  bottom: number
}

/** 遍历 `el` 内的所有文本节点（文档序）。 */
function forEachTextNode(el: HTMLElement, cb: (node: Text) => void): void {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let node: Node | null = walker.nextNode()
  while (node) {
    cb(node as Text)
    node = walker.nextNode()
  }
}

/** 收集 `el` 内文本节点渲染出的行盒（按视觉行分组，行内 inline 元素归并）。 */
function collectLineBoxes(el: HTMLElement): LineBox[] {
  const boxes: LineBox[] = []
  const doc = el.ownerDocument
  forEachTextNode(el, (node) => {
    const range = doc.createRange()
    range.selectNodeContents(node)
    for (const r of Array.from(range.getClientRects())) {
      if (r.height < 0.5) continue
      const last = boxes[boxes.length - 1]
      if (last && Math.abs(r.top - last.top) < 2 && Math.abs(r.bottom - last.bottom) < 2) {
        last.bottom = Math.max(last.bottom, r.bottom)
      } else {
        boxes.push({ top: r.top, bottom: r.bottom })
      }
    }
  })
  return boxes
}

/** 统计 `el` 的行数与「底部不超过 pageBottom 的行数」（页面坐标一致）。 */
function measureLines(el: HTMLElement, pageBottom: number): { total: number; fit: number } {
  const boxes = collectLineBoxes(el)
  let fit = 0
  for (const b of boxes) {
    if (b.bottom <= pageBottom - OVERFLOW_TOLERANCE) fit++
  }
  return { total: boxes.length, fit }
}

/** 把 `el` 内的绝对字符偏移映射为 (节点, 节点内偏移)。 */
function offsetToPoint(el: HTMLElement, offset: number): { node: Node; offset: number } {
  let remaining = offset
  let hit: { node: Node; offset: number } | null = null
  forEachTextNode(el, (node) => {
    if (hit) return
    const len = node.data.length
    if (remaining <= len) hit = { node, offset: remaining }
    remaining -= len
  })
  if (hit) return hit
  const last = el.lastChild
  if (last) return { node: last, offset: (last as Text).data?.length ?? 0 }
  return { node: el, offset: 0 }
}

/**
 * 克隆 `el` 中 [start, end) 字符区间的文本为独立元素（保留行内结构）：
 * 用 Range.cloneContents() 切分文本节点并保留 inline 标签（strong/a/br 等）。
 * 紧随边界的 `<br>` 归入头部，避免续接部分首行出现空行。
 */
function cloneTextRange(el: HTMLElement, start: number, end: number): HTMLElement {
  const s = offsetToPoint(el, start)
  const e = offsetToPoint(el, end)
  const range = el.ownerDocument.createRange()
  range.setStart(s.node, s.offset)
  if (e.node.nodeType === Node.TEXT_NODE && e.offset === (e.node as Text).data.length) {
    const next = e.node.nextSibling
    if (next && next.nodeType === Node.ELEMENT_NODE && (next as Element).tagName === 'BR') {
      range.setEndAfter(next)
    } else {
      range.setEnd(e.node, e.offset)
    }
  } else {
    range.setEnd(e.node, e.offset)
  }
  const clone = el.cloneNode(false) as HTMLElement
  clone.appendChild(range.cloneContents())
  return clone
}

/** 探测「头部克隆含 [0, end) 文本」时的行数（临时挂到 `parent` 测量后移除）。 */
function countLinesOfRange(orig: HTMLElement, parent: HTMLElement, end: number): number {
  const probe = cloneTextRange(orig, 0, end)
  parent.appendChild(probe)
  void probe.offsetHeight
  const n = collectLineBoxes(probe).length
  parent.removeChild(probe)
  return n
}

/**
 * M2 行级拆分：把 `block`（文本块）按行断成「头部（留当前页）+ 续接（下一页）」。
 * - 用页底实测行数 + R4 孤儿/寡行确定留在当前页的行数 fit；
 * - 字符级二分找「行数恰为 fit 的最大字符偏移 k」（即第 fit+1 行起始）；
 * - Range 克隆头部/续接文本，续接块打 data-cont-of 标记（顶层块时，避免 FLIP key 冲突）。
 * 返回续接部分克隆；null 表示放弃拆分（整块下移，由调用方按原子块处理）。
 */
export function splitLinesInPlace(
  ctx: PageCtx,
  cursor: Cursor,
  block: HTMLElement,
  headParent: HTMLElement,
  depth: number,
): HTMLElement | null {
  const text = block.textContent ?? ''
  if (!text.trim()) return null
  if (depth >= MAX_SPLIT_DEPTH) return null

  const full = block.cloneNode(true) as HTMLElement
  headParent.appendChild(full)
  void cursor.page.offsetHeight

  // 放弃拆分：移除测量用克隆并返回 null（调用方按原子块处理）
  const abort = (): null => {
    headParent.removeChild(full)
    return null
  }

  // 度量一致性前提：measureLines 用「行底 ≤ pageBottom（页 offsetHeight 的视口坐标）」
  // 判定可容行数，而二分 countLinesOfRange 只数行数——两者一致依赖 makePage 已通过
  // 内联样式施加固定页高 + box-sizing: border-box + overflow: hidden（改页高/内边距的
  // 施加时机时需同步校验这两处）。头部克隆是同一文本在等宽下的前缀，行位与整块一致。
  const pageRect = cursor.page.getBoundingClientRect()
  const pageBottom = pageRect.top + cursor.page.offsetHeight
  const { total, fit: fit0 } = measureLines(full, pageBottom)

  // R4 孤儿/寡行：页底能放 ≥1 行即可拆分（页顶天然续 ≥1 行），
  // 避免排版门槛（≥2 行）造成「标题 + 名称行 + 简述行」整段粘滞到下一页
  if (fit0 < ORPHAN_LINES) return abort()
  const fit = fit0
  if (fit <= 0 || fit >= total) return abort()

  // 字符级二分：最大的 k 使「头部 [0, k)」行数 ≤ fit
  const totalLen = text.length
  let lo = 1
  let hi = totalLen
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (countLinesOfRange(full, headParent, mid) <= fit) lo = mid
    else hi = mid - 1
  }
  const k = lo
  if (k <= 0 || k >= totalLen) return abort()

  const headClone = cloneTextRange(full, 0, k)
  const tailClone = cloneTextRange(full, k, totalLen)
  headParent.replaceChild(headClone, full)

  // 顶层文本块（无父条目壳承载续接标记）→ 续接块打 data-cont-of，避免 FLIP key 冲突
  if (!headParent.hasAttribute('data-id') && !headParent.hasAttribute('data-cont-of')) {
    const anchor = block.getAttribute('data-id') ?? block.getAttribute('data-section')
    if (anchor) {
      tailClone.removeAttribute('data-id')
      tailClone.setAttribute('data-cont-of', anchor)
    }
  }
  return tailClone
}
