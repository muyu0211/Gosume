import { useState } from 'react'
import { useResumeStore } from '../../stores/resumeStore'
import type { CustomSection as CustomSectionModel, CustomItem } from '../../types/resume'
import { Plus, Trash2, ChevronDown, ChevronRight, Layers, GripVertical, EyeOff } from 'lucide-react'
import { MonthPicker } from '../ui/MonthPicker'
import { VisibilityToggle } from '../ui/VisibilityToggle'
import { RichTextField } from '../ui/RichTextField'
import { useDragReorder } from '../../hooks/useDragReorder'
import { getSectionTitle } from '../../lib/resumeSections'

/**
 * 自定义模块编辑器（编辑页左侧「自定义」板块）。
 *
 * 两级结构：
 * - 模块（CustomSection）：模块名（纯文本）+ 一组条目，支持增删/排序/显示隐藏，渲染为 .section-title；
 * - 条目（CustomItem）：标题（行内富文本）+ 副标题 + 日期 + 内容（block 富文本）+ 关键亮点。
 * 交互与 ExperienceSection / AwardSection 保持一致（折叠态头部 + 展开表单 + 拖拽排序 + 显示开关 + 删除二确）。
 */
export function CustomSection() {
  const language = useResumeStore((s) => s.resume?.meta?.language)
  const sections = useResumeStore((s) => s.resume?.custom) || []
  const addSection = useResumeStore((s) => s.addCustomSection)
  const updateSection = useResumeStore((s) => s.updateCustomSection)
  const requestDelete = useResumeStore((s) => s.requestItemDelete)
  const moveSection = useResumeStore((s) => s.moveCustomSection)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  const { draggedIdx, overIdx, onDragStart, onDragOver, onDrop, onDragEnd } = useDragReorder(moveSection)

  const toggle = (idx: number) =>
    setExpanded((prev) => {
      const current = prev[idx] ?? (idx === sections.length - 1 && sections.length <= 2)
      return { ...prev, [idx]: !current }
    })

  return (
    <div className="form-section">
      <div className="form-section-header">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary-600" />
          <span className="form-section-title">{getSectionTitle('custom', language)}模块</span>
          <span className="text-xs text-surface-400">({sections.length})</span>
        </div>
        <button
          onClick={() => {
            addSection()
            setExpanded({ [sections.length]: true })
          }}
          className="btn-primary btn-xs"
        >
          <Plus className="w-3 h-3" />
          添加模块
        </button>
      </div>

      <div className="space-y-2">
        {sections.map((section, idx) => {
          const isExpanded = expanded[idx] ?? (idx === sections.length - 1 && sections.length <= 2)
          const isHidden = !!section.hidden

          return (
            <div
              key={section.id}
              className={`border rounded-lg overflow-hidden transition-colors ${
                overIdx === idx && draggedIdx !== idx ? 'border-primary-400 bg-primary-50/50' : 'border-surface-200'
              } ${draggedIdx === idx ? 'opacity-40' : ''} ${isHidden ? 'opacity-60 bg-surface-50' : ''}`}
              onDragOver={(e) => onDragOver(e, idx)}
              onDrop={() => onDrop(idx)}
            >
              {/* 折叠态模块头部（模块名输入框常驻于此，折叠/展开均可直接编辑） */}
              <div
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-50 cursor-pointer"
                onClick={() => toggle(idx)}
              >
                <div
                  draggable
                  onDragStart={() => onDragStart(idx)}
                  onDragEnd={onDragEnd}
                  className={`cursor-grab active:cursor-grabbing p-0.5 -ml-0.5 rounded hover:bg-surface-200 transition-colors ${
                    draggedIdx === idx ? 'text-primary-500' : 'text-surface-300'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
                {isExpanded ? <ChevronDown className="w-4 h-4 text-surface-400" /> : <ChevronRight className="w-4 h-4 text-surface-400" />}
                <input
                  className="form-input text-sm px-2 py-1 min-w-0 flex-1"
                  value={section.title || ''}
                  onChange={(e) => updateSection(idx, { title: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="未命名模块"
                  maxLength={50}
                />
                <VisibilityToggle
                  hidden={isHidden}
                  onToggle={() => updateSection(idx, { hidden: !isHidden })}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    requestDelete('custom', idx)
                  }}
                  className="p-1 text-red-500 hover:bg-red-100 hover:text-red-600 rounded-md transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 展开态：条目列表 */}
              <div className={`collapse-wrap ${isExpanded ? 'open' : ''}`}>
                <div className="collapse-inner">
                  <div className="collapse-content px-3 pb-3 pt-1 border-t border-surface-100 space-y-2.5">
                  <CustomEntryList sectionIndex={idx} section={section} />
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {sections.length === 0 && (
          <div className="text-center py-6 text-sm text-surface-400">
            暂无模块，点击上方"添加模块"按钮开始
          </div>
        )}
      </div>
    </div>
  )
}

/** 单个自定义模块下的条目列表（模块内拖拽排序，每模块一份独立的拖拽状态）。 */
function CustomEntryList({ sectionIndex, section }: { sectionIndex: number; section: CustomSectionModel }) {
  const addItem = useResumeStore((s) => s.addCustomItem)
  const updateItem = useResumeStore((s) => s.updateCustomItem)
  const moveItem = useResumeStore((s) => s.moveCustomItem)
  const requestItemDelete = useResumeStore((s) => s.requestCustomItemDelete)
  const requestHighlightDelete = useResumeStore((s) => s.requestCustomHighlightDelete)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  const items = section.items || []
  const { draggedIdx, overIdx, onDragStart, onDragOver, onDrop, onDragEnd } = useDragReorder((from, to) =>
    moveItem(sectionIndex, from, to),
  )

  const toggle = (idx: number) =>
    setExpanded((prev) => {
      const current = prev[idx] ?? (idx === items.length - 1 && items.length <= 2)
      return { ...prev, [idx]: !current }
    })

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-surface-400">条目 ({items.length})</span>
        <button
          onClick={() => {
            addItem(sectionIndex)
            setExpanded({ [items.length]: true })
          }}
          className="btn-ghost btn-xs text-primary-600"
        >
          <Plus className="w-3 h-3" />
          添加条目
        </button>
      </div>

      <div className="space-y-2">
        {items.map((item, idx) => {
          const isExpanded = expanded[idx] ?? (idx === items.length - 1 && items.length <= 2)
          const isHidden = !!item.hidden
          const titleText = stripMarkdown(item.title)

          return (
            <div
              key={item.id}
              className={`border rounded-lg overflow-hidden transition-colors ${
                overIdx === idx && draggedIdx !== idx ? 'border-primary-400 bg-primary-50/50' : 'border-surface-200'
              } ${draggedIdx === idx ? 'opacity-40' : ''} ${isHidden ? 'opacity-60 bg-surface-50' : ''}`}
              onDragOver={(e) => onDragOver(e, idx)}
              onDrop={() => onDrop(idx)}
            >
              {/* 条目折叠头 */}
              <div
                className="flex items-center gap-2 px-3 py-2 hover:bg-surface-50 cursor-pointer"
                onClick={() => toggle(idx)}
              >
                <div
                  draggable
                  onDragStart={() => onDragStart(idx)}
                  onDragEnd={onDragEnd}
                  className={`cursor-grab active:cursor-grabbing p-0.5 -ml-0.5 rounded hover:bg-surface-200 transition-colors ${
                    draggedIdx === idx ? 'text-primary-500' : 'text-surface-300'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
                {isExpanded ? <ChevronDown className="w-4 h-4 text-surface-400" /> : <ChevronRight className="w-4 h-4 text-surface-400" />}
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-medium truncate ${isHidden ? 'text-surface-400 line-through' : 'text-surface-700'}`}>
                    {titleText || '未命名条目'}
                  </span>
                  {isHidden && (
                    <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-surface-500 bg-surface-200 rounded">
                      <EyeOff className="w-2.5 h-2.5" />
                      已隐藏
                    </span>
                  )}
                </div>
                <VisibilityToggle
                  hidden={isHidden}
                  onToggle={() => updateItem(sectionIndex, idx, { hidden: !isHidden })}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    requestItemDelete(sectionIndex, idx)
                  }}
                  className="p-1 text-red-500 hover:bg-red-100 hover:text-red-600 rounded-md transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 条目展开表单：标题 / 副标题+日期 / 内容 / 亮点 */}
              <div className={`collapse-wrap ${isExpanded ? 'open' : ''}`}>
                <div className="collapse-inner">
                  <div className="collapse-content px-3 pb-3 pt-1 border-t border-surface-100 space-y-2.5">
                  <div>
                    <label className="form-label">条目标题</label>
                    <RichTextField
                      variant="inline"
                      minHeight={36}
                      value={item.title || ''}
                      onChange={(v) => updateItem(sectionIndex, idx, { title: v })}
                      placeholder="条目标题，支持加粗/斜体/链接/颜色"
                      maxLength={100}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="form-label">副标题</label>
                      <input
                        className="form-input"
                        value={item.subtitle || ''}
                        onChange={(e) => updateItem(sectionIndex, idx, { subtitle: e.target.value })}
                        placeholder="如：公司 / 机构 / 出版方"
                        maxLength={100}
                      />
                    </div>
                    <div>
                      <label className="form-label">日期</label>
                      <MonthPicker
                        value={item.date || ''}
                        onChange={(v) => updateItem(sectionIndex, idx, { date: v })}
                        placeholder="选择日期"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="form-label">条目内容</label>
                    <RichTextField
                      value={item.description || ''}
                      onChange={(v) => updateItem(sectionIndex, idx, { description: v })}
                      placeholder="详细描述该条目的内容..."
                      maxLength={1000}
                    />
                  </div>
                  <div>
                    <label className="form-label">关键亮点</label>
                    <HighlightsEditor
                      highlights={item.highlights || []}
                      onChange={(highlights) => updateItem(sectionIndex, idx, { highlights })}
                      onRequestRemove={(subIdx) => requestHighlightDelete(sectionIndex, idx, subIdx)}
                    />
                  </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {items.length === 0 && (
          <div className="text-center py-4 text-sm text-surface-400">
            暂无条目，点击上方"添加条目"按钮开始
          </div>
        )}
      </div>
    </div>
  )
}

/** 关键亮点编辑（一条一 bullet，行内富文本，结构与 ExperienceSection 一致）。 */
function HighlightsEditor({
  highlights,
  onChange,
  onRequestRemove,
}: {
  highlights: string[]
  onChange: (h: string[]) => void
  onRequestRemove: (highlightIndex: number) => void
}) {
  const addHighlight = () => onChange([...highlights, ''])
  const updateHighlight = (idx: number, value: string) => {
    const updated = [...highlights]
    updated[idx] = value
    onChange(updated)
  }
  const removeHighlight = (idx: number) => onRequestRemove(idx)

  return (
    <div className="space-y-1.5">
      {highlights.map((h, i) => (
        <div key={i} className="flex gap-1">
          <div className="flex items-center px-1 pt-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-400 flex-shrink-0" />
          </div>
          <RichTextField
            variant="inline"
            minHeight={36}
            value={h}
            onChange={(v) => updateHighlight(i, v)}
            placeholder={`亮点 ${i + 1}`}
            maxLength={500}
          />
          <button onClick={() => removeHighlight(i)} className="p-1 text-red-500 hover:bg-red-100 hover:text-red-600 rounded-md transition-colors flex-shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button onClick={addHighlight} className="btn-ghost btn-xs text-primary-600">
        <Plus className="w-3 h-3" />
        添加亮点
      </button>
    </div>
  )
}

/** 折叠态摘要用：去除富文本源（Markdown）中的行内标签与链接语法，仅保留可读纯文本。 */
function stripMarkdown(source: string): string {
  return source
    .replace(/<[^>]*>/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
