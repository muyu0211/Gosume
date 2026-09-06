import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * 带「初始渲染/外部值变化」缓动动画的原生 range 滑块（样式面板与头像圆角拖动条共用）。
 *
 * - 量程内部统一映射为 0–100（step="any" 连续），对外仍显示/保存 px/档位——短量程
 *   （如 1–20px 只有约 19 个离散位置）会导致原生滑块吸附到过少物理位置、动画一步一顿；
 *   映射成 0–100 后粒度细得多。
 * - 挂载时从 min（0 侧锚点）经 easeOutCubic 平滑缓动到目标值；外部 value 变化（如实测
 *   值回填）时从「当前显示值」续接过渡，避免跳变。
 * - 起始值用 ref 实时读取而非渲染闭包——连续 re-target 一律从当前 ref 值续接，避免
 *   橡皮筋式回弹/顿挫。
 * - 用户拖动时绕过缓冲（即时反馈），只渲染 <input>，数值标签由调用方自行展示。
 */
export function AnimatedRange({
  value,
  min,
  max,
  onChange,
  className,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  className?: string
}) {
  const range = max - min
  const toPct = (px: number) => (range <= 0 ? 0 : ((px - min) / range) * 100)
  const toPx = (pct: number) =>
    Math.min(max, Math.max(min, Math.round(min + (pct / 100) * range)))

  // cur 为解算后的 px（可为小数，仅用于定位），保证动画粒度不受 1px 整数限制。
  const [cur, setCur] = useState<number>(() => min)
  const curRef = useRef<number>(min)
  const rafRef = useRef<number | null>(null)
  const draggingRef = useRef(false)

  // 立即设置显示值（用户拖动时用，取消进行中的动画），值已 clamp 到 [min,max]。
  const setValInstant = useCallback((v: number) => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    curRef.current = v
    setCur(v)
  }, [])

  useEffect(() => {
    if (draggingRef.current) {
      setValInstant(value)
      return
    }
    const from = curRef.current
    const to = value
    if (to === from) return
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    const DURATION = 400
    const start = performance.now()
    const ease = (t: number) => 1 - Math.pow(1 - t, 3) // easeOutCubic
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION)
      const v = from + (to - from) * ease(t) // 小数连续生成，交由 0–100 量程平滑定位
      curRef.current = v
      setCur(v)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
      else {
        curRef.current = to
        setCur(to)
        rafRef.current = null
      }
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [value, setValInstant])

  // 卸载时清理 rAF。
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

  return (
    <input
      type="range"
      min={0}
      max={100}
      step="any"
      value={toPct(cur)}
      onPointerDown={() => {
        draggingRef.current = true
        setValInstant(value)
      }}
      onPointerUp={() => {
        draggingRef.current = false
        setValInstant(value)
      }}
      onPointerCancel={() => {
        draggingRef.current = false
        setValInstant(value)
      }}
      onChange={(e) => {
        const v = toPx(parseFloat(e.target.value))
        setValInstant(v)
        onChange(v)
      }}
      className={className}
    />
  )
}