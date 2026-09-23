import { useState, useEffect, useCallback } from 'react'
import { Events } from '@wailsio/runtime'
import { callService, isWails } from '../../services/backend'
import { useResumeStore } from '../../stores/resumeStore'
import { isMacOS } from '../../lib/platform'
import { useT } from '../../lib/i18n'
import { Tooltip } from '../ui/Tooltip'

export function TitleBar() {
  const t = useT()
  const [isMaximised, setIsMaximised] = useState(false)
  const requestLeave = useResumeStore((s) => s.requestLeave)
  // macOS 使用原生红绿灯（关闭/最小化/全屏），不渲染自绘的 Windows 风格按钮
  const isMac = isMacOS()

  useEffect(() => {
    if (isMac) return
    // 以窗口**真实状态**为准（不乐观翻转）：
    // 1) 挂载时查询一次；2) 订阅 Go 侧 WindowMaximise/UnMaximise 事件——
    //    拖动还原、双击标题栏、Win+方向键等所有路径都会推送真实状态；
    // 3) 视口 resize 兜底重查，覆盖事件遗漏的场景。
    const refresh = () => {
      callService<boolean>('SystemService', 'IsWindowMaximised')
        .then((v) => setIsMaximised(!!v))
        .catch(() => { /* 忽略：非关键路径 */ })
    }
    refresh()
    const off = isWails()
      ? Events.On('window:maximise-state', (ev) => {
          setIsMaximised(!!(ev as { data?: unknown }).data)
        })
      : undefined
    window.addEventListener('resize', refresh)
    return () => {
      window.removeEventListener('resize', refresh)
      off?.()
    }
  }, [isMac])

  const handleMinimize = useCallback(() => {
    callService('SystemService', 'MinimizeWindow').catch(() => { /* 忽略 */ })
  }, [])

  const handleMaximize = useCallback(() => {
    // 火发即忘，真实状态由 Go 侧 WindowMaximise/UnMaximise 事件推回。
    // 不做本地乐观翻转——拖动还原等非按钮路径无法被乐观翻转覆盖，
    // 那是旧实现「图标与实际状态相反」的根源。
    callService('SystemService', 'MaximizeWindow').catch(() => { /* 忽略 */ })
  }, [])

  const handleClose = useCallback(() => {
    // 未保存守卫：有未保存更改时先弹二确（保存并继续 / 不保存并继续 / 取消），
    // 确认后调用 ConfirmWindowClose 真正关闭窗口；无未保存更改则直接关闭。
    requestLeave(() => {
      callService('SystemService', 'ConfirmWindowClose').catch(() => { /* 忽略 */ })
    })
  }, [requestLeave])

  return (
    <div className="titlebar">
      <div className="titlebar-drag" onDoubleClick={handleMaximize}>
        <img
          src="/gosume-logo.svg"
          alt=""
          draggable={false}
          className="titlebar-logo select-none"
        />
        <span className="titlebar-title">Gosume</span>
      </div>

      {!isMac && (
        <div className="titlebar-controls">
          <Tooltip label={t('minimize')}>
            <button
              onClick={handleMinimize}
              className="titlebar-btn"
              aria-label={t('minimize')}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 6h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </Tooltip>

          <Tooltip label={isMaximised ? t('restore') : t('maximize')}>
            <button
              onClick={handleMaximize}
              className="titlebar-btn"
              aria-label={isMaximised ? t('restore') : t('maximize')}
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
          </Tooltip>

          <Tooltip label={t('close')}>
            <button
              onClick={handleClose}
              className="titlebar-btn titlebar-btn-close"
              aria-label={t('close')}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  )
}
