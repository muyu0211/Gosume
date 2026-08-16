/**
 * 实时预览的增量 diff 工具（方案 4：增量 DOM diff）。
 *
 * 核心难点与解法：
 * - morphdom 用「模块级全局 `document`」创建节点，不能跨 document 直接 diff
 *   iframe 内 DOM。因此把 morphdom 的 UMD 源码 eval 进 iframe 的
 *   contentWindow，让它在 iframe 上下文中加载（`document` = iframe 的 document），
 *   再用 `win.morphdom(from, to)` 在 iframe 内完成 diff。
 * - 新内容用 iframe document 的 `<template>` 解析，保证新旧节点同 document。
 * - 分页是破坏性重建，无法 diff；这里只负责「源容器（未分页内容）」的增量更新，
 *   分页仍由 paginationCore 从源容器重新派生（见 PreviewPanel / paginate.ts）。
 */

import morphdomSource from 'morphdom/dist/morphdom-umd.min.js?raw'
import { LAYOUT_STYLE_ID, AVATAR_STYLE_ID } from './layoutPresets'

/** iframe 内隐藏源容器（未分页内容，diff 对象）的 id。 */
export const SOURCE_ID = 'r-source'
/** iframe 内展示层（分页结果）的 id。 */
export const PAGES_ID = 'r-pages'

/** 从完整渲染 HTML 一次解析出的三部分（内容 / 布局规则 / 头像规则）。 */
export interface PreviewParts {
  /** `.resume-container` 的 innerHTML（内容片段，供 diff）。 */
  contentHtml: string
  /** 布局档位规则（`layout-inject` 的 textContent）。 */
  layoutRule: string
  /** 头像尺寸规则（`avatar-inject` 的 textContent）。 */
  avatarRule: string
}

/**
 * 从完整渲染 HTML 中解析出内容、布局规则、头像规则三部分。
 * 完整 HTML 仍走 previewHtml 供导出使用；这里一次性抽取增量更新所需的三样，
 * 避免对同一 HTML 做多次 DOMParser 解析。
 */
export function parsePreviewHtml(renderedHtml: string): PreviewParts {
  const doc = new DOMParser().parseFromString(renderedHtml, 'text/html')
  return {
    contentHtml: doc.querySelector('.resume-container')?.innerHTML ?? '',
    layoutRule: doc.getElementById(LAYOUT_STYLE_ID)?.textContent ?? '',
    avatarRule: doc.getElementById(AVATAR_STYLE_ID)?.textContent ?? '',
  }
}

/**
 * 更新 iframe 内固定 `<style id>` 的规则：规则非空则更新（不存在则创建），
 * 规则为空则移除该 style。用于布局档位 / 头像尺寸变化时只改 style、不重写文档。
 */
export function updateStyleById(doc: Document, id: string, rule: string): void {
  let el = doc.getElementById(id)
  if (rule) {
    if (!el) {
      el = doc.createElement('style')
      el.id = id
      doc.head?.appendChild(el)
    }
    el.textContent = rule
  } else if (el) {
    el.remove()
  }
}

/**
 * 把 morphdom 注入 iframe 的 contentWindow（幂等）。
 * 必须在 doc.write 之后调用一次；doc.write 只替换 contentDocument，
 * contentWindow 不变，故注入结果在后续 diff 中持续有效。
 */
export function injectMorphdom(iframe: HTMLIFrameElement): void {
  const win = iframe.contentWindow as (Window & { morphdom?: unknown }) | null
  if (win && !win.morphdom) {
    win.eval(morphdomSource)
  }
}

/**
 * 把新内容 diff 到 iframe 内的源容器（`#r-source .resume-container`）。
 * 只更新变化的文本节点，保留未变部分（字体/图片已加载无需重载）。
 */
export function morphSourceContent(iframe: HTMLIFrameElement, contentHtml: string): void {
  const doc = iframe.contentDocument
  const win = iframe.contentWindow as (Window & { morphdom?: (from: Node, to: Node, opts?: object) => void }) | null
  if (!doc || !win?.morphdom) return

  const sourceContainer = doc.querySelector(`#${SOURCE_ID} .resume-container`)
  if (!sourceContainer) return

  // 用 iframe 的 document 解析新内容，保证节点与源容器同 document。
  // 注意：不能直接传 DocumentFragment（template.content）给 morphdom——
  // morphdom 会把 fragment 折叠为 firstElementChild（只 diff 第一个子元素，
  // main 会被丢弃）。用 wrapper 元素包裹新内容，childrenOnly 只 diff 子节点。
  const wrapper = doc.createElement('div')
  wrapper.innerHTML = contentHtml

  win.morphdom(sourceContainer, wrapper, { childrenOnly: true })
}

/**
 * 首次全量写入后，把 iframe 的 body 改造成「隐藏源容器 + 展示层」结构：
 *
 *   <body>
 *     <div id="r-source">  ← 绝对定位移出视野，保留布局（分页测量需要真实尺寸）
 *       <div class="resume-page">…未分页完整内容…</div>
 *     </div>
 *     <div id="r-pages"></div>  ← 展示层，分页结果写入这里
 *   </body>
 *
 * 源容器必须保留布局（不能用 display:none），因为分页核心的 isDoubleColumn
 * 依赖 getComputedStyle / getBoundingClientRect 判断双栏。
 */
export function setupSourceShell(iframe: HTMLIFrameElement): void {
  const doc = iframe.contentDocument
  if (!doc) return
  const body = doc.body
  if (doc.getElementById(SOURCE_ID) && doc.getElementById(PAGES_ID)) return

  const page = doc.querySelector('.resume-page')
  const source = doc.createElement('div')
  source.id = SOURCE_ID
  source.style.cssText = 'position:absolute;left:-9999px;top:0'
  if (page) source.appendChild(page)

  const pages = doc.createElement('div')
  pages.id = PAGES_ID

  body.replaceChildren(source, pages)
}
