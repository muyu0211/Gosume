import { useEffect } from 'react'
import { canRefract, startLiquidGlass } from '../lib/liquidGlass'

/**
 * 全局启用液态玻璃引擎（Tier 1 边缘折射）。
 *
 * 只需在应用根节点调用一次。引擎会自动接管所有带 `data-lg` 的元素，
 * 并用 MutationObserver 跟踪后续动态挂载的节点（对话框、抽屉等）。
 *
 * 非 Chromium 环境下 `canRefract` 为 false，这里直接不启动 ——
 * 元素保持在 Tier 0（纯模糊），由 CSS 里 `var(--lg-backdrop, ...)` 的回退提供，
 * 不会出现 Safari / Firefox 下的透明块问题。
 */
export function useLiquidGlass(): void {
  useEffect(() => {
    if (!canRefract) return
    return startLiquidGlass()
  }, [])
}
