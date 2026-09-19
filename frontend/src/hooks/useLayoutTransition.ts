import { useCallback, useEffect, useRef } from 'react'

/**
 * 模态卡片尺寸拉伸过渡（2026-09-19 第三次落地，前两次见 memory/2026-09-18.md、
 * 2026-09-19.md 回滚存档——本实现逐条遵守存档里的「七条铁律」）。
 *
 * 原理：卡片高度**内容驱动**，`height` 计算值恒为 auto，CSS transition 永不触发；
 * 唯一可行解是 ResizeObserver 观察卡片自身的布局盒，尺寸一变就用 JS 写两个显式
 * px 端点（旧值 → 新值）播放过渡，落定后摘掉 inline 值回到 auto。
 * 接线点在 `Modal.tsx` 的卡片元素 → 全项目所有基于 Modal 的模态统一获得该能力，
 * 业务侧不再需要（也不再允许）为尺寸变化单独写动画分支。
 *
 * ## 实现铁律（全部实测得出，改代码前先读）
 *
 * 1. **三拍写值**：新内容在任何回调能跑之前就已按新尺寸上屏，所以拍1（同步，RO
 *    回调内）必须写回旧起点值 + 加抑制类 + 强制 reflow；拍2（下一帧）摘抑制类 +
 *    reflow；拍3（再下一帧）写目标值。**拍2/拍3 必须分属两帧**——合成一帧浏览器
 *    看到「起点→起点」，过渡不启动，卡片卡死在旧高度。
 * 2. **绝不手动增删 `el.style.transition`**：写 'none' 再还原会留下空 inline 声明，
 *    永久废掉该元素过渡。抑制一律走 `gosume-no-layout-transition` 类。
 * 3. **`transitionend` 每次写值触发两次**且半步事件 elapsedTime 等于全长 → 耗时
 *    判据全部不可信；用「回读布局值」：offsetHeight 真的等于目标才恢复。
 * 4. **auto 只能在布局真到目标后恢复**，否则内容瞬跳（先塌再鼓）。
 * 5. **rAF 与 setTimeout 的 id 分两个 ref**（id 计数器可能共用，误杀）。
 * 6. **epoch + 元素同一性校验**防「卸载重挂后旧回调把 px 写到新元素」竞态。
 * 7. **拉伸禁用 transform**（scaleY 会拉变形圆角描边）；与入场 keyframes
 *    （gosume-modal-in 的 scaleY）天然不冲突：animation 优先级高于 transition。
 *
 * ## 与内容侧 `Expandable` 的共存
 *
 * `Expandable` 动画期间会在自身根节点挂 `data-expanding`，本 hook 的 RO 回调检测到
 * 卡片内存在该标记就**让路不启动**——尺寸变化已由 Expandable 平滑呈现，卡片若再播
 * 一层就是双重动画（Expandable 连续变化会不断打断卡片过渡，表现为抖动）。
 * Expandable 落定后摘标记；稳态下内容再变化（如错误提示出现）由本 hook 接管。
 */

const SUPPRESS_CLASS = 'gosume-no-layout-transition'
export const TRANSITIONING_ATTR = 'data-layout-transitioning'

/** 过渡时长读不到时的兜底（正常应读到 .gosume-modal-size.glass-modal 的 --dur-base）。 */
const FALLBACK_DURATION_MS = 250
/** 兜底恢复计时器在「读到的时长」之上再加的余量。 */
const SETTLE_EXTRA_MS = 180
/** borderBoxSize 分数像素 vs offsetHeight 取整的容差。 */
const PX_EPSILON = 1

interface Size {
  w: number
  h: number
}

interface Options {
  /** 宽度是否参与拉伸（卡片宽度是 class 定值时几乎不会触发；高度恒参与）。 */
  width?: 'animate' | 'skip'
  /** true 时暂停启动新过渡（如模态退场动画期间），进行中的过渡自然收尾。 */
  disabled?: boolean
}

