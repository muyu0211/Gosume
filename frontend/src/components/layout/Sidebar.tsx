import { useEditorStore } from '../../stores/editorStore'
import { User, Briefcase, GraduationCap, Code, FolderGit2, Languages, Award, Plus, FileOutput } from 'lucide-react'

const sections = [
  { id: 'personal', label: '个人信息', icon: User },
  { id: 'summary', label: '个人总结', icon: FileOutput },
  { id: 'jobs', label: '工作经历', icon: Briefcase },
  { id: 'education', label: '教育背景', icon: GraduationCap },
  { id: 'skills', label: '技能', icon: Code },
  { id: 'projects', label: '项目经历', icon: FolderGit2 },
  { id: 'languages', label: '语言能力', icon: Languages },
  { id: 'awards', label: '奖项荣誉', icon: Award },
  { id: 'custom', label: '自定义', icon: Plus },
]

interface SidebarProps {
  onExport: () => void
}

export function Sidebar({ onExport }: SidebarProps) {
  const activeSection = useEditorStore((s) => s.activeSection)
  const setActiveSection = useEditorStore((s) => s.setActiveSection)

  return (
    <div className="w-[56px] bg-surface-800 flex flex-col items-center py-3 gap-1 flex-shrink-0">
      {sections.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setActiveSection(id)}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors group relative ${
            activeSection === id
              ? 'bg-primary-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-surface-700'
          }`}
          title={label}
        >
          <Icon className="w-5 h-5" />
          {/* Tooltip */}
          <span className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
            {label}
          </span>
        </button>
      ))}

      <div className="mt-auto mb-2 pt-2 border-t border-surface-700">
        <button
          onClick={onExport}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          title="导出简历"
        >
          <FileOutput className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
