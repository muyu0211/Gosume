import { useEditorStore } from '../../stores/editorStore'
import { useResumeStore } from '../../stores/resumeStore'
import { Save, FileOutput, ZoomIn, ZoomOut, RotateCcw, Home, Loader2, Check, Pencil } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState, useCallback, useRef, useEffect } from 'react'
import { TemplateSwitcher } from '../template/TemplateSwitcher'

interface ToolbarProps {
  onSave: () => void
  onExport: () => void
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
}

export function Toolbar({ onSave, onExport, saveStatus = 'idle' }: ToolbarProps) {
  const navigate = useNavigate()
  const zoom = useEditorStore((s) => s.zoom)
  const setZoom = useEditorStore((s) => s.setZoom)
  const isDirty = useResumeStore((s) => s.isDirty)
  const resume = useResumeStore((s) => s.resume)
  const updateField = useResumeStore((s) => s.updateField)
  const clearResume = useResumeStore((s) => s.clearResume)

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
    <div className="h-12 flex items-center gap-1 px-3 bg-white border-b border-slate-200 flex-shrink-0">
      {/* Left */}
      <div className="flex items-center gap-1">
        <button onClick={() => { clearResume(); navigate('/') }} className="btn-ghost btn-sm" title="返回首页">
          <Home className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-slate-200 mx-1" />

        <button
          onClick={onSave}
          disabled={saveStatus === 'saving'}
          className="btn-primary btn-sm"
          title="保存 (Ctrl+S)"
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

        <button onClick={onExport} className="btn-secondary btn-sm" title="导出 (Ctrl+E)">
          <FileOutput className="w-4 h-4" />
          <span className="hidden sm:inline">导出</span>
        </button>
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
            className="text-xs font-medium text-slate-700 bg-slate-100 border border-primary-300 rounded px-2 py-1 w-48 outline-none focus:border-primary-500"
            placeholder="输入项目名称..."
          />
        ) : (
          <button
            onClick={startEditing}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors max-w-[200px] truncate"
            title="点击编辑项目名称"
          >
            <span className="truncate">{projectName || '未命名项目'}</span>
            <Pencil className="w-3 h-3 flex-shrink-0 opacity-50" />
          </button>
        )}
      </div>

      {/* Center - Zoom Controls */}
      <div className="flex items-center gap-1 mx-auto">
        <button onClick={() => setZoom(zoom - 0.1)} className="btn-ghost btn-xs" title="缩小">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs text-slate-500 min-w-[42px] text-center tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => setZoom(zoom + 0.1)} className="btn-ghost btn-xs" title="放大">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setZoom(1.0)} className="btn-ghost btn-xs" title="重置">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1">
        <TemplateSwitcher />
      </div>
    </div>
  )
}