export function useLayoutTransition<E extends HTMLElement = HTMLDivElement>(options?: Options) {
  const optionsRef = useRef({ width: options?.width ?? 'skip', disabled: options?.disabled ?? false })
  optionsRef.current = { width: options?.width ?? 'skip', disabled: options?.disabled ?? false }

  const ref = useRef<E | null>(null)
  /** 最近一次「稳态」尺寸（动画目标 / 恢复 auto 后的自然尺寸）。 */
  const lastSize = useRef<Size | null>(null)
  /** 进行中过渡的目标值；w 为 null 表示本次只拉高度。 */
  const target = useRef<{ w: number | null; h: number } | null>(null)
  const animating = useRef(false)
  const epoch = useRef(0)
  const raf1 = useRef(0)
  const raf2 = useRef(0)
  const fallbackTimer = useRef(0)

  const clearPending = useCallback(() => {
    cancelAnimationFrame(raf1.current)
    cancelAnimationFrame(raf2.current)
    window.clearTimeout(fallbackTimer.current)
  }, [])

  /** 恢复 auto：清 inline 尺寸与过渡期标记。epoch 自增使所有在途延迟回调失效。 */
  const restore = useCallback(() => {
    epoch.current += 1
    clearPending()
    animating.current = false
    target.current = null
    const el = ref.current
    if (!el) return
    el.removeAttribute(TRANSITIONING_ATTR)
    el.classList.remove(SUPPRESS_CLASS)
    el.style.height = ''
    if (optionsRef.current.width !== 'skip') el.style.width = ''
  }, [clearPending])

  /** 铁律 3/4：回读布局值，真的到达目标才恢复 auto。 */
  const restoreIfSettled = useCallback(() => {
    const el = ref.current
    const t = target.current
    if (!el || !t || !animating.current) return
    const hOK = Math.abs(el.offsetHeight - t.h) <= PX_EPSILON
    const wOK = t.w == null || Math.abs(el.offsetWidth - t.w) <= PX_EPSILON
    if (hOK && wOK) restore()
  }, [restore])

  const readDurationMs = (el: E): number => {
    const list = getComputedStyle(el).transitionDuration.split(',')
    const sec = Number.parseFloat(list[0])
    return Number.isFinite(sec) && sec > 0 ? sec * 1000 : FALLBACK_DURATION_MS
  }

  /** 铁律 1：三拍写值。拍1 必须在 RO 回调内同步完成（RO 先于该帧绘制）。 */
  const startTransition = useCallback(
    (el: E, from: Size, to: { w: number | null; h: number }) => {
      const myEpoch = ++epoch.current
      clearPending()
      animating.current = true
      target.current = to

      // 拍1：抑制过渡 + 写回旧起点 + 强制 reflow（防止已上屏的新尺寸帧持续可见）
      el.classList.add(SUPPRESS_CLASS)
      el.setAttribute(TRANSITIONING_ATTR, '')
      el.style.height = `${from.h}px`
      if (to.w != null) el.style.width = `${from.w}px`
      void el.offsetHeight

      // 拍2（下一帧）：摘抑制类，样式表过渡恢复生效
      raf1.current = requestAnimationFrame(() => {
        if (epoch.current !== myEpoch || ref.current !== el) return
        el.classList.remove(SUPPRESS_CLASS)
        void el.offsetHeight
        // 拍3（再下一帧）：写目标值，过渡启动
        raf2.current = requestAnimationFrame(() => {
          if (epoch.current !== myEpoch || ref.current !== el) return
          el.style.height = `${to.h}px`
          if (to.w != null) el.style.width = `${to.w}px`
          // 兜底恢复必须**无条件**：目标是分数像素、且内容可能在过渡期间又变化，
          // 回读判定（offsetHeight==target）可能永不通过 —— 若只靠它，卡片会被
          // 显式高度钉死、data-layout-transitioning 永远不摘（滚动条被隐藏）。
          // 无条件恢复后布局若有残差，RO 会再触发形成追捕过渡，最终收敛。
          const dur = readDurationMs(el)
          fallbackTimer.current = window.setTimeout(() => {
            if (epoch.current !== myEpoch || ref.current !== el) return
            restore()
          }, dur + SETTLE_EXTRA_MS)
        })
      })
    },
    [clearPending, restoreIfSettled],
  )

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return

    const ro = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      const box = entry.borderBoxSize?.[0]
      const w = box ? box.inlineSize : el.offsetWidth
      const h = box ? box.blockSize : el.offsetHeight

      // 进行中的过渡自己就会改布局盒：中间帧尺寸**不得**写进 lastSize，
      // 否则恢复 auto 后下次过渡会从错误的中间值起拍（视觉回跳）。
      if (animating.current) return

      const prev = lastSize.current
      lastSize.current = { w, h }

      // 首次回调 = 初始尺寸，只记录（开模态不播拉伸）
      if (!prev) return
      const { width: widthMode, disabled } = optionsRef.current
      if (disabled) return
      // 内容侧 Expandable 正在动画：尺寸变化已由它平滑呈现，让路（防双重动画）
      if (el.querySelector('[data-expanding]')) return
      // 抖动阈值：亚像素变化不播
      if (Math.abs(prev.w - w) <= PX_EPSILON && Math.abs(prev.h - h) <= PX_EPSILON) return

      startTransition(
        el,
        prev,
        widthMode === 'animate' ? { w, h } : { w: null, h },
      )
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      epoch.current += 1
      clearPending()
      animating.current = false
      target.current = null
      // 元素可能已脱离文档（模态卸载），仍要清掉过渡期标记防残留
      el.removeAttribute(TRANSITIONING_ATTR)
      el.classList.remove(SUPPRESS_CLASS)
      el.style.height = ''
      if (optionsRef.current.width !== 'skip') el.style.width = ''
    }
  }, [startTransition, clearPending])

  /** 挂在卡片元素上：只认自身元素的 height/width 过渡结束，靠回读判定恢复。 */
  const onTransitionEnd = useCallback(
    (e: { target: unknown; propertyName: string }) => {
      if (e.target !== ref.current) return
      if (e.propertyName !== 'height' && e.propertyName !== 'width') return
      restoreIfSettled()
    },
    [restoreIfSettled],
  )

  return { ref, onTransitionEnd }
}
