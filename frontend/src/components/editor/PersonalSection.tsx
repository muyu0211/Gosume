import { useResumeStore } from '../../stores/resumeStore'
import { useAppStore } from '../../stores/appStore'
import { getSectionTitle } from '../../lib/resumeSections'
import { AVATAR_RADIUS_MIN, AVATAR_RADIUS_MAX, type HeaderLayout, isDoubleColumnCss, detectHeaderLayoutCss } from '../../lib/layoutPresets'
import { parseCustomCss } from '../../lib/customCss'
import { loadTemplateContent } from '../../services/templateService'
import { useT } from '../../lib/i18n'
import { User, Camera, Trash2, AlertCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Tooltip } from '../ui/Tooltip'
import { CustomSelect, type SelectOption } from '../ui/CustomSelect'
import { AnimatedRange } from '../ui/AnimatedRange'
import { MonthPicker } from '../ui/MonthPicker'
import { ExtrasEditor } from './ExtrasEditor'
import { ETHNICITY_OPTIONS, DEFAULT_ETHNICITY, isKnownEthnicity } from '../../lib/ethnicityOptions'

const MAX_PHOTO_SIZE = 3 * 1024 * 1024 // 3MB
const MAX_PHOTO_DIMENSION = 400 // max width/height in px
const PHOTO_QUALITY = 0.8 // JPEG compression quality
/** 双栏模板由持久侧栏固定头像位置，不支持切换信息区布局。 */
const HINT_DOUBLE_COLUMN = '双栏模板由侧栏固定，不支持切换布局'

// 证件照标准比例预设（宽 / 高）。custom 表示自由调整。
const RATIO_PRESETS = [
  { key: 'custom', labelKey: 'ratioCustom', ratio: null as number | null },
  { key: '1x1', labelKey: 'ratioSquare', ratio: 1 },
  { key: '1inch', labelKey: 'ratioOneInch', ratio: 25 / 35 },
  { key: '2inch', labelKey: 'ratioTwoInch', ratio: 35 / 53 },
]

