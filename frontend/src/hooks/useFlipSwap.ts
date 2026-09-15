import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * 列表顺序变化的 FLIP 交换动画。
 *
 * 用法：
 *   1. 每一行用 `register(key)` 拿到的 ref 挂到 DOM 上（同 key 的回调是稳定引用，
 *      不会因重渲染而反复 detach/attach）；
 *   2. 在**触发排序的动作之前**调用 `capture()`（记录视觉位置）；
 *   3. 顺序变化提交后，内部 useLayoutEffect 自动做「平移回旧位置 → 开过渡滑到新位置」。
 *
 * 为什么用 FLIP（而不是直接 transition top / animate）：
 *   - 只动 transform，**不触发重排**，列表再长也不卡；
 *   - 记录的是「视觉位置」（含未完成动画的位移），所以连续操作时新动画从当前
 *     视觉位置接着走，不会跳。
 *
 * 打断策略：每次新的排序动作都会先清掉上一次的 transition/transform 与定时器，
 * 动画**不会叠加**；capture 取到的是当时的视觉位置，因此视觉连续。
 */
export function useFlipSwap(keys: string[]) {
  /** key → 行元素 */
  const nodes = useRef(new Map<string, HTMLElement>())
  /** 排序前记录的视觉位置（top） */
  const firstTop = useRef<Map<string, number> | null>(null)
  /** key → 动画收尾定时器 */
  const timers = useRef(new Map<string, number>())
  /** ref 回调缓存：保证同一 key 每次返回同一个函数 */
  const refCache = useRef(new Map<string, (el: HTMLElement | null) => void>())

  const register = useCallback((key: string) => {
    let fn = refCache.current.get(key)
    if (!fn) {
      fn = (el: HTMLElement | null) => {
        if (el) {
          nodes.current.set(key, el)
        } else {
          nodes.current.delete(key)
          const id = timers.current.get(key)
          if (id) {
            window.clearTimeout(id)
            timers.current.delete(key)
          }
        }
      }
      refCache.current.set(key, fn)
    }
    return fn
  }, [])

  /** 减少动态效果时完全不记录 → 不播放动画。 */
  const capture = useCallback(() => {
    if (prefersReducedMotion()) {
      firstTop.current = null
      return
    }
    const map = new Map<string, number>()
    nodes.current.forEach((el, key) => map.set(key, el.getBoundingClientRect().top))
    firstTop.current = map
  }, [])

  const signature = keys.join('|')

  useLayoutEffect(() => {
    const from = firstTop.current
    firstTop.current = null
    if (!from) return

    // ① 打断上一次未完成的动画：清过渡 + 清 transform。
    //    transform 不影响布局，可以安全清零，保证 ② 测到的是纯布局位置。
    nodes.current.forEach((el, key) => {
      const id = timers.current.get(key)
      if (id) {
        window.clearTimeout(id)
        timers.current.delete(key)
      }
      if (el.style.transform || el.style.transition) {
        el.style.transition = 'none'
        el.style.transform = ''
      }
    })

    // ② FLIP：先瞬移回旧位置，再开过渡滑到新位置（被交换的两行同时运动）
    nodes.current.forEach((el, key) => {
      const before = from.get(key)
      if (before == null) return
      const delta = before - el.getBoundingClientRect().top
      if (Math.abs(delta) < 1) return
      el.style.transition = 'none'
      el.style.transform = `translateY(${delta}px)`
      void el.offsetHeight // 强制回流，让起点在关闭过渡的情况下生效
      el.style.transition = `transform ${SWAP_MS}ms ${SWAP_EASE}`
      el.style.transform = ''
      const id = window.setTimeout(() => {
        el.style.transition = ''
        el.style.transform = ''
        timers.current.delete(key)
      }, SWAP_MS + 30)
      timers.current.set(key, id)
    })
  }, [signature])

  // 卸载时收尾，避免残留定时器
  useLayoutEffect(
    () => () => {
      timers.current.forEach((id) => window.clearTimeout(id))
      timers.current.clear()
    },
    [],
  )

  return { capture, register }
}

/** 交换动画时长（ms）：需求要求 200–300，取中间值。 */
const SWAP_MS = 240
/** 缓动：与全站一致的苹果风出场曲线（globals.css 的 --ease-apple-out）。 */
const SWAP_EASE = 'var(--ease-apple-out)'

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}
