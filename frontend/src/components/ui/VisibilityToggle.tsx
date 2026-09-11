import { Eye, EyeOff } from 'lucide-react'
import { useT } from '../../lib/i18n'
import { Tooltip } from './Tooltip'

interface VisibilityToggleProps {
  /** 当前是否隐藏。 */
  hidden: boolean
  /** 切换回调（组件内部已 stopPropagation，防止冒泡触发外层展开/删除）。 */
  onToggle: () => void
  title?: string
  /** 追加样式（如对齐类）。 */
  className?: string
}

/** 隐藏/显示切换按钮（眼睛图标，替代旧复选框）：显示状态=Eye，隐藏状态=EyeOff。
   点按切换隐藏状态，未隐藏时悬停加深提示可隐藏，隐藏时高亮底纹提示可恢复。
   纯图标按钮 → 提示统一用 Tooltip（禁用原生 title）。 */
export function VisibilityToggle({ hidden, onToggle, title, className = '' }: VisibilityToggleProps) {
  const t = useT()
  const label = title ?? (hidden ? t('unhideHint') : t('hideNotShow'))
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        className={`inline-flex items-center justify-center p-1 rounded-md transition-colors ${
          hidden
            ? 'text-surface-500 hover:text-surface-700 bg-surface-200'
            : 'text-surface-400 hover:text-surface-600 hover:bg-surface-100'
        } ${className}`}
      >
        {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </Tooltip>
  )
}
