import { useRef, useEffect, useState } from 'react'
import { useResumeStore } from '../../stores/resumeStore'
import { useEditorStore } from '../../stores/editorStore'
import { useTemplateStore } from '../../stores/templateStore'
import { paginateContent } from '../../lib/paginate'
import { DEFAULT_PAPER, type PaperSpec } from '../../lib/paper'
import { waitForDocumentReady } from '../../lib/paginationCore'
import {
  injectMorphdom,
  morphSourceContent,
  parsePreviewHtml,
  setupSourceShell,
  updateStyleById,
  SOURCE_ID,
  PAGES_ID,
} from '../../lib/morphPreview'
import { RESUME_CUSTOM_STYLE_ID } from '../../lib/layoutPresets'
import { sectionTitleId } from '../../lib/resumeSections'
import { parseCustomCss } from '../../lib/customCss'

/** 预览交互高亮样式 id（模板切换重写 doc 后重建）。 */
const INTERACT_STYLE_ID = 'preview-section-interact-style'

// ── 统一布局 FLIP（组件位置变化动画）───────────────────────────────────────
/**
 * 参与位置动画的块（页内选择器）：头部子块（个人信息区四组件）+ 正文块
 * （带 data-id 的条目、带 data-section 的模块标题/总结、带 data-cont-of 的
 * 条目续接部分克隆——M1 组件级分页把拆分的条目续接部分打上该标记）。
 * 任何会导致这些块位置/大小变化的更新（增删/显隐、字体字号、头部布局切换、
 * 内容长短变化）都走同一套动画——动画跟着组件走，而非按场景定制。
 */
const LAYOUT_IN_PAGE_SELECTOR = [
  '.r-header .r-avatar',
  '.r-header .r-header-text',
  '.r-header .r-contact',
  '.r-header .r-langs',
  '[data-id]',
  '[data-cont-of]',
  '.section-title[data-section]',
  '.summary[data-section]',
].join(', ')

/**
 * 块的稳定 key，用于跨分页重建（cloneNode）匹配新旧元素：
 * - 头部子块：按页索引 + 组件类（双栏侧栏每页各一份，页索引消歧）
 * - 条目：data-id（全局唯一，跨页移动仍能匹配）
 * - 条目续接部分：data-cont-of + 页索引（同一条目每页至多一个续接部分，页索引消歧）
 * - 标题/总结：data-section + 同段出现序号
 */
function layoutBlockKey(el: Element, pageIdx: number, seen: Map<string, number>): string {
  if (el.classList.contains('r-avatar')) return `header:${pageIdx}:avatar`
  if (el.classList.contains('r-header-text')) return `header:${pageIdx}:text`
  if (el.classList.contains('r-contact')) return `header:${pageIdx}:contact`
  if (el.classList.contains('r-langs')) return `header:${pageIdx}:langs`
  const cont = el.getAttribute('data-cont-of')
  if (cont) return `cont:${cont}:${pageIdx}`
  const id = el.getAttribute('data-id')
  if (id) return `id:${id}`
  const sec = el.getAttribute('data-section') ?? ''
  const n = seen.get(sec) ?? 0
  seen.set(sec, n + 1)
  return `sec:${sec}:${n}`
}

/** 收集展示层各块的结构签名与位置（更新前调用，记录旧布局）。 */
function collectLayoutState(doc: Document): { keys: string[]; rects: Map<string, { left: number; top: number }> } {
  const keys: string[] = []
  const rects = new Map<string, { left: number; top: number }>()
  const seen = new Map<string, number>()
  doc.querySelectorAll(`#${PAGES_ID} .resume-page`).forEach((page, pageIdx) => {
    for (const el of Array.from(page.querySelectorAll(LAYOUT_IN_PAGE_SELECTOR))) {
      const key = layoutBlockKey(el, pageIdx, seen)
      keys.push(key)
      const r = el.getBoundingClientRect()
      rects.set(key, { left: r.left, top: r.top })
    }
  })
  return { keys, rects }
}

