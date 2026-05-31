import { useResumeStore } from '../../stores/resumeStore'
import { useTemplateStore } from '../../stores/templateStore'
import { Circle, FileText } from 'lucide-react'

interface StatusBarProps {
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
}

export function StatusBar({ saveStatus = 'idle' }: StatusBarProps) {
  const isDirty = useResumeStore((s) => s.isDirty)
  const resume = useResumeStore((s) => s.resume)
  const templates = useTemplateStore((s) => s.templates)
  const activeTemplateId = useTemplateStore((s) => s.activeTemplateId)

  const activeTemplate = templates.find((t) => t.id === activeTemplateId)
  const jobCount = resume?.jobs?.length || 0
  const skillCount = resume?.skills?.reduce((sum, g) => sum + g.items.length, 0) || 0

  const statusText =
    saveStatus === 'saving' ? '保存中...' :
    saveStatus === 'saved' ? '已保存' :
    saveStatus === 'error' ? '保存失败' :
    isDirty ? '未保存' : '已保存'

  const statusColor =
    saveStatus === 'saving' ? 'text-blue-400 fill-blue-400' :
    saveStatus === 'saved' ? 'text-green-400 fill-green-400' :
    saveStatus === 'error' ? 'text-red-400 fill-red-400' :
    isDirty ? 'text-yellow-400 fill-yellow-400' : 'text-green-400 fill-green-400'

  return (
    <div className="h-7 flex items-center justify-between px-3 bg-surface-800 text-surface-400 text-xs flex-shrink-0 select-none">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Circle className={`w-2 h-2 ${statusColor}`} />
          <span>{statusText}</span>
        </div>
        <span>|</span>
        <span>{activeTemplate?.name || '现代专业风'}</span>
      </div>
      <div className="flex items-center gap-3">
        {jobCount > 0 && (
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {jobCount} 段经历
          </span>
        )}
        {skillCount > 0 && <span>{skillCount} 项技能</span>}
        <span>|</span>
        <span>Gosume v1.0.0</span>
      </div>
    </div>
  )
}
