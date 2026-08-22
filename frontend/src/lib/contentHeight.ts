import { DEFAULT_PAPER, resolvePaper } from './paper'
import type { PaperSpec } from './paper'

/**
 * 内容高度超过一页的倍数超过该值时，一页导出会使内容明显缩小。
 * 这是「建议阈值」而非硬限制——任意高度都允许一页导出，选择权交给用户。
 */
export const ONE_PAGE_EXPORT_RATIO = 1.3

/** 由模板纸张规格解析基准纸张（缺少时回退 A4）。 */
export function getTemplatePaper(paperSize?: string | null, orientation?: string | null): PaperSpec {
  return paperSize ? resolvePaper(paperSize, orientation) : DEFAULT_PAPER
}

/** 内容高度与一页纸高度的比值；未测量（null）返回 null。 */
export function contentHeightRatio(contentHeight: number | null, paper: PaperSpec): number | null {
  return contentHeight != null && paper.pxH > 0 ? contentHeight / paper.pxH : null
}

/** 按 130% 阈值分级：fit（一页内）/ ok（可一页导出）/ over（不建议）。 */
export function ratioLevel(ratio: number): 'fit' | 'ok' | 'over' {
  if (ratio <= 1) return 'fit'
  if (ratio <= ONE_PAGE_EXPORT_RATIO) return 'ok'
  return 'over'
}
