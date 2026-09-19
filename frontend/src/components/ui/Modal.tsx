import { forwardRef, useCallback, useEffect, useImperativeHandle, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLayoutTransition } from '../../hooks/useLayoutTransition'

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
 * - 卡片高度内容驱动自适应；**任何原因**引起的卡片尺寸变化（内容增删、类型切换、
 *   区块显隐、视口缩放…）由 `useLayoutTransition` 统一观察并自动播放拉伸过渡，
 *   业务侧无需（也不应）为尺寸变化单独写动画分支。内容侧 `Expandable` 动画期间
 *   会挂 `data-expanding`，卡片过渡自动让路，二者不叠加。
 * - 通过 ref 暴露 close()，供子组件在业务完成后主动触发退场动画。
 *
 * 用法：父组件条件渲染本组件；挂载即播放入场，close() 播放退场后调用 onClose。
 */
export const Modal = forwardRef<ModalHandle, ModalProps>(function Modal(
  { onClose, width = 'w-[520px]', cardClassName = '', children },
  ref,
) {
  const [phase, setPhase] = useState<Phase>('entering')
  // 卡片尺寸拉伸过渡：与业务解耦的统一入口；退场动画期间暂停启动新过渡
  const { ref: transitionRef, onTransitionEnd: onCardTransitionEnd } = useLayoutTransition<HTMLDivElement>({
    disabled: phase === 'exiting',
  })

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

  const handleAnimationEnd = () => {
    // 退出动画执行完（animationend 必然触发）后再卸载，避免覆盖层残留导致页面不可点击
    if (phase === 'exiting') onClose()
  }

  const isActive = phase === 'open' || phase === 'entering'

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-200 ${
        isActive ? 'bg-[var(--material-overlay)] backdrop-blur-sm' : 'bg-transparent backdrop-blur-none'
      }`}
      onClick={close}
    >
      <div
        ref={transitionRef}
        onAnimationEnd={handleAnimationEnd}
        onTransitionEnd={onCardTransitionEnd}
        onClick={(e) => e.stopPropagation()}
        className={`glass glass-modal ${width} max-h-[90vh] overflow-hidden ${cardClassName} gosume-modal-size ${
          phase === 'exiting' ? 'gosume-modal-out' : 'gosume-modal-in'
        }`}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
})
