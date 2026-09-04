import { useResumeStore, type ItemDeleteKind, type PendingItemDelete } from '../../stores/resumeStore'
import { getSectionTitle } from '../../lib/resumeSections'
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

/** 待删除目标 → 确认文案主体（板块名取自 getSectionTitle，不写死）。 */
function describeTarget(pending: PendingItemDelete, language?: string): string {
  switch (pending.type) {
    case 'item': {
      const base = getSectionTitle(KIND_SECTION_ID[pending.kind], language)
      const label =
        pending.kind === 'skill' ? `${base}分组` :
        pending.kind === 'custom' ? `${base}模块` : base
      return `这条${label}`
    }
    case 'skillItem':
      return '这个技能'
    case 'highlight':
      return '这条关键亮点'
    case 'extra':
      return '这个扩展字段'
    case 'customItem':
      return '这个自定义条目'
    case 'customHighlight':
      return '这条关键亮点'
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
  const language = useResumeStore((s) => s.resume?.meta?.language)

  return (
    <ConfirmDialog
      open={!!pending}
      title="确认删除"
      description={pending ? `确定要删除${describeTarget(pending, language)}吗？此操作不可撤销。` : ''}
      confirmText="删除"
      cancelText="取消"
      danger
      showDontAskAgain
      dontAskAgain={skip}
      onDontAskAgainChange={setSkip}
      onConfirm={confirm}
      onCancel={cancel}
    />
  )
}
