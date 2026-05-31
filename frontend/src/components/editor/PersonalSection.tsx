import { useResumeStore } from '../../stores/resumeStore'
import { User, Camera, Trash2 } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

export function PersonalSection() {
  const resume = useResumeStore((s) => s.resume)
  const updateField = useResumeStore((s) => s.updateField)
  const p = resume?.personal
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  if (!p) return null

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    updateField(`personal.${field}`, e.target.value)
  }

  const readFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      updateField('personal.avatar', reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) readFile(file)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) readFile(file)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const removeAvatar = () => {
    updateField('personal.avatar', '')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="form-section">
      <div className="form-section-header">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-primary-600" />
          <span className="form-section-title">个人信息</span>
        </div>
      </div>

      {/* Avatar Upload */}
      <div className="flex items-start gap-4 mb-4">
        <div
          className={`relative w-20 h-20 rounded-full border-2 border-dashed flex items-center justify-center overflow-hidden flex-shrink-0 transition-colors ${
            isDragging ? 'border-primary-500 bg-primary-50' : 'border-slate-300 bg-slate-50'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {p.avatar ? (
            <>
              <img src={p.avatar} alt="头像" className="w-full h-full object-cover" />
              <button
                onClick={removeAvatar}
                className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                title="移除照片"
              >
                <Trash2 className="w-5 h-5 text-white" />
              </button>
            </>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-0.5 text-slate-400 hover:text-primary-500 transition-colors"
              title="上传照片"
            >
              <Camera className="w-5 h-5" />
              <span className="text-[9px]">照片</span>
            </button>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700">个人照片</p>
          <p className="text-xs text-slate-400 mt-0.5">
            点击或拖拽上传证件照，支持 JPG/PNG 格式
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="form-label">姓名 *</label>
          <input className="form-input" value={p.full_name || ''} onChange={handleChange('full_name')} placeholder="张三" />
        </div>
        <div>
          <label className="form-label">英文名</label>
          <input className="form-input" value={p.english_name || ''} onChange={handleChange('english_name')} placeholder="San Zhang" />
        </div>
        <div>
          <label className="form-label">职位</label>
          <input className="form-input" value={p.job_title || ''} onChange={handleChange('job_title')} placeholder="高级前端工程师" />
        </div>
        <div>
          <label className="form-label">邮箱</label>
          <input className="form-input" value={p.email || ''} onChange={handleChange('email')} type="email" placeholder="zhangsan@example.com" />
        </div>
        <div>
          <label className="form-label">手机</label>
          <input className="form-input" value={p.phone || ''} onChange={handleChange('phone')} placeholder="138-0000-0000" />
        </div>
        <div>
          <label className="form-label">所在城市</label>
          <input className="form-input" value={p.location || ''} onChange={handleChange('location')} placeholder="北京" />
        </div>
        <div>
          <label className="form-label">个人网站</label>
          <input className="form-input" value={p.website || ''} onChange={handleChange('website')} placeholder="https://zhangsan.dev" />
        </div>
        <div>
          <label className="form-label">GitHub</label>
          <input className="form-input" value={p.github || ''} onChange={handleChange('github')} placeholder="https://github.com/zhangsan" />
        </div>
        <div>
          <label className="form-label">LinkedIn</label>
          <input className="form-input" value={p.linkedin || ''} onChange={handleChange('linkedin')} placeholder="https://linkedin.com/in/zhangsan" />
        </div>
        <div>
          <label className="form-label">微信</label>
          <input className="form-input" value={p.wechat || ''} onChange={handleChange('wechat')} placeholder="微信号" />
        </div>
        <div className="col-span-2">
          <label className="form-label">工作年限</label>
          <input className="form-input" value={p.years_of_exp || ''} onChange={(e) => updateField('personal.years_of_exp', parseInt(e.target.value) || 0)} type="number" min={0} max={50} placeholder="5" />
        </div>
      </div>
    </div>
  )
}
