import { useLayoutEffect, useRef } from 'react'

/**
 * 容器尺寸变化的「拉伸动画」。
 *
 * 触发条件（由 ResizeObserver 覆盖，两条都走同一套逻辑）：
 *   1. 被观察内容自身的尺寸变化（如面板变窄导致文案换行、按钮出现/消失）；
 *   2. 子元素挂载 / 卸载导致的高度变化（如排序列表增删一行、空态与列表互切）。
 * 作用对象：`clipRef` 那个外层容器（只动它的 height + 过渡），内容层不受约束。
 *
 * 实现要点：
 * - 外层在**动画期间**临时 `overflow: hidden` + 显式 `height`，动画结束立刻清空两者，
 *   回到 `height: auto`——这样静止态不会被裁剪（玻璃卡片的投影不会被切掉）。
 * - 起始高度优先取「当前视觉高度」：连续变化时新动画从半途接着走，不会跳、不叠加。
 * - transform 之外的只动 height 会触发重排，但本组件只有几行列表，代价可忽略；
 *   用 FLIP 的 transform 方案反而会拉伸文字，故这里用 height。
 * - 兼容「减少动态效果」：直接不干预，尺寸瞬时变化。
 *
 * 用法：
 *   const { clipRef, contentRef } = useStretchBox()
 *   <div ref={clipRef}><div ref={contentRef}>{...}</div></div>
 * ⚠ 内容层（contentRef）不要有 padding/border —— 观察的是内容盒高度。
 */
export function useStretchBox() {
  const clipRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const clip = clipRef.current
    const content = contentRef.current
    if (!clip || !content || typeof ResizeObserver === 'undefined') return
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const readHeight = (entry: ResizeObserverEntry) =>
      entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height

    let prev = content.getBoundingClientRect().height
    let timer = 0

    const clearInline = () => {
      clip.style.transition = ''
      clip.style.height = ''
      clip.style.overflow = ''
    }

    const ro = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (!entry) return
      const next = readHeight(entry)
      // 动画进行中：起点取当前视觉高度（可被打断后续着走）；空闲时取上一次记录的高度
      const animating = clip.style.height !== ''
      const from = animating ? clip.getBoundingClientRect().height : prev
      prev = next
      if (Math.abs(next - from) < 0.5) return

      if (timer) window.clearTimeout(timer)
      // 先关过渡、钉住起始高度，强制回流后再开过渡 → 保证从 from 平滑到 next
      clip.style.transition = 'none'
      clip.style.overflow = 'hidden'
      clip.style.height = `${from}px`
      void clip.offsetHeight
      clip.style.transition = `height ${STRETCH_MS}ms ${STRETCH_EASE}`
      clip.style.height = `${next}px`
      timer = window.setTimeout(() => {
        timer = 0
        clearInline()
      }, STRETCH_MS + 20)
    })

    ro.observe(content)
    return () => {
      ro.disconnect()
      if (timer) window.clearTimeout(timer)
      clearInline()
    }
  }, [])

  return { clipRef, contentRef }
}

/** 拉伸动画时长（ms）：落在 200–300 的自然区间。 */
const STRETCH_MS = 260
/** 缓动：与全站一致的苹果风出场曲线（globals.css 的 --ease-apple-out）。 */
const STRETCH_EASE = 'var(--ease-apple-out)'
