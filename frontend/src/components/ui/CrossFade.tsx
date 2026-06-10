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
