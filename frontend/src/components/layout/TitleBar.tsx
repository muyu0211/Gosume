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
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0" y="4" width="10" height="1" fill="currentColor" />
          </svg>
        </button>

        <button
          onClick={handleMaximize}
          className="titlebar-btn"
          title={isMaximised ? '还原' : '最大化'}
          aria-label={isMaximised ? '还原' : '最大化'}
        >
          {isMaximised ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="3" y="1" width="6" height="6" stroke="currentColor" strokeWidth="1" fill="none" />
              <rect x="1" y="3" width="6" height="6" stroke="currentColor" strokeWidth="1" fill="#0F172A" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="1" y="1" width="8" height="8" stroke="currentColor" strokeWidth="1" fill="none" />
            </svg>
          )}
        </button>

        <button
          onClick={handleClose}
          className="titlebar-btn titlebar-btn-close"
          title="关闭"
          aria-label="关闭"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.2" />
            <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
