import { useEditorStore } from '../../stores/editorStore'
import { User, Briefcase, GraduationCap, Code, FolderGit2, Languages, Award, Plus, FileOutput, Building } from 'lucide-react'

const sections = [
  { id: 'personal', label: '个人信息', icon: User },
  { id: 'education', label: '教育背景', icon: GraduationCap },
  { id: 'internships', label: '实习经历', icon: Building },
  { id: 'jobs', label: '工作经历', icon: Briefcase },
  { id: 'projects', label: '项目经历', icon: FolderGit2 },
  { id: 'awards', label: '荣誉奖项', icon: Award },
  { id: 'languages', label: '语言能力', icon: Languages },
  { id: 'skills', label: '技能', icon: Code },
  { id: 'summary', label: '个人总结', icon: FileOutput },
  { id: 'custom', label: '自定义', icon: Plus },
]

interface SidebarProps {
  onExport: () => void
}

export function Sidebar({ onExport }: SidebarProps) {
  const activeSection = useEditorStore((s) => s.activeSection)
  const setActiveSection = useEditorStore((s) => s.setActiveSection)

  return (
    <div className="w-[56px] bg-surface-100 flex flex-col items-center py-3 gap-0.5 flex-shrink-0 border-r border-surface-200">
      {sections.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setActiveSection(id)}
          className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-150 group relative ${
            activeSection === id
              ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/25'
              : 'text-surface-400 hover:text-surface-600 hover:bg-surface-200'
          }`}
          title={label}
        >
          <Icon className="w-4.5 h-4.5" strokeWidth={activeSection === id ? 2.25 : 1.75} />
          {/* Tooltip */}
          <span className="absolute left-full ml-2.5 px-2.5 py-1.5 bg-surface-800 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity duration-150 shadow-lg">
            {label}
          </span>
        </button>
      ))}

      <div className="mt-auto mb-2 pt-2 border-t border-surface-200">
        <button
          onClick={onExport}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary-600 text-white hover:bg-primary-700 transition-all duration-150 shadow-sm shadow-primary-600/25"
          title="导出简历"
        >
          <FileOutput className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
