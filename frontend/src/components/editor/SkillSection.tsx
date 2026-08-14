import { useResumeStore } from '../../stores/resumeStore'
import { Plus, Trash2, Code, GripVertical, EyeOff } from 'lucide-react'
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
          <span className="text-xs text-surface-400">({items.length} 组)</span>
        </div>
        <button onClick={addGroup} className="btn-primary btn-xs">
          <Plus className="w-3 h-3" />
          添加分组
        </button>
      </div>

      <div className="space-y-3">
        {items.map((group, gIdx) => {
          const isGroupHidden = !!group.hidden
          return (
          <div
            key={group.id}
            className={`border rounded-lg p-3 transition-colors ${
              overIdx === gIdx && draggedIdx !== gIdx ? 'border-primary-400 bg-primary-50/50' : 'border-surface-200'
            } ${draggedIdx === gIdx ? 'opacity-40' : ''} ${isGroupHidden ? 'opacity-60 bg-surface-50' : ''}`}
            onDragOver={(e) => onDragOver(e, gIdx)}
            onDrop={() => onDrop(gIdx)}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                draggable
                onDragStart={() => onDragStart(gIdx)}
                onDragEnd={onDragEnd}
                className={`cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-surface-200 transition-colors ${draggedIdx === gIdx ? 'text-primary-500' : 'text-surface-300'}`}
              >
                <GripVertical className="w-3.5 h-3.5" />
              </div>
              <input
                className={`form-input flex-1 font-medium ${isGroupHidden ? 'text-surface-400 line-through' : ''}`}
                value={group.category || ''}
                onChange={(e) => updateGroup(gIdx, { category: e.target.value })}
                placeholder="分类名，如：前端技术"
                maxLength={100}
              />
              {isGroupHidden && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-surface-500 bg-surface-200 rounded">
                  <EyeOff className="w-2.5 h-2.5" />
                  已隐藏
                </span>
              )}
              <label
                className="flex items-center gap-1 px-1 py-0.5 text-xs text-surface-500 hover:text-surface-700 cursor-pointer select-none"
                title={isGroupHidden ? '取消隐藏（在简历中显示）' : '隐藏此分组（不在简历中显示）'}
              >
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded border-surface-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                  checked={!isGroupHidden}
                  onChange={(e) => updateGroup(gIdx, { hidden: !e.target.checked })}
                />
                <span className="hidden sm:inline">显示</span>
              </label>
              <button onClick={() => removeGroup(gIdx)} className="p-1.5 text-surface-400 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              {group.items.map((skill, sIdx) => {
                const isSkillHidden = !!skill.hidden
                return (
                <div key={sIdx} className={`flex items-center gap-1.5 ${isSkillHidden ? 'opacity-60' : ''}`}>
                  <input
                    className={`form-input flex-1 ${isSkillHidden ? 'text-surface-400 line-through' : ''}`}
                    value={skill.name || ''}
                    onChange={(e) => updateSkill(gIdx, sIdx, e.target.value, skill.level)}
                    placeholder="技能名，如：React"
                    maxLength={100}
                  />
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => updateSkill(gIdx, sIdx, skill.name, skill.level === lvl ? 0 : lvl)}
                        className={`w-4 h-4 rounded-sm border transition-colors ${
                          (skill.level || 0) >= lvl
                            ? 'bg-primary-500 border-primary-500'
                            : 'bg-surface-100 border-surface-200 hover:border-primary-300'
                        }`}
                        title={`${lvl}/5`}
                      />
                    ))}
                  </div>
                  <label
                    className="flex items-center cursor-pointer select-none p-1"
                    title={isSkillHidden ? '取消隐藏' : '隐藏此技能'}
                  >
                    <input
                      type="checkbox"
                      className="w-3 h-3 rounded border-surface-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                      checked={!isSkillHidden}
                      onChange={(e) => {
                        const newItems = [...group.items]
                        newItems[sIdx] = { ...newItems[sIdx], hidden: !e.target.checked }
                        updateGroup(gIdx, { items: newItems })
                      }}
                    />
                  </label>
                  <button onClick={() => removeSkill(gIdx, sIdx)} className="p-1 text-surface-400 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                )
              })}
              <button onClick={() => addSkill(gIdx)} className="btn-ghost btn-xs text-primary-600 mt-1">
                <Plus className="w-3 h-3" />
                添加技能
              </button>
            </div>
          </div>
          )
        })}

        {items.length === 0 && (
          <div className="text-center py-6 text-sm text-surface-400">
            暂无内容，点击上方"添加分组"按钮开始
          </div>
        )}
      </div>
    </div>
  )
}
