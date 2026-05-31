import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
}

export function AnimatedPage({ children, className }: Props) {
  return (
    <div className={`animate-page-enter ${className || ''}`}>
      {children}
    </div>
  )
}
