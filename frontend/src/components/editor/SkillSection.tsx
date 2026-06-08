import { useResumeStore } from '../../stores/resumeStore'
import { Plus, Trash2, Code, GripVertical } from 'lucide-react'
import { useDragReorder } from '../../hooks/useDragReorder'

export function SkillSection() {
  const items = useResumeStore((s) => s.resume?.skills) || []
  const addGroup = useResumeStore((s) => s.addSkillGroup)
  const updateGroup = useResumeStore((s) => s.updateSkillGroup)
  const removeGroup = useResumeStore((s) => s.removeSkillGroup)
  const moveGroup = useResumeStore((s) => s.moveSkillGroup)

  const { draggedIdx, overIdx, onDragStart, onDragOver, onDrop, onDragEnd } = useDragReorder(moveGroup)

  const addSkill = (groupIdx: number) => {
    const group = items[groupIdx]
    const newItems = [...group.items, { name: '', level: 3 }]
    updateGroup(groupIdx, { items: newItems })
  }

  const updateSkill = (groupIdx: number, skillIdx: number, name: string, level?: number) => {
    const group = items[groupIdx]
    const newItems = [...group.items]
    newItems[skillIdx] = { ...newItems[skillIdx], name, level }
    updateGroup(groupIdx, { items: newItems })
  }

  const removeSkill = (groupIdx: number, skillIdx: number) => {
    const group = items[groupIdx]
    const newItems = group.items.filter((_, i) => i !== skillIdx)
    updateGroup(groupIdx, { items: newItems })
  }

  return (
    <div className="form-section">
      <div className="form-section-header">
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4 text-primary-600" />
          <span className="form-section-title">技能</span>
          <span className="text-xs text-slate-400">({items.length} 组)</span>
        </div>
        <button onClick={addGroup} className="btn-primary btn-xs">
          <Plus className="w-3 h-3" />
          添加分组
        </button>
      </div>

      <div className="space-y-3">
        {items.map((group, gIdx) => (
          <div
            key={group.id}
            className={`border rounded-lg p-3 transition-colors ${
              overIdx === gIdx && draggedIdx !== gIdx ? 'border-primary-400 bg-primary-50/50' : 'border-slate-200'
            } ${draggedIdx === gIdx ? 'opacity-40' : ''}`}
            onDragOver={(e) => onDragOver(e, gIdx)}
            onDrop={() => onDrop(gIdx)}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                draggable
                onDragStart={() => onDragStart(gIdx)}
                onDragEnd={onDragEnd}
                className={`cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-slate-200 transition-colors ${draggedIdx === gIdx ? 'text-primary-500' : 'text-slate-300'}`}
              >
                <GripVertical className="w-3.5 h-3.5" />
              </div>
              <input
                className="form-input flex-1 font-medium"
                value={group.category || ''}
                onChange={(e) => updateGroup(gIdx, { category: e.target.value })}
                placeholder="分类名，如：前端技术"
              />
              <button onClick={() => removeGroup(gIdx)} className="p-1.5 text-slate-400 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              {group.items.map((skill, sIdx) => (
                <div key={sIdx} className="flex items-center gap-1.5">
                  <input
                    className="form-input flex-1"
                    value={skill.name || ''}
                    onChange={(e) => updateSkill(gIdx, sIdx, e.target.value, skill.level)}
                    placeholder="技能名，如：React"
                  />
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => updateSkill(gIdx, sIdx, skill.name, skill.level === lvl ? 0 : lvl)}
                        className={`w-4 h-4 rounded-sm border transition-colors ${
                          (skill.level || 0) >= lvl
                            ? 'bg-primary-500 border-primary-500'
                            : 'bg-slate-100 border-slate-200 hover:border-primary-300'
                        }`}
                        title={`${lvl}/5`}
                      />
                    ))}
                  </div>
                  <button onClick={() => removeSkill(gIdx, sIdx)} className="p-1 text-slate-400 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button onClick={() => addSkill(gIdx)} className="btn-ghost btn-xs text-primary-600 mt-1">
                <Plus className="w-3 h-3" />
                添加技能
              </button>
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="text-center py-6 text-sm text-slate-400">
            暂无内容，点击上方"添加分组"按钮开始
          </div>
        )}
      </div>
    </div>
  )
}
