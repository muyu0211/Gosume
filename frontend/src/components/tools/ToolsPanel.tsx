import { useState } from 'react'
import { Camera } from 'lucide-react'
import { IdPhotoTool } from './IdPhotoTool'
import { useT } from '../../lib/i18n'

const CATALOG = [{ id: 'photo', titleKey: 'idPhotoTool', descKey: 'idPhotoToolDesc', Icon: Camera }] as const

export function ToolsPanel() {
  const [open, setOpen] = useState('')
  const t = useT()

  if (open === 'photo') {
    return <IdPhotoTool onBack={() => setOpen('')} />
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-page-enter">
      {CATALOG.map(({ id, titleKey, descKey, Icon }) => (
        <button
          key={id}
          onClick={() => setOpen(id)}
          className="glass glass-card hover-lift flex flex-col items-start gap-2 p-4 text-left cursor-pointer active:scale-[0.98]"
        >
          <span className="p-2 rounded-md bg-surface-100 text-primary-600">
            <Icon className="size-icon-lg" />
          </span>
          <span className="text-sm font-medium text-surface-700">{t(titleKey)}</span>
          <span className="text-xs text-surface-400">{t(descKey)}</span>
        </button>
      ))}
    </div>
  )
}