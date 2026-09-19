import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'

interface ExpandableProps {
  show: boolean
  children: ReactNode
  duration?: number     /** 展开/收起动画时长（ms），默认 250 */
  className?: string
  gapTop?: number       /** 展开后顶部间距（px），收起时平滑过渡到 0。用于接管父级 space-y 的 margin，避免收起后残留空隙。默认 0。*/
}

/**
 * 高度平滑展开/收起的容器。
 *
 * 基于 `grid-template-rows: 0fr ↔ 1fr` 过渡技巧：CSS 无法直接过渡
 * `height: auto`，而 grid 轨道尺寸是可过渡的。子内容始终挂载（保留
 * 状态、焦点与滚动位置），高度从 0 平滑过渡到实际内容高度。
 * 现代 Chromium（含 Wails WebView2）原生支持该过渡。
 *
 * 注意：子内容无需额外处理，内层已做 `min-h-0 + overflow-hidden`，
 * 收起时内容会被裁剪且不可见（opacity 同步淡出）。
 *
 * `data-expanding` 标记（2026-09-19）：过渡进行期间挂在根节点，供
 * `useLayoutTransition`（模态卡片拉伸）识别——Expandable 动画期间卡片尺寸
 * 连续变化，卡片级过渡若同时启动会形成双重动画/反复打断，必须让路。
 */
export function Expandable({ show, children, duration = 250, className = '', gapTop = 0 }: ExpandableProps) {
  const [expanding, setExpanding] = useState(false)

  // 过渡窗口期打标记：transitionend（grid-template-rows）提前摘 + 定时兜底
  //（headless 等环境可能不派发 transitionend）。
  useEffect(() => {
    setExpanding(true)
    const id = window.setTimeout(() => setExpanding(false), duration + 80)
    return () => window.clearTimeout(id)
  }, [show, duration])

  const eased = 'cubic-bezier(0.33, 1, 0.68, 1)'
  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateRows: show ? '1fr' : '0fr',
    marginTop: show ? gapTop : 0,
    transition: `grid-template-rows ${duration}ms ${eased}, margin-top ${duration}ms ${eased}`,
  }
  return (
    <div
      className={className}
      style={gridStyle}
      data-expanding={expanding || undefined}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && e.propertyName === 'grid-template-rows') {
          setExpanding(false)
        }
      }}
    >
      <div
        className="min-h-0 overflow-hidden"
        style={{
          opacity: show ? 1 : 0,
          transition: `opacity ${Math.max(120, duration - 60)}ms ease`,
        }}
      >
        {children}
      </div>
    </div>
  )
}
