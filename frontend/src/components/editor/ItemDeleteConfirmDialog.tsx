import { useResumeStore, type ItemDeleteKind, type PendingItemDelete } from '../../stores/resumeStore'
import { ConfirmDialog } from '../ui/ConfirmDialog'

/** 顶层条目类型 → 展示文案。 */
const KIND_LABELS: Record<ItemDeleteKind, string> = {
  internship: '实习经历',
  job: '工作经历',
  education: '教育经历',
  skill: '技能分组',
  project: '项目经历',
  language: '语言能力',
  award: '奖项荣誉',
  custom: '自定义模块',
}

/** 待删除目标 → 确认文案主体。 */
function describeTarget(pending: PendingItemDelete): string {
  switch (pending.type) {
    case 'item':
      return `这条${KIND_LABELS[pending.kind]}`
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

  return (
    <ConfirmDialog
      open={!!pending}
      title="确认删除"
      description={pending ? `确定要删除${describeTarget(pending)}吗？此操作不可撤销。` : ''}
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
