import { useEditorStore } from '../../stores/editorStore'
import { PersonalSection } from './PersonalSection'
import { SummarySection } from './SummarySection'
import { ExperienceSection } from './ExperienceSection'
import { EducationSection } from './EducationSection'
import { SkillSection } from './SkillSection'
import { LanguageSection } from './LanguageSection'
import { AwardSection } from './AwardSection'

export function EditorPanel() {
  const activeSection = useEditorStore((s) => s.activeSection)

  const renderSection = () => {
    switch (activeSection) {
      case 'personal':
        return <PersonalSection />
      case 'summary':
        return <SummarySection />
      case 'jobs':
        return <ExperienceSection type="jobs" title="工作经历" />
      case 'education':
        return <EducationSection />
      case 'skills':
        return <SkillSection />
      case 'projects':
        return <ExperienceSection type="projects" title="项目经历" />
      case 'languages':
        return <LanguageSection />
      case 'awards':
        return <AwardSection />
      case 'custom':
        return (
          <div className="form-section">
            <div className="text-center py-8 text-slate-400 text-sm">
              此模块将在后续版本中提供
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-2" key={activeSection}>
      <div className="animate-section-enter">
        {renderSection()}
      </div>
    </div>
  )
}
