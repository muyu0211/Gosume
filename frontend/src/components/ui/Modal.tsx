import { forwardRef, useCallback, useEffect, useLayoutEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'

export interface ModalHandle {
  /** 触发退场动画，动画结束后调用 onClose。 */
  close: () => void
}

interface ModalProps {
  /** 退场动画结束后的关闭回调（由父组件卸载本组件）。 */
  onClose: () => void
  /** 卡片宽度（Tailwind class），默认 w-[520px]。 */
  width?: string
  /** 追加到卡片的样式（滚动 / 布局相关，如 overflow-auto 或 flex 布局）。 */
  cardClassName?: string
  children: ReactNode
}

type Phase = 'entering' | 'open' | 'exiting'

/**
 * 通用模态窗口外壳，统一全项目模态窗口的外观行为：
 *
 * - 三阶段过渡动画（entering → open → exiting）：overlay 淡入淡出 + 卡片
 *   轻微上移缩放（200ms），进入/退出体验一致；
 * - overlay 点击关闭、Escape 关闭；
 * - 卡片 `max-h-[90vh]` 居中，随窗口大小自适应；
 * - 通过 ref 暴露 close()，供子组件在业务完成后主动触发退场动画。
 *
 * 用法：父组件条件渲染本组件；挂载即播放入场，close() 播放退场后调用 onClose。
 */
export const Modal = forwardRef<ModalHandle, ModalProps>(function Modal(
  { onClose, width = 'w-[520px]', cardClassName = '', children },
  ref,
) {
  const [phase, setPhase] = useState<Phase>('entering')
  const cardRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  // 卡片内容自然高度（→ 设给卡片数值 height，配合 transition 实现尺寸平滑变化）。
  const [height, setHeight] = useState<number | undefined>(undefined)

  // 每次渲染后按内容自然高度更新卡片高度（内容变化 → 高度过渡）；超高时钳到 90vh。
  useLayoutEffect(() => {
    const c = contentRef.current
    if (!c) return
    const maxH = Math.floor(window.innerHeight * 0.9)
    setHeight(Math.min(c.offsetHeight, maxH))
  })

  // 窗口尺寸变化时重新钳制。
  useEffect(() => {
    const onResize = () => {
      const c = contentRef.current
      if (!c) return
      setHeight(Math.min(c.offsetHeight, Math.floor(window.innerHeight * 0.9)))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    // 挂载后等待两帧再进入 open，保证入场过渡生效
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase('open'))
    })
  }, [])

  const close = useCallback(() => setPhase('exiting'), [])
  useImperativeHandle(ref, () => ({ close }), [close])

  // Escape 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  const handleTransitionEnd = () => {
    if (phase === 'exiting') onClose()
  }

  const isActive = phase === 'open' || phase === 'entering'

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-200 ${
        isActive ? 'bg-black/25 backdrop-blur-sm' : 'bg-transparent backdrop-blur-none'
      }`}
      onClick={close}
    >
      <div
        ref={cardRef}
        onTransitionEnd={handleTransitionEnd}
        onClick={(e) => e.stopPropagation()}
        className={`bg-elev rounded-2xl shadow-xl ${width} max-h-[90vh] ${cardClassName} transition-all duration-200 ${
          phase === 'entering'
            ? 'opacity-0 scale-96 translate-y-2'
            : phase === 'open'
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-96 translate-y-2'
        }`}
        style={{ height }}
      >
        <div ref={contentRef} className="flex min-h-0 flex-col">
          {children}
        </div>
      </div>
    </div>
  )
})
