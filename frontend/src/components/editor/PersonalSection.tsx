import { useResumeStore } from '../../stores/resumeStore'
import { User, Camera, Trash2, AlertCircle } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

const MAX_PHOTO_SIZE = 3 * 1024 * 1024 // 3MB
const MAX_PHOTO_DIMENSION = 400 // max width/height in px
const PHOTO_QUALITY = 0.8 // JPEG compression quality

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const { width, height } = img
      let w = width
      let h = height
      if (w > h && w > MAX_PHOTO_DIMENSION) {
        h = Math.round((h * MAX_PHOTO_DIMENSION) / w)
        w = MAX_PHOTO_DIMENSION
      } else if (h > MAX_PHOTO_DIMENSION) {
        w = Math.round((w * MAX_PHOTO_DIMENSION) / h)
        h = MAX_PHOTO_DIMENSION
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas context not available'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', PHOTO_QUALITY))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

export function PersonalSection() {
  const resume = useResumeStore((s) => s.resume)
  const updateField = useResumeStore((s) => s.updateField)
  const p = resume?.personal
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  if (!p) return null

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    updateField(`personal.${field}`, e.target.value)
  }

  const readFile = async (file: File) => {
    setPhotoError(null)
    if (!file.type.startsWith('image/')) {
      setPhotoError('仅支持 JPG/PNG 格式的图片')
      return
    }
    if (file.size > MAX_PHOTO_SIZE) {
      setPhotoError('照片大小不能超过 3MB，请压缩后重试')
      return
    }
    try {
      const compressed = await compressImage(file)
      updateField('personal.avatar', compressed)
    } catch {
      setPhotoError('照片处理失败，请重试')
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) readFile(file)
    // Reset so re-selecting the same file triggers onChange
    if (fileInputRef.current) fileInputRef.current.value = ''
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
    setPhotoError(null)
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
            isDragging ? 'border-primary-500 bg-primary-50' : 'border-surface-300 bg-surface-50'
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
              className="flex flex-col items-center gap-0.5 text-surface-400 hover:text-primary-500 transition-colors"
              title="上传照片"
            >
              <Camera className="w-5 h-5" />
              <span className="text-[9px]">照片</span>
            </button>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-surface-700">个人照片</p>
          <p className="text-xs text-surface-400 mt-0.5">
            点击或拖拽上传证件照，支持 JPG/PNG 格式，最大 3MB
          </p>
          {photoError && (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {photoError}
            </p>
          )}
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
          <input className="form-input" value={p.full_name || ''} onChange={handleChange('full_name')} placeholder="张三" maxLength={50} />
        </div>
        <div>
          <label className="form-label">英文名</label>
          <input className="form-input" value={p.english_name || ''} onChange={handleChange('english_name')} placeholder="San Zhang" maxLength={100} />
        </div>
        <div>
          <label className="form-label">职位</label>
          <input className="form-input" value={p.job_title || ''} onChange={handleChange('job_title')} placeholder="高级前端工程师" maxLength={100} />
        </div>
        <div>
          <label className="form-label">邮箱</label>
          <input className="form-input" value={p.email || ''} onChange={handleChange('email')} type="email" placeholder="zhangsan@example.com" maxLength={100} />
        </div>
        <div>
          <label className="form-label">手机</label>
          <input className="form-input" value={p.phone || ''} onChange={handleChange('phone')} placeholder="138-0000-0000" maxLength={30} />
        </div>
        <div>
          <label className="form-label">所在城市</label>
          <input className="form-input" value={p.location || ''} onChange={handleChange('location')} placeholder="北京" maxLength={100} />
        </div>
        <div>
          <label className="form-label">个人网站</label>
          <input className="form-input" value={p.website || ''} onChange={handleChange('website')} placeholder="https://zhangsan.dev" maxLength={200} />
        </div>
        <div>
          <label className="form-label">GitHub</label>
          <input className="form-input" value={p.github || ''} onChange={handleChange('github')} placeholder="https://github.com/zhangsan" maxLength={200} />
        </div>
        <div>
          <label className="form-label">LinkedIn</label>
          <input className="form-input" value={p.linkedin || ''} onChange={handleChange('linkedin')} placeholder="https://linkedin.com/in/zhangsan" maxLength={200} />
        </div>
        <div>
          <label className="form-label">微信</label>
          <input className="form-input" value={p.wechat || ''} onChange={handleChange('wechat')} placeholder="微信号" maxLength={50} />
        </div>
        <div className="col-span-2">
          <label className="form-label">工作年限</label>
          <input className="form-input" value={p.years_of_exp || ''} onChange={(e) => updateField('personal.years_of_exp', parseInt(e.target.value) || 0)} type="number" min={0} max={50} placeholder="5" />
        </div>
      </div>
    </div>
  )
}
