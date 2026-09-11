import { useEditorStore } from '../../stores/editorStore'
import { useResumeStore } from '../../stores/resumeStore'
import { Save, FileOutput, ZoomIn, ZoomOut, RotateCcw, Home, Loader2, Check, Pencil, PanelRightOpen, PanelRightClose, Palette, Contrast, Languages } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState, useCallback, useRef, useEffect } from 'react'
import { TemplateSwitcher } from '../template/TemplateSwitcher'
import { Tooltip } from '../ui/Tooltip'
import { useT } from '../../lib/i18n'

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
  const stylePanelOpen = useEditorStore((s) => s.stylePanelOpen)
  const toggleStylePanel = useEditorStore((s) => s.toggleStylePanel)
  const grayscale = useEditorStore((s) => s.grayscale)
  const toggleGrayscale = useEditorStore((s) => s.toggleGrayscale)
  const isDirty = useResumeStore((s) => s.isDirty)
  const resume = useResumeStore((s) => s.resume)
  const updateField = useResumeStore((s) => s.updateField)
  const t = useT()

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
        <Tooltip label={t('backHome')}>
          <button
            onClick={() => (onHome ?? (() => navigate('/')))()}
            className="btn-ghost btn-sm"
          >
            <Home className="w-4 h-4" />
          </button>
        </Tooltip>
        <div className="w-px h-5 bg-surface-200 mx-1" />

        <Tooltip label={t('saveWith')}>
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
              {saveStatus === 'saving' ? t('saving') : saveStatus === 'saved' ? t('saved') : saveStatus === 'error' ? t('saveError') : t('save')}
            </span>
            {isDirty && saveStatus === 'idle' && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
          </button>
        </Tooltip>

        <Tooltip label={t('exportWith')}>
          <button onClick={onExport} className="btn-secondary btn-sm">
            <FileOutput className="w-4 h-4" />
            <span className="hidden sm:inline">{t('export')}</span>
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
            placeholder={t('namePlaceholder')}
          />
        ) : (
          <Tooltip label={t('editName')}>
            <button
              onClick={startEditing}
              className="flex items-center gap-1 text-xs text-surface-500 hover:text-surface-700 transition-colors max-w-[200px] truncate"
            >
              <span className="truncate">{projectName || t('untitledProject')}</span>
              <Pencil className="w-3 h-3 flex-shrink-0 opacity-50" />
            </button>
          </Tooltip>
        )}
      </div>

      {/* Center - Zoom Controls
          绝对居中脱离 flex 流，不受左侧（保存/导出/项目名）与右侧组宽度变化影响，
          始终稳定在 toolbar 水平正中央。toolbar 容器已设 relative。 */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1">
        <Tooltip label={t('zoomOut')}>
          <button onClick={() => setZoom(zoom - 0.1)} className="btn-ghost btn-xs">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
        </Tooltip>
        <span className="text-xs text-surface-500 min-w-[42px] text-center tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <Tooltip label={t('zoomIn')}>
          <button onClick={() => setZoom(zoom + 0.1)} className="btn-ghost btn-xs">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </Tooltip>
        <Tooltip label={t('zoomReset')}>
          <button onClick={() => setZoom(1.0)} className="btn-ghost btn-xs">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </Tooltip>
      </div>

      {/* Right — ml-auto 让它独立推到右端（缩放组已脱离 flex 流不再推它） */}
      <div className="flex items-center gap-1 ml-auto">
        <TemplateSwitcher />
        {/* 中英一键切换：翻转简历语言，模板章节标题与编辑器板块名随 .Meta.Language 本地化 */}
        <button
          onClick={() => updateField('meta.language', (resume?.meta?.language || 'zh-CN') === 'zh-CN' ? 'en-US' : 'zh-CN')}
          className="btn-ghost btn-sm inline-flex items-center gap-1"
          title={t('toggleLanguage')}
        >
          <Languages className="w-4 h-4" />
          <span className="text-xs">{resume?.meta?.language === 'en-US' ? 'English' : '中文'}</span>
        </button>
        <Tooltip label={grayscale ? t('grayscaleOff') : t('grayscaleOn')}>
          <button
            onClick={toggleGrayscale}
            className={`btn-ghost btn-sm ${grayscale ? 'bg-surface-100 text-primary-600' : ''}`}
          >
            {grayscale ? <Contrast className="w-4 h-4" /> : <Palette className="w-4 h-4" />}
          </button>
        </Tooltip>
        <Tooltip label={stylePanelOpen ? t('panelCollapse') : t('panelExpand')}>
          <button
            onClick={toggleStylePanel}
            className={`btn-ghost btn-sm ${stylePanelOpen ? 'bg-surface-100 text-primary-600' : ''}`}
          >
            {stylePanelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
