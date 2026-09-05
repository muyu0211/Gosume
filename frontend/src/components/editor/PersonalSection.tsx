import { useResumeStore } from '../../stores/resumeStore'
import { getSectionTitle } from '../../lib/resumeSections'
import { AVATAR_RADIUS_MIN, AVATAR_RADIUS_MAX, type HeaderLayout, isDoubleColumnCss, detectHeaderLayoutCss } from '../../lib/layoutPresets'
import { parseCustomCss } from '../../lib/customCss'
import { loadTemplateContent } from '../../services/templateService'
import { User, Camera, Trash2, AlertCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Tooltip } from '../ui/Tooltip'

const MAX_PHOTO_SIZE = 3 * 1024 * 1024 // 3MB
const MAX_PHOTO_DIMENSION = 400 // max width/height in px
const PHOTO_QUALITY = 0.8 // JPEG compression quality
/** 双栏模板由持久侧栏固定头像位置，不支持切换信息区布局。 */
const HINT_DOUBLE_COLUMN = '双栏模板由侧栏固定，不支持切换布局'

// 证件照标准比例预设（宽 / 高）。custom 表示自由调整。
const RATIO_PRESETS = [
  { key: 'custom', label: '自定义', ratio: null as number | null },
  { key: '1x1', label: '1:1（正方形）', ratio: 1 },
  { key: '1inch', label: '一寸（25×35）', ratio: 25 / 35 },
  { key: '2inch', label: '二寸（35×53）', ratio: 35 / 53 },
]

// 个人信息区布局预设：头像与文字信息的排布方式。
// 目前仅前端样式与选中态；切换渲染逻辑后续接入（接入时替换本地 state）。
const HEADER_LAYOUT_PRESETS = [
  { key: 'center', label: '居中' },
  { key: 'avatar-left', label: '头像居左' },
  { key: 'avatar-right', label: '头像居右' },
] as const

type HeaderLayoutKey = (typeof HEADER_LAYOUT_PRESETS)[number]['key']

