import { useState, useEffect, useRef, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** When this value changes, trigger crossfade transition */
  trigger: string
  className?: string
}

/**
 * Wraps content with a crossfade transition: old content fades out (100ms)
 * while new content fades in with animate-section-enter (200ms).
 */
export function CrossFade({ children, trigger, className }: Props) {
  const [rendered, setRendered] = useState<ReactNode>(children)
  const [exiting, setExiting] = useState(false)
  const prevTrigger = useRef(trigger)

  // trigger 未变化时把最新 children 同步进 rendered。
  // children 是每次渲染新建的元素；若只存在 state 里（引用不变），React 会对该
  // 子树做 bailout，子面板将永远持有挂载那一刻的旧 props（表现为简历列表始终
  // 处于 loading 骨架屏）。过渡期间（exiting）保持旧内容以完成淡出。
  if (!exiting && trigger === prevTrigger.current && rendered !== children) {
    setRendered(children)
  }

  useEffect(() => {
    if (trigger !== prevTrigger.current) {
      setExiting(true)
      prevTrigger.current = trigger
      const timer = setTimeout(() => {
        setRendered(children)
        setExiting(false)
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [children, trigger])

  return (
    <div className={`relative ${className || ''}`}>
      <div
        className={`transition-opacity duration-150 ${exiting ? 'opacity-0' : 'opacity-100'}`}
      >
        <div className={exiting ? '' : 'animate-section-enter'}>
          {rendered}
        </div>
      </div>
    </div>
  )
}
