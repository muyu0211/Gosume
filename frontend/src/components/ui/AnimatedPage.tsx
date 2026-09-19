import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
}

/**
 * 路由级入场容器：内容淡入 + 轻微上移（250ms）。
 */
export function AnimatedPage({ children, className }: Props) {
  const [entered, setEntered] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 双保险：animationend 正常路径 + 定时器兜底（无头环境可能不派发 animation 事件）。
  useEffect(() => {
    const timer = window.setTimeout(() => setEntered(true), 400)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div
      ref={ref}
      onAnimationEnd={() => setEntered(true)}
      className={`${entered ? 'animate-page-enter-done' : 'animate-page-enter'} ${className || ''}`}
    >
      {children}
    </div>
  )
}