/** 布局按钮内的迷你示意（纯图形，无文字）：圆形=头像，两条不等长横条=文字信息（姓名/职位）。三种布局使用同规格图形，保证按钮大小一致。 */
function LayoutMiniPreview({ layout, active }: { layout: HeaderLayoutKey; active: boolean }) {
  const circle = (
    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${active ? 'bg-primary-500' : 'bg-surface-400 group-hover:bg-surface-500'}`} />
  )
  const lines = (
    <span className="flex flex-col items-start gap-0.5">
      <span className={`h-1 w-4 rounded ${active ? 'bg-primary-400' : 'bg-surface-300 group-hover:bg-surface-500'}`} />
      <span className={`h-1 w-2.5 rounded ${active ? 'bg-primary-300' : 'bg-surface-300 group-hover:bg-surface-500'}`} />
    </span>
  )
  if (layout === 'center') {
    return (
      <span className="flex flex-col items-center gap-0.5">
        {circle}
        {lines}
      </span>
    )
  }
  return (
    <span className={`flex items-center gap-1 ${layout === 'avatar-right' ? 'flex-row-reverse' : ''}`}>
      {circle}
      {lines}
    </span>
  )
}

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
  const updateCustomCss = useResumeStore((s) => s.updateCustomCss)
  const avatarRenderedSize = useResumeStore((s) => s.avatarRenderedSize)
  const language = resume?.meta?.language
  const p = resume?.personal
  // 样式定制统一从 custom_css 解析（头像尺寸/圆角/信息区布局）。
  const styleState = parseCustomCss(resume?.custom_css ?? '')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [avatarW, setAvatarW] = useState<number>(styleState.avatarWidth ?? avatarRenderedSize?.width ?? 100)
  const [avatarH, setAvatarH] = useState<number>(styleState.avatarHeight ?? avatarRenderedSize?.height ?? 100)
  const [lockRatio, setLockRatio] = useState(true)
  const [ratioPreset, setRatioPreset] = useState<string>('custom')
  // 是否双栏模板：双栏时 .r-header 为持久侧栏，不支持切换布局。
  const [isDoubleColumn, setIsDoubleColumn] = useState(false)
  // 当前单栏模板的原生布局（用于默认高亮对应的布局按钮）。
  const [nativeLayout, setNativeLayout] = useState<HeaderLayout>('center')
  const templateId = resume?.meta?.template_id
  useEffect(() => {
    if (!templateId) return
    let alive = true
    loadTemplateContent(templateId)
      .then((t) => {
        if (!alive) return
        setIsDoubleColumn(isDoubleColumnCss(t.css))
        setNativeLayout(detectHeaderLayoutCss(t.css))
      })
      .catch(() => {
        /* 加载失败保守视为单栏且居中 */
      })
    return () => {
      alive = false
    }
  }, [templateId])
  // 有效选中态：未手动设置（nil=跟随模板原生布局）时高亮模板原生对应的按钮；双栏禁用态不高亮原生。
  const effectiveLayout: HeaderLayout | null = styleState.headerLayout ?? (isDoubleColumn ? null : nativeLayout)
  const onSelectHeaderLayout = (v: HeaderLayout) => {
    // 默认即模板原生布局，无需写入（避免覆盖造成与原生细微差异或污染制作方数据）。
    if (styleState.headerLayout == null && v === nativeLayout) return
    updateCustomCss({ headerLayout: v })
  }
  const ratioRef = useRef(1)
  // 动画状态：追踪当前显示值 + rAF 句柄，用于从默认值平滑过渡到实际渲染值。
  const animWRef = useRef(styleState.avatarWidth ?? avatarRenderedSize?.width ?? 100)
  const animHRef = useRef(styleState.avatarHeight ?? avatarRenderedSize?.height ?? 100)
  const rafRef = useRef<number | null>(null)

  // 立即设置宽高（用户拖动 / 选择预设），取消进行中的动画。
  const setAvatarDims = useCallback((w: number, h: number) => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    animWRef.current = w
    animHRef.current = h
    setAvatarW(w)
    setAvatarH(h)
  }, [])

  // 平滑过渡到目标值（easeOutCubic）。用户拖动时目标值=当前值，动画退化为 no-op。
  const animateTo = useCallback((targetW: number, targetH: number) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    const startW = animWRef.current
    const startH = animHRef.current
    const start = performance.now()
    const DURATION = 400
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      const w = Math.round(startW + (targetW - startW) * eased)
      const h = Math.round(startH + (targetH - startH) * eased)
      animWRef.current = w
      animHRef.current = h
      setAvatarW(w)
      setAvatarH(h)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        rafRef.current = null
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }, [])

  // 同步外部数据（载入/切换简历、导入模板时），并跟随预览测量出的实际渲染尺寸。
  // 用动画从旧值过渡到新值，避免从默认值直接跳变。
  useEffect(() => {
    animateTo(
      styleState.avatarWidth ?? avatarRenderedSize?.width ?? 100,
      styleState.avatarHeight ?? avatarRenderedSize?.height ?? 100,
    )
  }, [styleState.avatarWidth, styleState.avatarHeight, avatarRenderedSize, animateTo])

  // 维护宽高比例（固定比例 checkbox 开启时用）。存 ref 避免触发额外渲染。
  useEffect(() => {
    if (avatarH > 0) ratioRef.current = avatarW / avatarH
  }, [avatarW, avatarH])

  // 卸载时取消进行中的动画，避免 rAF 在组件卸载后继续 setState。
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

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

  const clampDim = (v: number) => Math.min(200, Math.max(40, v))

  const handleWidthChange = (w: number) => {
    let newH = animHRef.current
    if (lockRatio) {
      newH = clampDim(Math.round(w / ratioRef.current))
    } else {
      setRatioPreset('custom')
    }
    setAvatarDims(w, newH)
    updateCustomCss({ avatarWidth: w, avatarHeight: newH })
  }

  const handleHeightChange = (h: number) => {
    let newW = animWRef.current
    if (lockRatio) {
      newW = clampDim(Math.round(h * ratioRef.current))
    } else {
      setRatioPreset('custom')
    }
    setAvatarDims(newW, h)
    updateCustomCss({ avatarHeight: h, avatarWidth: newW })
  }

  // 选择比例预设（1:1/一寸/二寸）时：锁定比例、按预设比例调整高度（保持当前宽度），
  // 便于用户恢复到标准证件照比例。选"自定义"则不改变当前比例。
  const handlePresetChange = (key: string) => {
    setRatioPreset(key)
    const preset = RATIO_PRESETS.find((pr) => pr.key === key)
    if (!preset || preset.ratio === null) return
    setLockRatio(true)
    ratioRef.current = preset.ratio
    const w = animWRef.current
    const newH = clampDim(Math.round(w / preset.ratio))
    setAvatarDims(w, newH)
    updateCustomCss({ avatarWidth: w, avatarHeight: newH })
  }

  return (
    <div className="form-section">
      <div className="form-section-header">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-primary-600" />
          <span className="form-section-title">{getSectionTitle('personal', language)}</span>
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

      {/* 简历中头像显示尺寸（宽/高 px）+ 信息区布局（4:1 同行等高） */}
      {p.avatar && (
        <div className="flex items-stretch gap-3 mb-4">
          <div className="flex-[4] min-w-0 p-3 rounded-lg border border-surface-200 bg-surface-50/60 space-y-2.5">
            <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-surface-600">简历中显示尺寸</span>
            <div className="flex items-center gap-2">
              <select
                value={ratioPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="text-xs border border-surface-200 rounded-md px-1.5 py-0.5 bg-elev text-surface-600 focus:outline-none focus:border-primary-500"
                title="选择标准证件照比例"
              >
                {RATIO_PRESETS.map((pr) => (
                  <option key={pr.key} value={pr.key}>{pr.label}</option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-surface-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={lockRatio}
                  onChange={(e) => {
                    setLockRatio(e.target.checked)
                    if (!e.target.checked) setRatioPreset('custom')
                  }}
                  className="w-3.5 h-3.5 rounded accent-primary-600"
                />
                固定比例
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between text-[11px] text-surface-500 mb-1">
                <span>宽</span>
                <span className="tabular-nums font-medium text-surface-700">{avatarW}px</span>
              </div>
              <input
                type="range"
                min={40}
                max={200}
                step={1}
                value={avatarW}
                onChange={(e) => handleWidthChange(Number(e.target.value))}
                className="w-full accent-primary-600"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-[11px] text-surface-500 mb-1">
                <span>高</span>
                <span className="tabular-nums font-medium text-surface-700">{avatarH}px</span>
              </div>
              <input
                type="range"
                min={40}
                max={200}
                step={1}
                value={avatarH}
                onChange={(e) => handleHeightChange(Number(e.target.value))}
                className="w-full accent-primary-600"
              />
            </div>
          </div>

          {/* 头像圆角（仅当前简历；0=直角矩形，100=圆形） */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] text-surface-500 mb-1">
              <span className="flex items-center gap-1">
                <span>圆角</span>
                {styleState.avatarRadius == null && <span className="text-surface-400">（跟随模板）</span>}
              </span>
              <span className="tabular-nums font-medium text-surface-700">{styleState.avatarRadius ?? 0}</span>
            </div>
            <input
              type="range"
              min={AVATAR_RADIUS_MIN}
              max={AVATAR_RADIUS_MAX}
              step={1}
              value={styleState.avatarRadius ?? 0}
              onChange={(e) => updateCustomCss({ avatarRadius: Number(e.target.value) })}
              className="w-full accent-primary-600"
            />
            <p className="text-[10px] text-surface-400 mt-1">0=直角矩形 · 100=圆形，仅作用于当前简历。</p>
          </div>
          </div>

          {/* 信息区布局：切换头像与文字排布；仅当前简历，双栏模板禁用。 */}
          <div className="flex-1 p-3 rounded-lg border border-surface-200 bg-surface-50/60 flex flex-col">
            <p className="text-xs font-medium text-surface-600 mb-2">信息区布局</p>
            <div className="flex flex-col justify-between gap-1.5 flex-1">
              {HEADER_LAYOUT_PRESETS.map((preset) => {
                const active = effectiveLayout === preset.key
                return (
                  <Tooltip
                    key={preset.key}
                    label={isDoubleColumn ? HINT_DOUBLE_COLUMN : preset.label}
                    className="flex-1 min-h-0"
                  >
                    <button
                      type="button"
                      disabled={isDoubleColumn}
                      onClick={() => onSelectHeaderLayout(preset.key)}
                      className={`group h-full w-full flex items-center justify-center rounded-md transition-all duration-200 ease-out hover:scale-105 active:scale-95 ${
                        isDoubleColumn ? 'opacity-50 cursor-not-allowed' : ''
                      } ${
                        active
                          ? 'bg-primary-100'
                          : 'bg-surface-200/80 hover:bg-surface-300'
                      }`}
                    >
                      <span className="group-hover:animate-[jelly_0.5s_ease-out]">
                        <LayoutMiniPreview layout={preset.key} active={active} />
                      </span>
                    </button>
                  </Tooltip>
                )
              })}
            </div>
          </div>
        </div>
      )}

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