/**
 * FLIP 播放：更新（分页重建）后各块已位于新位置，先把幸存块平移到旧位置（无过渡）、
 * 新增块透明度置 0，强制回流后开过渡——幸存块滑回新位置、新增块淡入。
 * transform/opacity 不占布局流，动画期间不影响分页与导出测量；返回清理函数。
 */
function playLayoutFlip(
  doc: Document,
  oldRects: Map<string, { left: number; top: number }>,
  oldKeySet: Set<string>,
): () => void {
  const targets: { el: HTMLElement; dx: number; dy: number }[] = []
  const appeared: HTMLElement[] = []
  const seen = new Map<string, number>()
  doc.querySelectorAll(`#${PAGES_ID} .resume-page`).forEach((page, pageIdx) => {
    for (const el of Array.from(page.querySelectorAll(LAYOUT_IN_PAGE_SELECTOR))) {
      const key = layoutBlockKey(el, pageIdx, seen)
      const h = el as HTMLElement
      if (oldKeySet.has(key)) {
        const old = oldRects.get(key)
        if (old) {
          const r = el.getBoundingClientRect()
          const dx = old.left - r.left
          const dy = old.top - r.top
          if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) targets.push({ el: h, dx, dy })
        }
      } else {
        appeared.push(h)
      }
    }
  })
  if (targets.length === 0 && appeared.length === 0) return () => {}

  targets.forEach(({ el, dx, dy }) => {
    el.style.transition = 'none'
    el.style.transform = `translate(${dx}px, ${dy}px)`
  })
  appeared.forEach((el) => {
    el.style.transition = 'none'
    el.style.opacity = '0'
  })
  // 强制回流后开过渡：幸存块滑回新位置，新增块淡入
  void doc.body.offsetHeight
  targets.forEach(({ el }) => {
    el.style.transition = 'transform 300ms cubic-bezier(0.22, 0.61, 0.36, 1)'
    el.style.transform = 'translate(0, 0)'
  })
  appeared.forEach((el) => {
    el.style.transition = 'opacity 300ms ease'
    el.style.opacity = '1'
  })
  const cleanup = () => {
    targets.forEach(({ el }) => {
      el.style.transition = ''
      el.style.transform = ''
    })
    appeared.forEach((el) => {
      el.style.transition = ''
      el.style.opacity = ''
    })
  }
  window.setTimeout(cleanup, 340)
  return cleanup
}

/** 高亮包围盒外扩（px），避免框贴住内容。 */
const OVERLAY_PAD = 3
/** 高亮渐入/渐出动画时长（ms），与注入 CSS 的 animation 时长保持一致。 */
const OVERLAY_FADE_MS = 300

