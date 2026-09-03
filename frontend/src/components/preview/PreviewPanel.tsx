import { useRef, useEffect, useState } from 'react'
import { useResumeStore } from '../../stores/resumeStore'
import { useEditorStore } from '../../stores/editorStore'
import { useTemplateStore } from '../../stores/templateStore'
import { useLayoutStore } from '../../stores/layoutStore'
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
import { LAYOUT_STYLE_ID, AVATAR_STYLE_ID } from '../../lib/layoutPresets'

/** 预览交互高亮样式 id（模板切换重写 doc 后重建）。 */
const INTERACT_STYLE_ID = 'preview-section-interact-style'

/** 高亮包围盒外扩（px），避免虚线框贴住内容。 */
const OVERLAY_PAD = 3

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
    /* 模块整区高亮：单个虚线框包裹标题 + 全部条目（每页各生成一个） */
    .preview-section-overlay {
      position: absolute;
      pointer-events: none;
      border: 1.5px dashed var(--primary-color, #3b82f6);
      background: rgba(59, 130, 246, 0.08);
      border-radius: 4px;
      z-index: 10;
    }
  `
  doc.head.appendChild(style)
}

/** 一个逻辑板块（标题 + 全部条目，可跨页）。 */
interface SectionGroup {
  id: string
  els: Element[]
}

/**
 * 板块标题文字 → 编辑 tab id 的兜底映射。
 * 仅在模板未带 data-section 时使用（如运行中 App 的嵌入式模板未更新），
 * 按标题文字推断所属板块，保证点击跳转不依赖模板嵌入是否刷新。
 * 无法识别（如自定义模块名）一律归为 custom。
 */
const SECTION_TITLE_FALLBACK: Record<string, string> = {
  教育背景: 'education',
  Education: 'education',
  实习经历: 'internships',
  Internship: 'internships',
  工作经历: 'jobs',
  'Work Experience': 'jobs',
  项目经历: 'projects',
  Projects: 'projects',
  荣誉奖项: 'awards',
  Awards: 'awards',
  技能: 'skills',
  Skills: 'skills',
  个人总结: 'summary',
  Summary: 'summary',
}

/** 解析板块标题的编辑 tab id：优先取 data-section，缺失时按标题文字兜底。 */
function sectionTitleId(title: Element): string {
  const explicit = title.getAttribute('data-section')
  if (explicit) return explicit
  const text = (title.textContent ?? '').trim()
  return SECTION_TITLE_FALLBACK[text] ?? 'custom'
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
 * 为板块生成高亮：按页分组，每页计算标题+条目的包围盒，生成一个虚线框 overlay。
 * 跨页板块在各页各出一个框，实现"同一模块内容一起高亮"。返回新的 overlay 列表。
 */
function renderOverlays(doc: Document, els: Element[], prev: HTMLElement[]): HTMLElement[] {
  prev.forEach((o) => o.remove())
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
  const wheelCleanupRef = useRef<(() => void) | null>(null)
  /** 分页后的全局板块索引（跨页续接合并），hover/click 共用。 */
  const sectionIndexRef = useRef<SectionGroup[]>([])
  /** 当前 hover 生成的板块高亮 overlay 列表。 */
  const overlaysRef = useRef<HTMLElement[]>([])
  /** 最近一次 hover 命中的板块；鼠标停在模块间距空白区时回退使用，避免闪烁/点击失效。 */
  const currentSectionRef = useRef<SectionGroup | null>(null)
  // 三个独立签名，区分「切模板（全量重写）」「切布局档位（只改 style）」
  // 「改头像尺寸（只改 style）」「纯内容编辑（diff）」四种更新路径。
  const lastTemplateIdRef = useRef<string | null>(null)
  const lastLayoutKeyRef = useRef<string | null>(null)
  const lastAvatarKeyRef = useRef<string | null>(null)
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

    // 四种更新路径：切模板（全量重写）、全局布局变化（只改 style）、改头像尺寸（只改 style）、
    // 纯内容编辑（diff）。head/CSS 只在切模板时重写，布局/头像走 style 增量更新。
    const resume = useResumeStore.getState().resume
    const templateId = useTemplateStore.getState().activeTemplateId
    const l = useLayoutStore.getState().layout
    const layoutKey = [l.pageMarginY, l.pageMarginX, l.spacingSection, l.spacingItem, l.spacingDetail].join('|')
    const avatarKey = [String(resume?.personal?.avatar_width ?? ''), String(resume?.personal?.avatar_height ?? '')].join('|')

    const isTemplateChange = lastTemplateIdRef.current !== templateId
    const isLayoutChange = lastLayoutKeyRef.current !== layoutKey
    const isAvatarChange = lastAvatarKeyRef.current !== avatarKey

    if (isTemplateChange) {
      // 全量：重写 iframe 文档（含 head/CSS），改造成「源容器 + 展示层」，注入 morphdom
      doc.open()
      doc.write(previewHtml)
      doc.close()
      setupSourceShell(iframe)
      injectMorphdom(iframe)
      lastTemplateIdRef.current = templateId
      lastLayoutKeyRef.current = layoutKey
      lastAvatarKeyRef.current = avatarKey
    } else {
      // 增量：内容始终 diff（未变时 morphdom 为 no-op）；布局档位 / 头像尺寸变化时
      // 只更新对应 <style>，不重写 head/CSS，避免调档位时的白屏跳变。
      const parts = parsePreviewHtml(previewHtml)
      morphSourceContent(iframe, parts.contentHtml)
      if (isLayoutChange) {
        updateStyleById(doc, LAYOUT_STYLE_ID, parts.layoutRule)
        lastLayoutKeyRef.current = layoutKey
      }
      if (isAvatarChange) {
        updateStyleById(doc, AVATAR_STYLE_ID, parts.avatarRule)
        lastAvatarKeyRef.current = avatarKey
      }
    }

    // ── 预览模块点击跳转：注入高亮样式 + 绑定 hover/click 委托（同源 iframe，
    //    父页面直接监听 contentDocument；委托在 doc 上，morphdiff 重建内容后仍生效）──
    ensureInteractStyle(doc)
    const clearOverlays = () => {
      overlaysRef.current.forEach((o) => o.remove())
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
        currentSectionRef.current = group
        overlaysRef.current = renderOverlays(doc, group.els, overlaysRef.current)
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

      // 测量头像实际渲染尺寸，回传 store 供编辑器 slider 初始值使用：
      // 无 avatar_width/height 时反映模板默认渲染值，避免硬编码 100px。
      // 值比较后再写入，避免每次编辑分页都触发编辑器的同步 effect。
      const avatarImg = doc.querySelector('.r-avatar img') as HTMLImageElement | null
      const measured = avatarImg && avatarImg.offsetWidth > 0
        ? { width: avatarImg.offsetWidth, height: avatarImg.offsetHeight }
        : null
      const prevSize = useResumeStore.getState().avatarRenderedSize
      if ((measured?.width ?? 0) !== (prevSize?.width ?? 0) || (measured?.height ?? 0) !== (prevSize?.height ?? 0)) {
        useResumeStore.getState().setAvatarRenderedSize(measured)
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
