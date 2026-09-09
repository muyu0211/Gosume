import { useResumeStore, type ItemDeleteKind, type PendingItemDelete } from '../../stores/resumeStore'
import { useAppStore } from '../../stores/appStore'
import { getSectionTitle } from '../../lib/resumeSections'
import { useT } from '../../lib/i18n'
import { ConfirmDialog } from '../ui/ConfirmDialog'

/** 删除条目种类 → 板块 id（用于 getSectionTitle 取实际模块标题）。 */
const KIND_SECTION_ID: Record<ItemDeleteKind, string> = {
  internship: 'internships',
  job: 'jobs',
  education: 'education',
  skill: 'skills',
  project: 'projects',
  language: 'languages',
  award: 'awards',
  custom: 'custom',
}

/** 待删除目标 → 确认文案主体（板块名取自 getSectionTitle，不写死；语言用应用语言）。 */
function describeTarget(pending: PendingItemDelete, language: string, tt: (k: string) => string): string {
  switch (pending.type) {
    case 'item': {
      const base = getSectionTitle(KIND_SECTION_ID[pending.kind], language)
      const label =
        pending.kind === 'skill' ? `${base}${tt('groupSuffix')}` :
        pending.kind === 'custom' ? `${base}${tt('moduleSuffix')}` : base
      return `${tt('thisItem')}${label}`
    }
    case 'skillItem':
      return tt('thisSkill')
    case 'highlight':
      return tt('thisHighlight')
    case 'extra':
      return tt('thisExtra')
    case 'customItem':
      return tt('thisCustomItem')
    case 'customHighlight':
      return tt('thisHighlight')
  }
}

/**
 * 简历条目（含二级子项）的删除二次确认弹窗。
 *
 * 由 resumeStore 的 pendingItemDelete 驱动：各类删除按钮调用对应的 request*
 * 后，若非「本次不再提示」状态，则在这里弹出确认；勾选「本次不再提示」后，
 * 本次应用会话内删除条目/子项将直接执行，不再弹窗。
 */
export function ItemDeleteConfirmDialog() {
  const pending = useResumeStore((s) => s.pendingItemDelete)
  const skip = useResumeStore((s) => s.skipItemDeleteConfirm)
  const setSkip = useResumeStore((s) => s.setSkipItemDeleteConfirm)
  const confirm = useResumeStore((s) => s.confirmItemDelete)
  const cancel = useResumeStore((s) => s.cancelItemDelete)
  const language = useAppStore((s) => s.language)
  const t = useT()

  return (
    <ConfirmDialog
      open={!!pending}
      title={t('deleteConfirmTitle')}
      description={pending ? `${t('deleteConfirmPrefix')}${describeTarget(pending, language, t)}${t('deleteConfirmSuffix')}` : ''}
      confirmText={t('delete')}
      cancelText={t('cancel')}
      danger
      showDontAskAgain
      dontAskAgain={skip}
      onDontAskAgainChange={setSkip}
      onConfirm={confirm}
      onCancel={cancel}
    />
  )
}