/** 确保预览 iframe 内存在"模块区域可点击"交互样式。 */
function ensureInteractStyle(doc: Document): void {
  if (doc.getElementById(INTERACT_STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = INTERACT_STYLE_ID
  style.textContent = `
    /* 有 data-section 标识的模块区域：提示可点击 */
    [data-section] { cursor: pointer; }
    /* 让分页后的 .resume-page 作为 overlay 的定位参考 */
    .resume-page { position: relative; }
    /* 模块整区高亮：单个灰框（外扩阴影描边）包裹标题 + 全部条目（每页各生成一个），渐入渐出 */
    @keyframes preview-overlay-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes preview-overlay-out {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    .preview-section-overlay {
      position: absolute;
      pointer-events: none;
      box-shadow: 0 0 5px 3px #9ca3af;
      background: rgba(156, 163, 175, 0.12);
      border-radius: 8px;
      z-index: 10;
      opacity: 0;
      animation: preview-overlay-in ${OVERLAY_FADE_MS}ms ease forwards;
    }
    .preview-section-overlay.preview-overlay-out {
      animation: preview-overlay-out ${OVERLAY_FADE_MS}ms ease forwards;
    }
  `
  doc.head.appendChild(style)
}

/** 让 overlay 淡出后移除；跨板块切换 / 移出预览时用于实现渐出。 */
function fadeOutOverlay(el: HTMLElement): void {
  el.classList.add('preview-overlay-out')
  setTimeout(() => el.remove(), OVERLAY_FADE_MS)
}

/** 一个逻辑板块（标题 + 全部条目，可跨页）。 */
interface SectionGroup {
  id: string
  els: Element[]
}

/**
 * 构建全局板块索引：遍历展示层各页 `.r-main` 的子元素，遇到 `.section-title`
 * 开始新板块；其余元素（含跨页续接的条目）归入当前板块。据此可实现
 * "同一模块被分页后各部分一起高亮"。
 */
function buildSectionIndex(doc: Document): SectionGroup[] {
  const groups: SectionGroup[] = []
  const pages = doc.querySelectorAll(`#${PAGES_ID} .resume-page`)
  pages.forEach((page) => {
    const main = page.querySelector('.r-main')
    if (!main) return
    for (const child of Array.from(main.children)) {
      if (child.classList.contains('section-title')) {
        groups.push({ id: sectionTitleId(child), els: [child] })
      } else if (groups.length > 0) {
        groups[groups.length - 1].els.push(child)
      }
    }
  })
  return groups
}

/**
 * 定位目标所属的逻辑板块：
 * - 语言块 .r-langs 位于 .r-header 内，优先命中 → languages；
 * - 其余 header 区域 → personal（用类名识别，不依赖 data-section，兼容旧嵌入式模板）；
 * - r-main 内上溯到直接子级，在全局索引中按元素归属查找（跨页续接条目亦命中）。
 */
function findSectionGroup(target: Element, index: SectionGroup[]): SectionGroup | null {
  const langs = target.closest<HTMLElement>('.r-langs')
  if (langs) return { id: 'languages', els: [langs] }
  const header = target.closest<HTMLElement>('.r-header')
  if (header) return { id: 'personal', els: [header] }
  const main = target.closest('.r-main')
  if (!main) return null
  let el: Element = target
  while (el.parentElement && el.parentElement !== main) el = el.parentElement
  return index.find((g) => g.els.includes(el)) ?? null
}

/**
 * 为板块生成高亮：按页分组，每页计算标题+条目的包围盒，生成一个灰框阴影 overlay。
 * 跨页板块在各页各出一个框，实现"同一模块内容一起高亮"。返回新的 overlay 列表。
 * 旧 overlay 淡出后移除，实现跨板块切换时的渐出。
 */
function renderOverlays(doc: Document, els: Element[], prev: HTMLElement[]): HTMLElement[] {
  prev.forEach(fadeOutOverlay)
  const overlays: HTMLElement[] = []
  const byPage = new Map<Element, Element[]>()
  for (const el of els) {
    const page = el.closest('.resume-page')
    if (!page) continue
    const arr = byPage.get(page) ?? []
    arr.push(el)
    byPage.set(page, arr)
  }
  for (const [page, pageEls] of byPage) {
    const pageRect = page.getBoundingClientRect()
    let top = Infinity
    let left = Infinity
    let bottom = -Infinity
    let right = -Infinity
    for (const el of pageEls) {
      const r = el.getBoundingClientRect()
      if (r.top < top) top = r.top
      if (r.left < left) left = r.left
      if (r.bottom > bottom) bottom = r.bottom
      if (r.right > right) right = r.right
    }
    if (!isFinite(top)) continue
    const overlay = doc.createElement('div')
    overlay.className = 'preview-section-overlay'
    overlay.style.top = `${top - pageRect.top - OVERLAY_PAD}px`
    overlay.style.left = `${left - pageRect.left - OVERLAY_PAD}px`
    overlay.style.width = `${right - left + OVERLAY_PAD * 2}px`
    overlay.style.height = `${bottom - top + OVERLAY_PAD * 2}px`
    page.appendChild(overlay)
    overlays.push(overlay)
  }
  return overlays
}

export function PreviewPanel() {
  const previewHtml = useResumeStore((s) => s.previewHtml)
  const zoom = useEditorStore((s) => s.zoom)
  const setZoom = useEditorStore((s) => s.setZoom)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  /** 缩放纸张容器：切模板后重播淡入动画的宿主。 */
  const paperDivRef = useRef<HTMLDivElement>(null)
  const wheelCleanupRef = useRef<(() => void) | null>(null)
  /** 分页后的全局板块索引（跨页续接合并），hover/click 共用。 */
  const sectionIndexRef = useRef<SectionGroup[]>([])
  /** 当前 hover 生成的板块高亮 overlay 列表。 */
  const overlaysRef = useRef<HTMLElement[]>([])
  /** 最近一次 hover 命中的板块；鼠标停在模块间距空白区时回退使用，避免闪烁/点击失效。 */
  const currentSectionRef = useRef<SectionGroup | null>(null)
  // 三个独立签名，区分「切模板（全量重写）」「样式定制变化（只改 style）」
  // 「纯内容编辑（diff）」三种更新路径。样式定制（页边距/间距/头像/布局）由
  // resume.custom_css 唯一承载，故只用一个 style key。
  const lastTemplateIdRef = useRef<string | null>(null)
  const lastStyleKeyRef = useRef<string | null>(null)
  /** 上一次布局 FLIP 的清理函数（新动画/卸载时先清除，避免残留 transform/opacity）。 */
  const layoutCleanupRef = useRef<(() => void) | null>(null)
  const [pageCount, setPageCount] = useState(1)
  const [paper, setPaper] = useState<PaperSpec>(DEFAULT_PAPER)
  const [containerHeight, setContainerHeight] = useState(DEFAULT_PAPER.pxH)

  // Load preview HTML into iframe (full on head change, diff on content edit), paginate, and inject Ctrl+wheel listener
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || !previewHtml) return

    // Clean up previous wheel listener from old iframe document
    if (wheelCleanupRef.current) {
      wheelCleanupRef.current()
      wheelCleanupRef.current = null
    }

    const doc = iframe.contentDocument
    if (!doc) return

    // 三种更新路径：切模板（全量重写）、样式定制变化（只改 style）、
    // 纯内容编辑（diff）。head/CSS 只在切模板时重写，样式走 style 增量更新。
    const resume = useResumeStore.getState().resume
    const templateId = useTemplateStore.getState().activeTemplateId
    const styleKey = String(resume?.custom_css ?? '')

    const isTemplateChange = lastTemplateIdRef.current !== templateId
    const isStyleChange = lastStyleKeyRef.current !== styleKey

    // 离散样式变化（头部布局切换 / 字体字号）会引发组件位置移动 → 触发统一布局 FLIP。
    // 与滑杆类连续调整（页边距/间距/头像）区分：连续拖动逐帧刷新，动画会追赶不上。
    let discreteStyleChanged = false

    // 统一布局 FLIP：在改动展示层前记录各块 key 与位置（分页重建后位置移动的块据此
    // 做位移动画）。先清掉上一次动画的内联样式，保证记录的是干净布局位置。
    if (layoutCleanupRef.current) {
      layoutCleanupRef.current()
      layoutCleanupRef.current = null
    }
    const oldLayout = collectLayoutState(doc)

    if (isTemplateChange) {
      // 全量：重写 iframe 文档（含 head/CSS），改造成「源容器 + 展示层」，注入 morphdom
      doc.open()
      doc.write(previewHtml)
      doc.close()
      setupSourceShell(iframe)
      injectMorphdom(iframe)
      lastTemplateIdRef.current = templateId
      lastStyleKeyRef.current = styleKey
    } else {
      // 增量：内容始终 diff（未变时 morphdom 为 no-op）；样式定制（页边距/间距/
      // 头像/布局）变化时只更新 custom_css 的 <style id="resume-custom">
      // （静态规则 <style id="resume-base"> 属于模板内容，全量时带出），
      // 不重写 head/CSS，避免调样式时的白屏跳变。
      const parts = parsePreviewHtml(previewHtml)
      morphSourceContent(iframe, parts.contentHtml)
      if (isStyleChange) {
        // 需在 style 更新前读取旧样式（旧 key 在 lastStyleKeyRef 中）。
        // 离散样式（头部布局/字体/字号）变化 → 统一布局 FLIP 的触发条件之一；
        // 滑杆类连续字段（页边距/间距/头像尺寸圆角）不触发。
        const prevStyle = parseCustomCss(lastStyleKeyRef.current ?? '')
        const nextStyle = parseCustomCss(styleKey)
        discreteStyleChanged =
          (prevStyle.headerLayout ?? null) !== (nextStyle.headerLayout ?? null) ||
          prevStyle.fontKey !== nextStyle.fontKey ||
          prevStyle.fontSizeName !== nextStyle.fontSizeName ||
          prevStyle.fontSizeTitle !== nextStyle.fontSizeTitle ||
          prevStyle.fontSizeBody !== nextStyle.fontSizeBody ||
          prevStyle.fontSizeDetail !== nextStyle.fontSizeDetail
        updateStyleById(doc, RESUME_CUSTOM_STYLE_ID, parts.customCssRule)
        lastStyleKeyRef.current = styleKey
      }
    }

    // ── 预览模块点击跳转：注入高亮样式 + 绑定 hover/click 委托（同源 iframe，
    //    父页面直接监听 contentDocument；委托在 doc 上，morphdiff 重建内容后仍生效）──
    ensureInteractStyle(doc)
    const clearOverlays = () => {
      overlaysRef.current.forEach(fadeOutOverlay)
      overlaysRef.current = []
    }
    const isElement = (n: unknown): n is Element =>
      !!n && typeof n === 'object' && (n as Node).nodeType === 1
    const onMouseOver = (e: MouseEvent) => {
      const target = e.target as Node | null
      // 注意：target 来自 iframe 文档（独立 realm），不能用父页面的 instanceof Element
      // 判断（跨 realm 恒为 false），统一用 nodeType === 1 判定元素。
      if (!isElement(target) || !target.closest(`#${PAGES_ID}`)) return
      const group = findSectionGroup(target, sectionIndexRef.current)
      if (group) {
        const prev = currentSectionRef.current
        // 同一板块内移动（标题/条目/子元素之间）：保持现有高亮不重建，
        // 避免渐入渐出动画导致的高亮闪烁；仅板块切换时才重渲染。
        if (!prev || prev.els[0] !== group.els[0]) {
          currentSectionRef.current = group
          overlaysRef.current = renderOverlays(doc, group.els, overlaysRef.current)
        }
      }
      // group 为 null：目标落在模块标题↔条目 / 条目↔条目的间距空白区，
      // 该空白区无归属板块。保留当前高亮，避免鼠标经过时闪烁。
    }
    const onMouseOut = (e: MouseEvent) => {
      const from = e.target as Node | null
      if (!isElement(from) || !from.closest(`#${PAGES_ID}`)) return
      const to = e.relatedTarget as Node | null
      // 仍在展示层内（板块或空白区）：交由 mouseover 重算（空白区保留当前高亮）。
      if (to && isElement(to) && to.closest(`#${PAGES_ID}`)) return
      // 移出展示层：清除高亮与当前板块。
      clearOverlays()
      currentSectionRef.current = null
    }
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!isElement(target) || !target.closest(`#${PAGES_ID}`)) return
      // 命中板块直接跳转；落在间距空白区时回退到当前高亮板块，
      // 保证"点击高亮框内任意位置都能跳转"。
      const group = findSectionGroup(target, sectionIndexRef.current) ?? currentSectionRef.current
      if (!group?.id) return
      // 拦截预览内链接导航，改为跳转编辑 tab
      e.preventDefault()
      useEditorStore.getState().jumpToSection(group.id)
    }
    doc.addEventListener('mouseover', onMouseOver)
    doc.addEventListener('mouseout', onMouseOut)
    doc.addEventListener('click', onClick)

    let cancelled = false
    ;(async () => {
      // Wait for fonts/images, then one more frame to settle layout.
      await waitForDocumentReady(doc)
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      if (cancelled) return

      // 分页：从隐藏源容器派生到展示层（源容器保留，供下一次 diff）
      // 记录滚动位置，分页重建（iframe 高度可能变化）后恢复，避免视觉跳变。
      const scrollEl = scrollRef.current
      const prevScrollTop = scrollEl?.scrollTop ?? 0
      const source = doc.getElementById(SOURCE_ID)
      const pages = doc.getElementById(PAGES_ID)
      const result = paginateContent(iframe, {
        sourceEl: source ?? undefined,
        targetEl: pages ?? undefined,
      })
      if (scrollEl) scrollEl.scrollTop = prevScrollTop
      setPageCount(result.pageCount)
      setPaper(result.paper)
      const h = doc.body?.scrollHeight || result.paper.pxH
      setContainerHeight(h)

      // 分页完成后重建板块索引（跨页续接合并），供 hover/click 定位。
      sectionIndexRef.current = buildSectionIndex(doc)

      // 模板切换：新模板内容分页就位后重播淡入动画（remove→回流→add 重启同一 keyframe），
      // 从透明淡入，掩蔽整篇 doc 重写的瞬间。仅切模板触发，内容编辑/样式调整不重播。
      if (isTemplateChange && !cancelled) {
        const paperEl = paperDivRef.current
        if (paperEl) {
          paperEl.classList.remove('animate-preview-enter')
          void paperEl.offsetWidth
          paperEl.classList.add('animate-preview-enter')
        }
      }

      // 统一布局 FLIP：结构签名变化（增删模块/条目/显隐）或离散样式变化
      // （头部布局切换/字体字号）后，所有位置移动的块（头部子块 + 正文块）统一
      // 从旧位置滑到新位置、新增块淡入——同一套动画跟随组件走。
      // 纯文本编辑不改结构签名、滑杆类连续调整逐帧刷新，均不触发（避免抖动/追赶）。
      if (!isTemplateChange && !cancelled) {
        const newLayout = collectLayoutState(doc)
        const structureChanged = oldLayout.keys.join('\n') !== newLayout.keys.join('\n')
        if (structureChanged || discreteStyleChanged) {
          if (layoutCleanupRef.current) {
            layoutCleanupRef.current()
            layoutCleanupRef.current = null
          }
          layoutCleanupRef.current = playLayoutFlip(doc, oldLayout.rects, new Set(oldLayout.keys))
        }
      }

      // 测量头像实际渲染尺寸，回传 store 供编辑器 slider 初始值使用：
      // 未设置头像尺寸（custom_css 无 avatarWidth/Height）时反映模板默认渲染值，
      // 避免硬编码 100px。值比较后再写入，避免每次编辑分页都触发编辑器的同步 effect。
      const avatarImg = doc.querySelector('.r-avatar img') as HTMLImageElement | null
      const measured = avatarImg && avatarImg.offsetWidth > 0
        ? { width: avatarImg.offsetWidth, height: avatarImg.offsetHeight }
        : null
      const prevSize = useResumeStore.getState().avatarRenderedSize
      if ((measured?.width ?? 0) !== (prevSize?.width ?? 0) || (measured?.height ?? 0) !== (prevSize?.height ?? 0)) {
        useResumeStore.getState().setAvatarRenderedSize(measured)
      }

      // 测量模板原生布局（页边距 + 内容间距，CSS px），回传 store 供拖动条默认值使用：
      // 样式未定制（custom_css 无对应段）时，拖动条应从"当前实际渲染值"起步，而非硬编码
      // 默认值，避免一拖就从占位值跳到模板原生值（如 14px→30px）。
      // 直接从渲染结果读计算样式，天然兼容模板用 calc(var(...) * n) 缩放的情况。
      // 页边距消费的单栏/双栏差异：单栏 `.resume-page` 的 padding；双栏 `.resume-page` 无
      // padding，页边距经 `--resume-padding-y/x` 由 `.r-main`（主栏）与 `.r-header`（侧栏）
      // 分栏消费——故回退优先取 `.r-main`（反映页面真实留白），再退 `.r-header`。
      const measurePageMargins = () => {
        const page = doc.querySelector(`#${PAGES_ID} .resume-page, .resume-page`)
        let mY = 0
        let mX = 0
        if (page) {
          const cs = getComputedStyle(page)
          mY = parseFloat(cs.paddingTop) || 0
          mX = parseFloat(cs.paddingLeft) || 0
        }
        if (!(mY > 0 && mX > 0)) {
          const main = doc.querySelector('.r-main')
          if (main) {
            const cs = getComputedStyle(main)
            const y = parseFloat(cs.paddingTop) || 0
            const x = parseFloat(cs.paddingLeft) || 0
            if (y > 0 && x > 0) {
              mY = y
              mX = x
            }
          }
        }
        if (!(mY > 0 && mX > 0)) {
          const header = doc.querySelector('.r-header')
          if (header) {
            const cs = getComputedStyle(header)
            mY = parseFloat(cs.paddingTop) || 0
            mX = parseFloat(cs.paddingLeft) || 0
          }
        }
        return mY > 0 && mX > 0
          ? { pageMarginY: Math.round(mY), pageMarginX: Math.round(mX) }
          : null
      }
      const nativeMargins = measurePageMargins()

      // 内容间距（与注入选择器契约对应，见 resume-global.css）：
      // 模块=`* + .section-title{margin-top}`（只读 section-title 自身 margin-top，
      // 恰好对应模块滑块唯一的覆盖属性）。不能取前一个条目的 margin-bottom 作为模块回退：
      // 条目定制会以 !important 覆盖条目 margin-bottom，若并入模块测量会把「模块滑块」
      // 与「条目滑块」耦合（拖条目连带模块跳动）。模板原生 section-title 多为 margin-top:0，
      // 此时返回 undefined，由 StylePanel 回退到 DISPLAY_DEFAULT 作为稳定默认值。
      // 条目=条目元素 margin-bottom / 细节=`.highlights li` 行 margin-bottom。
      const titles = doc.querySelectorAll('.section-title')
      let sSection = 0
      for (const t of Array.from(titles)) {
        const mt = parseFloat(getComputedStyle(t).marginTop) || 0
        if (mt > sSection) sSection = mt
      }
      const itemEl = doc.querySelector('.experience-item, .education-item, .award-item, .skill-category, .skill-item, .sidebar-item, .custom-item')
      const detailEl = doc.querySelector('.highlights li') ?? doc.querySelector('.exp-location, .exp-header, .edu-detail, .extra-row')
      const sItem = itemEl ? parseFloat(getComputedStyle(itemEl).marginBottom) || 0 : 0
      const sDetail = detailEl ? parseFloat(getComputedStyle(detailEl).marginBottom) || 0 : 0

      const nativeLayout = nativeMargins
        ? {
            ...nativeMargins,
            // sSection 为 0（模板原生无独立模块间距）时置 undefined，让 StylePanel
            // 走 DISPLAY_DEFAULT 回退，避免滑块显示 0px；>0 时为已注入/模板自带的真实模块间距。
            spacingSection: sSection > 0 ? Math.round(sSection) : undefined,
            // 条目/细节同理：无对应元素（空简历/空块）时置 undefined，回退 DISPLAY_DEFAULT，
            // 与模块保持一致，避免「0 被 ?? 当作真实值」造成三栏初始值不对称。
            spacingItem: sItem > 0 ? Math.round(sItem) : undefined,
            spacingDetail: sDetail > 0 ? Math.round(sDetail) : undefined,
          }
        : null
      const prevLayout = useResumeStore.getState().nativeLayout
      if (
        (nativeLayout?.pageMarginY ?? 0) !== (prevLayout?.pageMarginY ?? 0) ||
        (nativeLayout?.pageMarginX ?? 0) !== (prevLayout?.pageMarginX ?? 0) ||
        (nativeLayout?.spacingSection ?? 0) !== (prevLayout?.spacingSection ?? 0) ||
        (nativeLayout?.spacingItem ?? 0) !== (prevLayout?.spacingItem ?? 0) ||
        (nativeLayout?.spacingDetail ?? 0) !== (prevLayout?.spacingDetail ?? 0)
      ) {
        useResumeStore.getState().setNativeLayout(nativeLayout)
      }

      const onWheel = (e: WheelEvent) => {
        if (e.ctrlKey) {
          e.preventDefault()
          const container = scrollRef.current
          const oldZoom = useEditorStore.getState().zoom
          const delta = e.deltaY > 0 ? -0.05 : 0.05
          const newZoom = Math.max(0.5, Math.min(2.0, oldZoom + delta))
          if (newZoom === oldZoom || !container) {
            if (!container) setZoom(newZoom)
            return
          }

          const rect = container.getBoundingClientRect()
          const cx = e.clientX
          const cy = e.clientY

          // Content point in logical (1x) coordinates under the cursor
          const logicalX = (container.scrollLeft + cx - rect.left) / oldZoom
          const logicalY = (container.scrollTop + cy - rect.top) / oldZoom

          setZoom(newZoom)

          // After React commits the zoom change, adjust scroll to keep
          // the same content point under the cursor
          requestAnimationFrame(() => {
            container.scrollLeft = logicalX * newZoom - (cx - rect.left)
            container.scrollTop = logicalY * newZoom - (cy - rect.top)
          })
        }
      }
      doc.addEventListener('wheel', onWheel, { passive: false })
      wheelCleanupRef.current = () => doc.removeEventListener('wheel', onWheel)
    })()

    return () => {
      cancelled = true
      if (layoutCleanupRef.current) {
        layoutCleanupRef.current()
        layoutCleanupRef.current = null
      }
      if (wheelCleanupRef.current) {
        wheelCleanupRef.current()
        wheelCleanupRef.current = null
      }
      doc.removeEventListener('mouseover', onMouseOver)
      doc.removeEventListener('mouseout', onMouseOut)
      doc.removeEventListener('click', onClick)
      clearOverlays()
      currentSectionRef.current = null
    }
  }, [previewHtml, setZoom])

  // Listen for zoom events from toolbar/keyboard shortcuts
  useEffect(() => {
    const handleZoomIn = () => useEditorStore.getState().setZoom(useEditorStore.getState().zoom + 0.1)
    const handleZoomOut = () => useEditorStore.getState().setZoom(useEditorStore.getState().zoom - 0.1)
    const handleZoomReset = () => useEditorStore.getState().setZoom(1.0)

    document.addEventListener('zoom:in', handleZoomIn)
    document.addEventListener('zoom:out', handleZoomOut)
    document.addEventListener('zoom:reset', handleZoomReset)
    return () => {
      document.removeEventListener('zoom:in', handleZoomIn)
      document.removeEventListener('zoom:out', handleZoomOut)
      document.removeEventListener('zoom:reset', handleZoomReset)
    }
  }, [])

  const effectiveScale = zoom

  if (!previewHtml) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-surface-400">
          <div className="w-16 h-20 mx-auto mb-3 rounded border-2 border-surface-300 bg-white" />
          <p className="text-sm">简历预览将在此显示</p>
          <p className="text-xs mt-1">请在左侧填写信息</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto overflow-x-hidden mr-1">
      <div
        ref={paperDivRef}
        className="animate-preview-enter"
        style={{
          width: `${paper.pxW * effectiveScale}px`,
          margin: '24px auto',
        }}
      >
        {/* 占位容器：按缩放后的实际高度占位，裁掉 transform 的布局溢出，
            让状态栏紧贴缩放后的简历末尾，而不是原始高度下方。 */}
        <div style={{ height: `${containerHeight * effectiveScale}px`, overflow: 'hidden' }}>
          <div
            style={{
              transform: `scale(${effectiveScale})`,
              transformOrigin: 'top left',
              width: `${paper.pxW}px`,
            }}
          >
            <iframe
              ref={iframeRef}
              className="w-full border-none"
              style={{ height: `${containerHeight}px`, overflow: 'hidden' }}
              title="简历预览"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
        <div className="mt-2 text-center py-1.5 text-xs text-surface-400 bg-surface-50 border-t border-surface-100">
          共 {pageCount} 页 · {paper.name} · {Math.round(effectiveScale * 100)}%
        </div>
      </div>
    </div>
  )
}
