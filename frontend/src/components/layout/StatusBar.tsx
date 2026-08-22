import { useResumeStore } from '../../stores/resumeStore'
import { useTemplateStore } from '../../stores/templateStore'
import { Circle, FileText, Ruler } from 'lucide-react'
import { getTemplatePaper, contentHeightRatio, ratioLevel } from '../../lib/contentHeight'

interface StatusBarProps {
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
}

export function StatusBar({ saveStatus = 'idle' }: StatusBarProps) {
  const isDirty = useResumeStore((s) => s.isDirty)
  const resume = useResumeStore((s) => s.resume)
  const contentHeight = useResumeStore((s) => s.contentHeight)
  const templates = useTemplateStore((s) => s.templates)
  const activeTemplateId = useTemplateStore((s) => s.activeTemplateId)

  const activeTemplate = templates.find((t) => t.id === activeTemplateId)
  const jobCount = resume?.jobs?.length || 0
  const skillCount = resume?.skills?.reduce((sum, g) => sum + g.items.length, 0) || 0

  // 基准纸张：优先取当前模板的纸张规格（与后端测量时的排版宽度一致），
  // 拿不到时回退 A4。
  const paper = getTemplatePaper(activeTemplate?.paper_size, activeTemplate?.orientations?.[0])

  const heightRatio = contentHeightRatio(contentHeight, paper)
  const level = heightRatio == null ? null : ratioLevel(heightRatio)

  const heightColor =
    level == null ? '' :
    level === 'over' ? 'text-red-500' :
    level === 'ok' ? 'text-amber-500' : 'text-emerald-500'

  const heightTip =
    heightRatio == null ? '' :
    level === 'over'
      ? `当前内容高度 ${contentHeight}px，约一页纸的 ${Math.round(heightRatio * 100)}%，超出较多，导出为一页 PDF 会使内容过小`
      : level === 'ok'
      ? `当前内容高度 ${contentHeight}px，约一页纸的 ${Math.round(heightRatio * 100)}%，略超一页，仍适合导出为一页 PDF`
      : `当前内容高度 ${contentHeight}px，约一页纸的 ${Math.round(heightRatio * 100)}%，一页即可完整放下`

  const statusText =
    saveStatus === 'saving' ? '保存中...' :
    saveStatus === 'saved' ? '已保存' :
    saveStatus === 'error' ? '保存失败' :
    isDirty ? '未保存' : '已保存'

  const statusColor =
    saveStatus === 'saving' ? 'text-blue-500 fill-blue-500' :
    saveStatus === 'saved' ? 'text-emerald-500 fill-emerald-500' :
    saveStatus === 'error' ? 'text-red-500 fill-red-500' :
    isDirty ? 'text-amber-500 fill-amber-500' : 'text-emerald-500 fill-emerald-500'

  return (
    <div className="h-7 flex items-center justify-between px-3 bg-surface-100 text-surface-400 text-xs flex-shrink-0 select-none border-t border-surface-200">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Circle className={`w-2 h-2 ${statusColor}`} />
          <span className="text-surface-500">{statusText}</span>
        </div>
        <span className="text-surface-300">|</span>
        <span className="text-surface-500">{activeTemplate?.name || '现代专业风'}</span>
      </div>
      <div className="flex items-center gap-3">
        {heightRatio != null && (
          <span
            className={`flex items-center gap-1 ${heightColor}`}
            title={heightTip}
          >
            <Ruler className="w-3 h-3" />
            内容 {Math.round(heightRatio * 100)}%
          </span>
        )}
        {jobCount > 0 && (
          <span className="flex items-center gap-1 text-surface-500">
            <FileText className="w-3 h-3" />
            {jobCount} 段经历
          </span>
        )}
        {skillCount > 0 && <span className="text-surface-500">{skillCount} 项技能</span>}
        <span className="text-surface-300">|</span>
        <span className="text-surface-500">Gosume v1.0.0</span>
      </div>
    </div>
  )
}
