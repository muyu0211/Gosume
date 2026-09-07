import { useState } from 'react'
import { Camera, Image as ImageIcon, ClipboardCheck, Type } from 'lucide-react'
import { IdPhotoTool } from './IdPhotoTool'

const CATALOG: Array<{
  id: string
  title: string
  desc: string
  active: boolean
  Icon: typeof Camera
}> = [
  { id: 'photo', title: '证件照工具包', desc: '照片压缩、尺寸裁剪、纯色换底', active: true, Icon: Camera },
  { id: 'image', title: '图片工具', desc: '格式转换、裁剪、清除隐私信息', active: false, Icon: ImageIcon },
  { id: 'healthCheck', title: '简历体检', desc: 'PDF 压缩、ATS 可解析性检查', active: false, Icon: ClipboardCheck },
  { id: 'text', title: '文本工具', desc: '字数统计、错别字与敏感词扫描', active: false, Icon: Type },
]

export function ToolsPanel() {
  const [open, setOpen] = useState('')

  if (open === 'photo') {
    return <IdPhotoTool onBack={() => setOpen('')} />
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-page-enter">
      {CATALOG.map(({ id, title, desc, active, Icon }) => (
        <button
          key={id}
          onClick={() => active && setOpen(id)}
          disabled={!active}
          className={`flex flex-col items-start gap-2 p-4 rounded-lg border text-left transition-all duration-150 ${
            active
              ? 'border-surface-200 hover:bg-surface-50 hover:border-surface-300 hover:scale-[1.03] hover:shadow-sm cursor-pointer active:scale-[0.98]'
              : 'border-surface-100 opacity-60 cursor-not-allowed'
          }`}
        >
          <span className={`p-2 rounded-md bg-surface-100 ${active ? 'text-primary-600' : 'text-surface-400'}`}>
            <Icon className="w-5 h-5" />
          </span>
          <span className="text-sm font-medium text-surface-700">{title}</span>
          <span className="text-xs text-surface-400">{desc}</span>
          {!active && (
            <span className="mt-1 text-[11px] px-1.5 py-0.5 rounded bg-surface-100 text-surface-400">
              敬请期待
            </span>
          )}
        </button>
      ))}
    </div>
  )
}