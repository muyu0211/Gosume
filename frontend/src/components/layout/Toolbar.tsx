import { useEditorStore } from '../../stores/editorStore'
import { useResumeStore } from '../../stores/resumeStore'
import { Save, FileOutput, ZoomIn, ZoomOut, RotateCcw, Home, Loader2, Check, Pencil } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState, useCallback, useRef, useEffect } from 'react'
import { TemplateSwitcher } from '../template/TemplateSwitcher'
import { LayoutPopover } from './LayoutPopover'
import { Tooltip } from '../ui/Tooltip'

interface ToolbarProps {
  onSave: () => void
  onExport: () => void
  /** 返回首页；由调用方负责未保存守卫（无则直接返回）。 */
  onHome?: () => void
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
}

export function Toolbar({ onSave, onExport, onHome, saveStatus = 'idle' }: ToolbarProps) {
  const navigate = useNavigate()
  const zoom = useEditorStore((s) => s.zoom)
  const setZoom = useEditorStore((s) => s.setZoom)
  const isDirty = useResumeStore((s) => s.isDirty)
  const resume = useResumeStore((s) => s.resume)
  const updateField = useResumeStore((s) => s.updateField)

  const projectName = resume?.meta?.name || ''
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(projectName)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [editingName])

  const startEditing = useCallback(() => {
    setNameDraft(projectName)
    setEditingName(true)
  }, [projectName])

  const commitName = useCallback(() => {
    const trimmed = nameDraft.trim()
    if (trimmed !== projectName) {
      updateField('meta.name', trimmed)
    }
    setEditingName(false)
  }, [nameDraft, projectName, updateField])

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitName()
    } else if (e.key === 'Escape') {
      setEditingName(false)
    }
  }, [commitName])

  return (
    <div className="h-12 flex items-center gap-1 px-3 bg-elev/80 backdrop-blur-sm border-b border-surface-100 flex-shrink-0 relative z-10">
      {/* Left */}
      <div className="flex items-center gap-1">
        <Tooltip label="返回首页">
          <button
            onClick={() => (onHome ?? (() => navigate('/')))()}
            className="btn-ghost btn-sm"
          >
            <Home className="w-4 h-4" />
          </button>
        </Tooltip>
        <div className="w-px h-5 bg-surface-200 mx-1" />

        <Tooltip label="保存 (Ctrl+S)">
          <button
            onClick={onSave}
            disabled={saveStatus === 'saving'}
            className="btn-primary btn-sm"
          >
            {saveStatus === 'saving' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saveStatus === 'saved' ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">
              {saveStatus === 'saving' ? '保存中...' : saveStatus === 'saved' ? '已保存' : saveStatus === 'error' ? '保存失败' : '保存'}
            </span>
            {isDirty && saveStatus === 'idle' && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
          </button>
        </Tooltip>

        <Tooltip label="导出 (Ctrl+E)">
          <button onClick={onExport} className="btn-secondary btn-sm">
            <FileOutput className="w-4 h-4" />
            <span className="hidden sm:inline">导出</span>
          </button>
        </Tooltip>
      </div>

      {/* Project Name */}
      <div className="flex items-center gap-1 ml-4">
        {editingName ? (
          <input
            ref={nameInputRef}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={handleNameKeyDown}
            className="text-xs font-medium text-surface-700 bg-surface-100 border border-primary-300 rounded px-2 py-1 w-48 outline-none focus:border-primary-500"
            placeholder="输入项目名称..."
          />
        ) : (
          <Tooltip label="点击编辑项目名称">
            <button
              onClick={startEditing}
              className="flex items-center gap-1 text-xs text-surface-500 hover:text-surface-700 transition-colors max-w-[200px] truncate"
            >
              <span className="truncate">{projectName || '未命名项目'}</span>
              <Pencil className="w-3 h-3 flex-shrink-0 opacity-50" />
            </button>
          </Tooltip>
        )}
      </div>

      {/* Center - Zoom Controls
          绝对居中脱离 flex 流，不受左侧（保存/导出/项目名）与右侧组宽度变化影响，
          始终稳定在 toolbar 水平正中央。toolbar 容器已设 relative。 */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1">
        <Tooltip label="缩小">
          <button onClick={() => setZoom(zoom - 0.1)} className="btn-ghost btn-xs">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
        </Tooltip>
        <span className="text-xs text-surface-500 min-w-[42px] text-center tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <Tooltip label="放大">
          <button onClick={() => setZoom(zoom + 0.1)} className="btn-ghost btn-xs">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </Tooltip>
        <Tooltip label="重置">
          <button onClick={() => setZoom(1.0)} className="btn-ghost btn-xs">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </Tooltip>
      </div>

      {/* Right — ml-auto 让它独立推到右端（缩放组已脱离 flex 流不再推它） */}
      <div className="flex items-center gap-1 ml-auto">
        <LayoutPopover />
        <TemplateSwitcher />
      </div>
    </div>
  )
}
