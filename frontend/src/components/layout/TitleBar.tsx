import { useState, useEffect, useCallback } from 'react'
import { callService } from '../../services/backend'

export function TitleBar() {
  const [isMaximised, setIsMaximised] = useState(false)

  useEffect(() => {
    callService<boolean>('SystemService', 'IsWindowMaximised').then((v) => {
      if (v) setIsMaximised(v)
    })
  }, [])

  const handleMinimize = useCallback(() => {
    callService('SystemService', 'MinimizeWindow')
  }, [])

  const handleMaximize = useCallback(() => {
    callService('SystemService', 'MaximizeWindow')
    setIsMaximised(!isMaximised)
  }, [isMaximised])

  const handleClose = useCallback(() => {
    callService('SystemService', 'CloseWindow')
  }, [])

  return (
    <div className="titlebar">
      <div className="titlebar-drag" onDoubleClick={handleMaximize}>
        <span className="titlebar-title">Gosume</span>
      </div>

      <div className="titlebar-controls">
        <button
          onClick={handleMinimize}
          className="titlebar-btn"
          title="最小化"
          aria-label="最小化"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 6h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>

        <button
          onClick={handleMaximize}
          className="titlebar-btn"
          title={isMaximised ? '还原' : '最大化'}
          aria-label={isMaximised ? '还原' : '最大化'}
        >
          {isMaximised ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="3.5" y="2" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <rect x="1.5" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" style={{ fill: 'var(--titlebar-bg)' }} />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="2.5" y="2.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          )}
        </button>

        <button
          onClick={handleClose}
          className="titlebar-btn titlebar-btn-close"
          title="关闭"
          aria-label="关闭"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
