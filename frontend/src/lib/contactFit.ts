/**
 * 联系方式条目自适应跨列（单栏 4 列栅格配套能力）。
 *
 * 单栏模板的 `.r-contact` 是连续无缝 4 列栅格：长值条目（网站/GitHub/LinkedIn 等）
 * 在一格内放不下时会换行，观感差。本模块在渲染后测量每个条目的内容所需宽度，
 * 放不下当前格时按需设置 `grid-column: span 2/3/4`（上限为列数）。
 *
 * 为什么由外层调用而不是只靠 template.html 内嵌脚本：
 * - 编辑页预览（PreviewPanel）与导出（exportHtml）的 iframe 为
 *   `sandbox="allow-same-origin"`，不含 `allow-scripts`，内嵌脚本不执行；
 * - 编辑态预览用 morphdom 增量 diff 源容器，即使允许脚本，内容变化后
 *   内嵌脚本也不会重跑。
 * 因此需要在「文档 ready 之后、分页/截图之前」由外层主动调用本模块。
 * template.html 内嵌脚本保留，服务无外层 JS 的场景（用户直接打开导出的
 * HTML 文件、模板画廊/简历页 srcdoc 预览），逻辑与本模块一致且幂等。
 *
 * 调用约定：
 * - 必须在字体/图片就绪（waitForDocumentReady）之后调用，测量才准确；
 * - 必须在分页之前调用（跨列改变行数 → 改变内容高度，分页测量依赖最终布局）；
 * - 幂等：先重置 span 再测量，可随内容更新反复调用；
 * - 跨列结果以内联样式落条目，分页克隆原样保留；`overflow-wrap: anywhere`
 *   仍作兜底（满格仍放不下才换行）。
 */
export function applyContactFit(doc: Document): void {
  const win = doc.defaultView
  if (!win) return

  const grids = doc.querySelectorAll('.r-contact')
  for (let g = 0; g < grids.length; g++) {
    const grid = grids[g] as HTMLElement
    // computed style 必须取自元素所在文档的 window（跨 document 取值不可靠）
    const cs = win.getComputedStyle(grid)
    if (!cs.display.includes('grid')) continue // 双栏侧栏竖排等非栅格布局跳过
    const gridW = grid.clientWidth
    if (gridW < 40) continue // 隐藏（如预览外壳极窄）时跳过
    const cols = cs.gridTemplateColumns.trim().split(/\s+/).length
    if (cols < 2) continue
    const colGap = parseFloat(cs.columnGap) || 0
    const unit = (gridW - colGap * (cols - 1)) / cols

    const items = grid.querySelectorAll('.r-contact-item')
    for (let i = 0; i < items.length; i++) {
      const it = items[i] as HTMLElement
      it.style.gridColumn = ''
      const label = it.querySelector('.r-contact-label') as HTMLElement | null
      const value = it.querySelector('.r-contact-value') as HTMLElement | null
      if (!value) continue
      let labelW = 0
      let innerGap = 0
      if (label) {
        labelW = label.offsetWidth
        innerGap = parseFloat(win.getComputedStyle(it).columnGap) || 0
      }
      // 临时禁止换行，测值内容实际所需宽度（value 为 flex item 已块化，scrollWidth 可靠）
      value.style.whiteSpace = 'nowrap'
      const need = labelW + innerGap + value.scrollWidth
      value.style.whiteSpace = ''
      let span = 1
      if (need > unit + 0.5) {
        span = Math.min(cols, Math.ceil((need + colGap) / (unit + colGap)))
      }
      if (span > 1) it.style.gridColumn = `span ${span}`
    }
  }
}
