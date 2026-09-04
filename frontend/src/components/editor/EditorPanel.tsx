import { useEditorStore } from '../../stores/editorStore'
import { useResumeStore } from '../../stores/resumeStore'
import { getSectionTitle } from '../../lib/resumeSections'
import { PersonalSection } from './PersonalSection'
import { SummarySection } from './SummarySection'
import { ExperienceSection } from './ExperienceSection'
import { EducationSection } from './EducationSection'
import { SkillSection } from './SkillSection'
import { LanguageSection } from './LanguageSection'
import { AwardSection } from './AwardSection'
import { CustomSection } from './CustomSection'

export function EditorPanel() {
  const activeSection = useEditorStore((s) => s.activeSection)
  const language = useResumeStore((s) => s.resume?.meta?.language)

  const renderSection = () => {
    switch (activeSection) {
      case 'personal':
        return <PersonalSection />
      case 'summary':
        return <SummarySection />
      case 'internships':
        return <ExperienceSection type="internships" title={getSectionTitle('internships', language)} />
      case 'jobs':
        return <ExperienceSection type="jobs" title={getSectionTitle('jobs', language)} />
      case 'education':
        return <EducationSection />
      case 'skills':
        return <SkillSection />
      case 'projects':
        return <ExperienceSection type="projects" title={getSectionTitle('projects', language)} />
      case 'languages':
        return <LanguageSection />
      case 'awards':
        return <AwardSection />
      case 'custom':
        return <CustomSection />
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
