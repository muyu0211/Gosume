import { useEffect, useMemo, useRef, useState } from 'react'
import { resolvePaper } from '../../lib/paper'
import { useT } from '../../lib/i18n'

interface Props {
  /** 已渲染的简历 HTML（为空时显示加载占位）。 */
  html?: string
  /** 模板纸张规格（A4 / Letter）。 */
  paperSize?: string
  /** 纸张方向（portrait / landscape）。 */
  orientation?: string
  /** 渲染失败时显示静态占位，不阻断卡片其他操作。 */
  failed?: boolean
  /** 预览区容器附加类名（圆角、背景等），内部只负责比例与缩放。 */
  className?: string
}

/**
 * 简历/模板页面的等比缩放预览（iframe）。
 *
 * 缩放方案与模板卡片 `TemplateCard` 完全一致：按纸张规格撑满容器宽度后
 * `transform: scale(容器宽 / 纸张px宽)`，配合外层 `aspect-ratio + overflow-hidden`
 * 自然裁切到第一页 —— 与编辑器预览、导出共用同一份 HTML，保证所见即所得。
 */
export function ResumePagePreview({ html, paperSize, orientation, failed = false, className = '' }: Props) {
  const t = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.16)
  const paper = useMemo(() => resolvePaper(paperSize, orientation), [paperSize, orientation])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      if (w > 0) setScale(w / paper.pxW)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [paper.pxW])

  // 与模板卡片一致：注入的样式禁止滚动条，且不参与模板 CSS 布局
  const srcDoc = useMemo(
    () => (html ? html.replace('<head>', '<head><style>html{overflow:hidden}</style>') : ''),
    [html],
  )

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-surface-100 ${className}`}
      style={{ aspectRatio: `${paper.mmW} / ${paper.mmH}` }}
    >
      {srcDoc ? (
        <iframe
          srcDoc={srcDoc}
          className="absolute border-0 pointer-events-none"
          style={{
            width: paper.pxW,
            height: paper.pxH,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
          title="resume-preview"
        />
      ) : failed ? (
        <div className="absolute inset-0 flex items-center justify-center px-2 text-center">
          <span className="text-xs text-surface-400">{t('previewUnavailable')}</span>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-surface-200 border-t-surface-400 animate-spin" />
        </div>
      )}
    </div>
  )
}
