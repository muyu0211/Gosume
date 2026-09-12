import { useEffect, useRef } from 'react'
import type { PendingItemDelete } from '../stores/resumeStore'

/**
 * 编辑模块子条目的增删动画（WAAPI，WebView2/Chromium 原生支持）。
 *
 * 交互顺序（2026-09-13 二次修正）：
 * - 点击删除 → **立即弹二次确认窗，条目完全不动**（弹窗期间无任何动画——用户拍板）。
 * - 确认 → 由 ItemDeleteConfirmDialog 调 `playEntryExit(key)` 对目标条目播放
 *   「淡出 + 高度/外边距收缩」，动画结束后才执行真正的数据删除。
 *   取消 → 什么都不发生，条目分毫未动。
 * - 新增：items.length 增加时列表末项淡入 + 上浮（首挂载不播）。
 * - prefers-reduced-motion 或无 WAAPI 或找不到目标元素（无独立 DOM 的子项，如技能项/亮点行）
 *   时：跳过动画直接确认，删除语义不变。
 */
const ENTER_MS = 200
const EXIT_MS = 220
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)' // --ease-apple-out
const EASE_INOUT = 'cubic-bezier(0.4, 0, 0.2, 1)'

/** 待删除目标 → 条目 DOM 的 data-del-key；返回 null 表示该目标没有独立条目元素（跳过动画）。 */
export function entryDeleteKey(pending: PendingItemDelete): string | null {
  switch (pending.type) {
    case 'item':
      return `item:${pending.kind}:${pending.index}`
    case 'customItem':
      return `customItem:${pending.sectionIndex}:${pending.itemIndex}`
    case 'extra':
      return `extra:${pending.projectIndex}:${pending.extraIndex}`
    case 'highlight':
      return `highlight:${pending.section}:${pending.itemIndex}:${pending.highlightIndex}`
    case 'customHighlight':
      return `customHighlight:${pending.sectionIndex}:${pending.itemIndex}:${pending.highlightIndex}`
    case 'skillItem':
      return `skillItem:${pending.groupIndex}:${pending.skillIndex}`
    default:
      return null
  }
}

/**
 * 列表入场动画（通用版）：count 增加时，列表内最后一个命中 selector 的元素
 * 淡入 + 上浮。用于非 .glass-entry 的行（如亮点行）。首挂载不播。
 */
export function useListEnterAnimation(count: number, selector: string) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const prevCount = useRef(count)
  useEffect(() => {
    if (count > prevCount.current) {
      const els = listRef.current?.querySelectorAll<HTMLElement>(selector)
      const el = els && els[els.length - 1]
      if (el && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.animate(
          [
            { opacity: 0, transform: 'translateY(6px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: ENTER_MS, easing: EASE_OUT },
        )
      }
    }
    prevCount.current = count
  }, [count, selector])
  return listRef
}

/** 对 data-del-key 命中的条目播放离场动画；resolve 即可安全执行真正的数据删除。 */
export function playEntryExit(key: string): Promise<void> {
  const el = document.querySelector<HTMLElement>(`[data-del-key="${key}"]`)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!el || !el.animate || reduced) return Promise.resolve()

  return new Promise((resolve) => {
    const cs = getComputedStyle(el)
    el.style.overflow = 'hidden'
    const anim = el.animate(
      [
        {
          opacity: 1,
          height: el.offsetHeight + 'px',
          marginTop: cs.marginTop,
          marginBottom: cs.marginBottom,
          transform: 'none',
        },
        {
          opacity: 0,
          height: '0px',
          marginTop: '0px',
          marginBottom: '0px',
          transform: 'translateY(4px)',
        },
      ],
      { duration: EXIT_MS, easing: EASE_INOUT, fill: 'forwards' },
    )
    const done = () => resolve()
    anim.finished.then(done).catch(done)
  })
}

export function useEntryTransition<T>(
  items: T[],
  requestRemove: (idx: number) => void,
) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const prevCount = useRef(items.length)
  const requestRef = useRef(requestRemove)
  requestRef.current = requestRemove

  // 入场：仅在数量增加时对最后一项播放
  useEffect(() => {
    if (items.length > prevCount.current) {
      const els = listRef.current?.querySelectorAll<HTMLElement>('.glass-entry')
      const el = els && els[els.length - 1]
      if (el && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.animate(
          [
            { opacity: 0, transform: 'translateY(6px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: ENTER_MS, easing: EASE_OUT },
        )
      }
    }
    prevCount.current = items.length
  }, [items.length])

  /** 删除入口：直接走 store 流程（弹确认窗或按「不再提示」立即删除）。离场动画在确认时由 playEntryExit 播放。
      第二参数（事件）仅为兼容各模块既有的 onClick 写法，本 hook 不使用。 */
  const deleteEntry = (idx: number, _e?: { currentTarget: EventTarget | null }) => {
    requestRef.current(idx)
  }

  return { listRef, deleteEntry }
}