// 个人信息区布局预设：头像与文字信息的排布方式。
// 目前仅前端样式与选中态；切换渲染逻辑后续接入（接入时替换本地 state）。
const HEADER_LAYOUT_PRESETS = [
  { key: 'center', labelKey: 'layoutCenter' },
  { key: 'avatar-left', labelKey: 'layoutAvatarLeft' },
  { key: 'avatar-right', labelKey: 'layoutAvatarRight' },
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
  const t = useT()
  const resume = useResumeStore((s) => s.resume)
  const updateField = useResumeStore((s) => s.updateField)
  const updateCustomCss = useResumeStore((s) => s.updateCustomCss)
  const avatarRenderedSize = useResumeStore((s) => s.avatarRenderedSize)
  const language = useAppStore((s) => s.language)
  const p = resume?.personal
  // 样式定制统一从 custom_css 解析（头像尺寸/圆角/信息区布局）。
  const styleState = parseCustomCss(resume?.custom_css ?? '')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [avatarW, setAvatarW] = useState<number>(styleState.avatarWidth ?? avatarRenderedSize?.width ?? 100)
  const [avatarH, setAvatarH] = useState<number>(styleState.avatarHeight ?? avatarRenderedSize?.height ?? 100)
  // 「跟随模板」圆角的定格展示值：avatarRadius 未定制时，圆角滑块展示模板原生圆角。
  // ⚠ 不能直接绑 avatarRenderedSize.radius —— 该值每次预览重测都会把模板 px 圆角按
  // 当前头像宽折算成百分比（radius% = pxRadius / width × 200），拖宽/高滑块改变宽度 →
  // 预览重测 → 圆角滑块跟着滑（实际踩坑：首次拖宽高滑块圆角联动；手动拖过一次圆角滑块后
  // styleState.avatarRadius 非 null，?? 短路不再走测量值，联动"消失"——正是该 bug 的假象来源）。
  // 这里只在首次拿到测量时定格；切简历（store 清空测量）后重新跟随新模板。
  const [radiusFallback, setRadiusFallback] = useState<number | null>(null)
  useEffect(() => {
    if (avatarRenderedSize == null) {
      setRadiusFallback((v) => (v == null ? v : null))
      return
    }
    if (avatarRenderedSize.radius != null) {
      setRadiusFallback((v) => (v == null ? avatarRenderedSize.radius ?? null : v))
    }
  }, [avatarRenderedSize])
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
      setPhotoError(t('avatarErrType'))
      return
    }
    if (file.size > MAX_PHOTO_SIZE) {
      setPhotoError(t('avatarErrSize'))
      return
    }
    try {
      const compressed = await compressImage(file)
      updateField('personal.avatar', compressed)
    } catch {
      setPhotoError(t('avatarErrProcess'))
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

  // 政治面貌 / 婚姻状况选项：value 存中文原文（与模板渲染、autofill 直接兼容），label 走 i18n。
  const POLITICAL_OPTIONS = [
    { value: '群众', labelKey: 'polMass' },
    { value: '共青团员', labelKey: 'polLeague' },
    { value: '中共党员', labelKey: 'polParty' },
    { value: '中共预备党员', labelKey: 'polProbationary' },
    { value: '民主党派成员', labelKey: 'polDemocratic' },
    { value: '无党派人士', labelKey: 'polNonPartisan' },
  ]
  const MARITAL_OPTIONS = [
    { value: '未婚', labelKey: 'marUnmarried' },
    { value: '已婚', labelKey: 'marMarried' },
    { value: '保密', labelKey: 'marSecret' },
  ]

  // 民族选项：集中清单 + 兼容历史自由文本值。
  // 该字段早期是文本框，存量数据可能不在 56 个民族清单内（如「汉」「穿青人」），
  // 这类非清单值插到首位原样回显，保证「编辑时已保存的值一定能看到」。
  // （常见情况直接用模块级常量，不产生新数组，避免每次渲染都换 options 引用。）
  const ethnicityOptions: SelectOption[] =
    p && p.ethnicity && !isKnownEthnicity(p.ethnicity)
      ? [{ value: p.ethnicity, label: p.ethnicity }, ...ETHNICITY_OPTIONS]
      : ETHNICITY_OPTIONS

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
          <User className="size-icon-md text-primary-600" />
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
              <img src={p.avatar} alt={t('avatarAlt')} className="w-full h-full object-cover" />
              <Tooltip label={t('removePhoto')} className="absolute inset-0">
                <button
                  onClick={removeAvatar}
                  aria-label={t('removePhoto')}
                  className="w-full h-full bg-[var(--material-overlay)] flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="size-icon-lg text-white" />
                </button>
              </Tooltip>
            </>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-0.5 text-surface-400 hover:text-primary-500 transition-colors"
            >
              <Camera className="size-icon-lg" />
              <span className="text-[9px]">{t('photo')}</span>
            </button>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-surface-700">{t('personalPhoto')}</p>
          <p className="text-xs text-surface-400 mt-0.5">{t('photoHint')}</p>
          {photoError && (
            <p className="text-xs text-danger-500 mt-1 flex items-center gap-1">
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
          <div className="glass glass-card flex-[4] min-w-0 p-3 space-y-2">
            <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-surface-600">{t('displaySize')}</span>
            <div className="flex items-center gap-2">
              <div className="w-[128px] flex-shrink-0">
                <CustomSelect
                  value={ratioPreset}
                  onChange={handlePresetChange}
                  options={RATIO_PRESETS.map((pr) => ({ value: pr.key, label: t(pr.labelKey) }) as SelectOption)}
                  triggerClassName="!px-2 !py-0.5"
                />
              </div>
              <label className="flex items-center gap-1.5 text-xs text-surface-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={lockRatio}
                  onChange={(e) => {
                    setLockRatio(e.target.checked)
                    if (!e.target.checked) setRatioPreset('custom')
                  }}
                  className="size-icon-sm rounded accent-primary-600"
                />
                {t('lockRatio')}
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between text-[12px] text-surface-500 mb-1">
                <span>{t('width')}</span>
                <span className="tabular-nums font-medium text-surface-700">{avatarW}px</span>
              </div>
              <input
                type="range"
                min={40}
                max={200}
                step={1}
                value={avatarW}
                onChange={(e) => handleWidthChange(Number(e.target.value))}
                className="range-slider w-full"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-[12px] text-surface-500 mb-1">
                <span>{t('height')}</span>
                <span className="tabular-nums font-medium text-surface-700">{avatarH}px</span>
              </div>
              <input
                type="range"
                min={40}
                max={200}
                step={1}
                value={avatarH}
                onChange={(e) => handleHeightChange(Number(e.target.value))}
                className="range-slider w-full"
              />
            </div>
          </div>

          {/* 头像圆角（仅当前简历；0=直角矩形，100=圆形） */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-[12px] text-surface-500 mb-1">
              <span className="flex items-center gap-1">
                <span>{t('cornerRadius')}</span>
                {styleState.avatarRadius == null && <span className="text-surface-400">{t('followTemplate')}</span>}
              </span>
              <span className="tabular-nums font-medium text-surface-700">{styleState.avatarRadius ?? radiusFallback ?? 0}</span>
            </div>
            <AnimatedRange
              value={styleState.avatarRadius ?? radiusFallback ?? 0}
              min={AVATAR_RADIUS_MIN}
              max={AVATAR_RADIUS_MAX}
              onChange={(v) => updateCustomCss({ avatarRadius: v })}
              className="w-full"
            />
            <p className="text-[10px] text-surface-400 mt-1">{t('radiusHint')}</p>
          </div>
          </div>

          {/* 信息区布局：切换头像与文字排布；仅当前简历，双栏模板禁用。 */}
          <div className="glass glass-card flex-1 p-3 flex flex-col">
            <p className="text-xs font-medium text-surface-600 mb-2">{t('headerLayout')}</p>
            <div className="flex flex-col justify-between gap-1.5 flex-1">
              {HEADER_LAYOUT_PRESETS.map((preset) => {
                const active = effectiveLayout === preset.key
                return (
                  <Tooltip
                    key={preset.key}
                    label={isDoubleColumn ? t('hintDoubleColumn') : t(preset.labelKey)}
                    className="flex-1 min-h-0"
                  >
                    <button
                      type="button"
                      disabled={isDoubleColumn}
                      onClick={() => onSelectHeaderLayout(preset.key)}
                      className={`group h-full w-full flex items-center justify-center rounded-md transition-all duration-200 ease-out active:scale-95 ${
                        isDoubleColumn ? 'opacity-50 cursor-not-allowed' : ''
                      } ${
                        active
                          ? 'bg-primary-100'
                          : 'bg-surface-200/80 hover:bg-surface-300'
                      }`}
                    >
                      <span>
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
          <label className="form-label">{t('fullName')}</label>
          <input className="form-input" value={p.full_name || ''} onChange={handleChange('full_name')} placeholder="张三" maxLength={50} />
        </div>
        <div>
          <label className="form-label">{t('englishName')}</label>
          <input className="form-input" value={p.english_name || ''} onChange={handleChange('english_name')} placeholder="San Zhang" maxLength={100} />
        </div>
        <div>
          <label className="form-label">{t('jobTitle')}</label>
          <input className="form-input" value={p.job_title || ''} onChange={handleChange('job_title')} placeholder="高级前端工程师" maxLength={100} />
        </div>
        <div>
          <label className="form-label">{t('email')}</label>
          <input className="form-input" value={p.email || ''} onChange={handleChange('email')} type="email" placeholder="zhangsan@example.com" maxLength={100} />
        </div>
        <div>
          <label className="form-label">{t('phone')}</label>
          <input className="form-input" value={p.phone || ''} onChange={handleChange('phone')} placeholder="138-0000-0000" maxLength={30} />
        </div>
        <div>
          <label className="form-label">{t('location')}</label>
          <input className="form-input" value={p.location || ''} onChange={handleChange('location')} placeholder="北京" maxLength={100} />
        </div>
        <div>
          <label className="form-label">{t('website')}</label>
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
          <label className="form-label">{t('wechat')}</label>
          <input className="form-input" value={p.wechat || ''} onChange={handleChange('wechat')} placeholder={t('wechatPlaceholder')} maxLength={50} />
        </div>
        {/* 国央企求职场景档案字段：布局/间距/字体/标签样式与上方字段完全一致（同一 grid）。 */}
        <div>
          <label className="form-label">{t('nativePlace')}</label>
          <input className="form-input" value={p.native_place || ''} onChange={handleChange('native_place')} placeholder="河北石家庄" maxLength={50} />
        </div>
        <div>
          <label className="form-label">{t('ethnicity')}</label>
          {/*
            民族：选项来自 lib/ethnicityOptions 集中维护的 56 个民族清单。
            · value/label 都是中文原名，与 political_status / marital_status 一致，
              模板渲染与后端 autofill 无需映射，提交格式不变（personal.ethnicity 字符串）。
            · 未选择时展示默认项「汉族」（清单首位），只有用户主动选择才写入数据。
            · 存量数据是自由文本输入的，可能落在清单之外（如「汉」「穿青人」），
              这种值原样回显到选项首位，避免显示成空的占位符、也避免用户不小心覆盖掉。
          */}
          <CustomSelect
            value={p.ethnicity || DEFAULT_ETHNICITY}
            onChange={(v) => updateField('personal.ethnicity', v)}
            options={ethnicityOptions}
            placeholder={t('ethnicity')}
          />
        </div>
        <div>
          <label className="form-label">{t('birthday')}</label>
          <MonthPicker value={p.birthday || ''} onChange={(v) => updateField('personal.birthday', v)} />
        </div>
        <div>
          <label className="form-label">{t('age')}</label>
          <input className="form-input" value={p.age ?? ''} onChange={(e) => updateField('personal.age', parseInt(e.target.value) || 0)} type="number" min={16} max={70} placeholder="28" />
        </div>
        <div>
          <label className="form-label">{t('politicalStatus')}</label>
          <CustomSelect
            value={p.political_status || ''}
            onChange={(v) => updateField('personal.political_status', v)}
            options={POLITICAL_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }) as SelectOption)}
            placeholder={t('politicalStatus')}
          />
        </div>
        <div>
          <label className="form-label">{t('maritalStatus')}</label>
          <CustomSelect
            value={p.marital_status || ''}
            onChange={(v) => updateField('personal.marital_status', v)}
            options={MARITAL_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }) as SelectOption)}
            placeholder={t('maritalStatus')}
          />
        </div>
        <div>
          <label className="form-label">{t('partyJoinDate')}</label>
          <MonthPicker value={p.party_join_date || ''} onChange={(v) => updateField('personal.party_join_date', v)} />
        </div>
        <div>
          <label className="form-label">{t('titleRank')}</label>
          <input className="form-input" value={p.title_rank || ''} onChange={handleChange('title_rank')} placeholder="工程师 / 中级" maxLength={50} />
        </div>
        <div>
          <label className="form-label">{t('householdRegistration')}</label>
          <input className="form-input" value={p.household_registration || ''} onChange={handleChange('household_registration')} placeholder="河北省石家庄市" maxLength={100} />
        </div>
        <div>
          <label className="form-label">{t('currentResidence')}</label>
          <input className="form-input" value={p.current_residence || ''} onChange={handleChange('current_residence')} placeholder="北京市海淀区" maxLength={100} />
        </div>
        <div>
          <label className="form-label">{t('yearsOfExp')}</label>
          <input className="form-input" value={p.years_of_exp || ''} onChange={(e) => updateField('personal.years_of_exp', parseInt(e.target.value) || 0)} type="number" min={0} max={50} placeholder="5" />
        </div>
        {/* 自定义字段：字段名/字段值由用户输入，支持增删改；复用 ExtrasEditor（与项目成果子项同组件，
            样式、入场动画一致）。直接删除（无二确），数据写 personal.extras。 */}
        <div className="col-span-2">
          <label className="form-label">{t('customFields')}</label>
          <ExtrasEditor
            extras={p.extras || []}
            onChange={(extras) => updateField('personal.extras', extras)}
          />
        </div>
      </div>
    </div>
  )
}
