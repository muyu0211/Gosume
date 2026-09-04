import { useEditorStore } from '../../stores/editorStore'
import { useResumeStore } from '../../stores/resumeStore'
import { getSectionTitle } from '../../lib/resumeSections'
import { User, Briefcase, GraduationCap, Code, FolderGit2, Languages, Award, Plus, FileOutput, Building } from 'lucide-react'
import { Tooltip } from '../ui/Tooltip'

/** 导航项：模块 id + 图标；label 由 getSectionTitle 按简历语言生成，不写死。 */
const sections = [
  { id: 'personal', icon: User },
  { id: 'education', icon: GraduationCap },
  { id: 'internships', icon: Building },
  { id: 'jobs', icon: Briefcase },
  { id: 'projects', icon: FolderGit2 },
  { id: 'awards', icon: Award },
  { id: 'languages', icon: Languages },
  { id: 'skills', icon: Code },
  { id: 'summary', icon: FileOutput },
  { id: 'custom', icon: Plus },
]

interface SidebarProps {
  onExport: () => void
}

export function Sidebar({ onExport }: SidebarProps) {
  const activeSection = useEditorStore((s) => s.activeSection)
  const setActiveSection = useEditorStore((s) => s.setActiveSection)
  // 预览点击跳转产生的闪烁信号：命中激活 tab 时叠加闪烁动画提醒用户已跳转。
  const flashSection = useEditorStore((s) => s.flashSection)
  const flashNonce = useEditorStore((s) => s.flashNonce)
  const language = useResumeStore((s) => s.resume?.meta?.language)

  return (
    <div className="w-[56px] bg-surface-100 flex flex-col items-center py-3 gap-0.5 flex-shrink-0 border-r border-surface-200">
      {sections.map(({ id, icon: Icon }) => {
        const label = getSectionTitle(id, language)
        const isActive = activeSection === id
        const isFlash = isActive && flashSection === id
        return (
          <button
            key={isFlash ? `flash-${flashNonce}` : id}
            onClick={() => setActiveSection(id)}
            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-150 group relative ${
              isActive
                ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/25'
                : 'text-surface-400 hover:text-surface-600 hover:bg-surface-200'
            } ${isFlash ? 'animate-tab-blink' : ''}`}
          >
            <Icon className="w-4.5 h-4.5" strokeWidth={isActive ? 2.25 : 1.75} />
            {/* Tooltip */}
            <span className="absolute left-full ml-2.5 px-2.5 py-1.5 bg-elev text-surface-700 border border-surface-200 text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity duration-150 shadow-lg">
              {label}
            </span>
          </button>
        )
      })}

      <div className="mt-auto mb-2 pt-2 border-t border-surface-200">
        {/* 导出按钮位于侧边栏最底部，Tooltip 用右侧定位，避免默认 bottom 被窗口底边裁切 */}
        <Tooltip label="导出简历" side="right">
          <button
            onClick={onExport}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary-600 text-white hover:bg-primary-700 transition-all duration-150 shadow-sm shadow-primary-600/25"
          >
            <FileOutput className="w-5 h-5" />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
