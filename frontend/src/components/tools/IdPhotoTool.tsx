import { useCallback, useEffect, useRef, useState } from 'react'
import ReactCrop, { type Crop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import {
  Upload, Download, ArrowLeft, Check, Image as ImageIcon, Camera, Crop as CropIcon, Loader2, FolderOpen, AlertCircle,
} from 'lucide-react'
import { AnimatedRange } from '../ui/AnimatedRange'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { callService, isWails } from '../../services/backend'
import { extractErrorMessage } from '../../lib/errorUtils'
import { useT } from '../../lib/i18n'
import {
  SIZE_PRESETS, BG_PRESETS, mmToPx, centerCropToSize,
  canvasByteSize, downloadCanvas, formatBytes, cropCanvas, centeredAspectBox, fitAspectBox, applyMatte,
} from './lib'
import type { NormRect } from './lib'
import { computeMatte } from './aiMatting'
import type { Matte } from './aiMatting'

interface Props {
  onBack: () => void
}

const QUALITY = 90
const DPI = 300

/** 可导出的图片格式。WebP/JPG 有损质量可调；PNG 无损不支持质量参数。 */
export type ExportFmt = 'jpg' | 'png' | 'webp'
const FMT_INFO: Record<ExportFmt, { label: string; mime: string; ext: string; lossy: boolean }> = {
  jpg: { label: 'JPG', mime: 'image/jpeg', ext: 'jpg', lossy: true },
  png: { label: 'PNG', mime: 'image/png', ext: 'png', lossy: false },
  webp: { label: 'WebP', mime: 'image/webp', ext: 'webp', lossy: true },
}

/** 从源图像构造等尺寸 canvas 并绘制。 */
function canvasFrom(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  c.getContext('2d')!.drawImage(img, 0, 0)
  return c
}

export function IdPhotoTool({ onBack }: Props) {
  const t = useT()
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [sourceBytes, setSourceBytes] = useState(0)

  const [quality, setQuality] = useState(QUALITY)
  const [dpi, setDpi] = useState(DPI)
  // DPI 手动输入草稿：拖动条与输入框双向联动，输入时允许中间态、失焦再提交并 clamp
  const [dpiText, setDpiText] = useState(String(DPI))
  // 记录 DPI 输入框是否聚焦：聚焦时输入的即时值不被「dpi→文本」同步 effect 覆盖，
  // 从而规避把中间输入（如只输了 35 想继续输 350）打断成 clamp 后的值。
  const dpiFocusedRef = useRef(false)
  const [presetId, setPresetId] = useState('')
  const [fmt, setFmt] = useState<ExportFmt>('jpg')
  // AI 智能换底：开启后对源图做 MODNet 人像分割，再把保留区域垫上目标底色
  const [bgEnabled, setBgEnabled] = useState(false)
  const [bgRgb, setBgRgb] = useState<[number, number, number]>(BG_PRESETS[2].rgb)
  const [matte, setMatte] = useState<Matte | null>(null)
  const [matting, setMatting] = useState(false)
  const [matteError, setMatteError] = useState('')

  // 裁剪框（归一化 0..1，相对原图宽高）。默认铺满整张图。
  // ReactCrop 负责拖拽/手柄/比例锁定，这里仅保存其 px 裁剪映射来的归一化矩形。
  const [cropNorm, setCropNorm] = useState<NormRect>({ x: 0, y: 0, w: 1, h: 1 })
  // 源图预览画布的渲染尺寸（按预览区宽度等比缩放）
  const [preview, setPreview] = useState<{ w: number; h: number } | null>(null)

  const srcCanvasRef = useRef<HTMLCanvasElement | null>(null)
  // resultCanvasRef 存「合成结果 canvas」（离屏，仅供编码/下载）；previewRef 是结果预览画布。
  const resultCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const previewRef = useRef<HTMLCanvasElement | null>(null)
  const cellRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const byteTimerRef = useRef<number | null>(null)

  const [resultBytes, setResultBytes] = useState(0)
  const [resultLabel, setResultLabel] = useState('')
  // 保存状态（走原生对话框 + 应用内结果弹窗，不使用浏览器下载栏）
  const [saving, setSaving] = useState(false)
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [saveError, setSaveError] = useState('')

  const mime = FMT_INFO[fmt].mime

  const preset = SIZE_PRESETS.find((p) => p.id === presetId)
  const presetAspect = preset ? preset.widthMm / preset.heightMm : null

  // ReactCrop 受控 crop 使用「显示像素」空间（即预览画布尺寸），这是其 onChange 第一参
// 的坐标系；用 preview px 与 cropNorm 互转，不受自然尺寸影响。
  const cropPx: Crop | undefined = preview
    ? {
        x: cropNorm.x * preview.w,
        y: cropNorm.y * preview.h,
        width: cropNorm.w * preview.w,
        height: cropNorm.h * preview.h,
        unit: 'px',
      }
    : undefined

  const onCropChange = (px: Crop) => {
    if (!preview) return
    setCropNorm({
      x: px.x / preview.w,
      y: px.y / preview.h,
      w: px.width / preview.w,
      h: px.height / preview.h,
    })
  }

  // 计算源图预览渲染尺寸（等比适应预览区）
  const measurePreview = useCallback((img: HTMLImageElement) => {
    const cell = cellRef.current
    if (!cell) {
      setPreview(null)
      return
    }
    const MAX_W = 340
    const MAX_H = 460
    const availW = Math.max(160, cell.clientWidth - 16)
    let w = Math.min(availW, MAX_W)
    let h = Math.round((w * img.naturalHeight) / img.naturalWidth)
    if (h > MAX_H) {
      h = MAX_H
      w = Math.round((h * img.naturalWidth) / img.naturalHeight)
    }
    setPreview({ w, h })
  }, [])

  useEffect(() => {
    const cell = cellRef.current
    if (!cell || !sourceImg) return
    measurePreview(sourceImg)
    const ro = new ResizeObserver(() => {
      if (sourceImg) measurePreview(sourceImg)
    })
    ro.observe(cell)
    return () => ro.disconnect()
  }, [sourceImg, measurePreview])

  // 选择证件照尺寸预设。用 fitAspectBox 按图片宽高比补偿，让选区在像素空间
  // 严格等于目标宽高比（与 ReactCrop 的 aspect 锁定一致），避免点击后比例错位、
  // 需拖动才纠正；presetId 同时用作 ReactCrop 的 key 以兜底重挂载刷新。
  const selectPreset = (id: string) => {
    setPresetId(id)
    const p = SIZE_PRESETS.find((x) => x.id === id)
    if (p && sourceImg) {
      setCropNorm(fitAspectBox(sourceImg.naturalWidth / sourceImg.naturalHeight, p.widthMm / p.heightMm))
    } else if (p) {
      setCropNorm(centeredAspectBox(p.widthMm / p.heightMm))
    }
  }

  // 解析并提交 DPI 手动输入：非法值回退当前，合法则 clamp 到 [MIN_DPI, MAX_DPI] 并取整
  const commitDpi = () => {
    const n = parseInt(dpiText, 10)
    const v = Number.isFinite(n) ? Math.min(600, Math.max(72, n)) : dpi
    setDpi(v)
    setDpiText(String(v))
  }

  // 拖动条改变 dpi（或失焦提交）时，把输入框显示同步为实际值；聚焦里输入时不覆盖用户草稿
  useEffect(() => {
    if (!dpiFocusedRef.current) setDpiText(String(dpi))
  }, [dpi])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSourceName(file.name)
    setSourceBytes(file.size)
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result as string
      const img = new Image()
      img.onload = () => {
        setSourceUrl(url)
        setSourceImg(img)
        setCropNorm({ x: 0, y: 0, w: 1, h: 1 })
      }
      img.src = url
    }
    reader.readAsDataURL(file)
  }

  // 重建结果。单独抽出，供 rAF 节流调用。
  const rebuild = useCallback(
    (img: HTMLImageElement, pid: string, d: number, cr: NormRect) => {
      let cur = canvasFrom(img)
      // AI 智能换底：用 matte 作为 alpha，在全图上垫目标底色，再随裁剪/缩放。
      if (bgEnabled && matte) {
        cur = applyMatte(cur, matte.width, matte.height, matte.alpha, bgRgb)
      }
      const nearFull = cr.x <= 0.001 && cr.y <= 0.001 && cr.w >= 0.999 && cr.h >= 0.999
      if (!nearFull) {
        const nw = img.naturalWidth
        const nh = img.naturalHeight
        const r = { x: cr.x * nw, y: cr.y * nh, w: cr.w * nw, h: cr.h * nh }
        if (r.w > 1 && r.h > 1) cur = cropCanvas(cur, r)
      }
      const p = SIZE_PRESETS.find((x) => x.id === pid)
      if (p && preview) {
        const w = mmToPx(p.widthMm, d)
        const h = mmToPx(p.heightMm, d)
        cur = centerCropToSize(cur, w, h)
      }
      resultCanvasRef.current = cur
      const el = previewRef.current
      if (el) {
        el.width = cur.width
        el.height = cur.height
        el.getContext('2d')!.drawImage(cur, 0, 0)
      }
      setResultLabel(bgEnabled && !matte ? `${t('smartMattingShort')} ` : `${cur.width} × ${cur.height} px · `)
    },
    [preview, bgEnabled, bgRgb, matte, t],
  )

  // AI 换底开启时，对源图做一次人像分割，得到 matte（缓存；换底色只改 bgRgb 不重抠）。
  useEffect(() => {
    if (!bgEnabled || !sourceImg) {
      setMatte(null)
      setMatteError('')
      return
    }
    let cancelled = false
    setMatting(true)
    setMatteError('')
    computeMatte(sourceImg)
      .then((m) => {
        if (!cancelled) setMatte(m)
      })
      .catch((e) => {
        if (!cancelled) setMatteError(extractErrorMessage(e, t('aiMattingFailed')))
      })
      .finally(() => {
        if (!cancelled) setMatting(false)
      })
    return () => {
      cancelled = true
    }
  }, [bgEnabled, sourceImg, t])

  // 像素重建用 rAF 节流：高频拖动（裁剪框/DIP 条）时同帧内只执行一次，避免每帧重算。
  useEffect(() => {
    if (!sourceImg) return
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rebuild(sourceImg, presetId, dpi, cropNorm)
    })
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [sourceImg, presetId, dpi, cropNorm, bgEnabled, bgRgb, matte, rebuild])

  // 字节数 / 压缩率用防抖：不在每次拖动时实时 toBlob 编码，停止操作 350ms 后再算。
  useEffect(() => {
    const c = resultCanvasRef.current
    if (!c) return
    setResultBytes(0) // 立即清零，避免显示过期值
    if (byteTimerRef.current !== null) window.clearTimeout(byteTimerRef.current)
    byteTimerRef.current = window.setTimeout(() => {
      canvasByteSize(c, mime, quality / 100).then((b) => setResultBytes(b))
    }, 350)
    return () => {
      if (byteTimerRef.current !== null) window.clearTimeout(byteTimerRef.current)
      byteTimerRef.current = null
    }
  }, [sourceImg, presetId, dpi, cropNorm, bgEnabled, bgRgb, matte, quality, mime])

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    if (byteTimerRef.current !== null) window.clearTimeout(byteTimerRef.current)
  }, [])

  const handleDownload = async () => {
    const c = resultCanvasRef.current
    if (!c) return
    const dot = sourceName.lastIndexOf('.')
    const base = dot > 0 ? sourceName.slice(0, dot) : 'resume-photo'
    const ext = FMT_INFO[fmt].ext

    // 纯浏览器开发模式（无 Wails）下退化为 blob 下载；桌面端走原生保存对话框
    if (!isWails()) {
      downloadCanvas(c, mime, `${base}-output.${ext}`, quality / 100)
      return
    }

    setSaving(true)
    setSaveError('')
    try {
      const dataUrl = c.toDataURL(mime, quality / 100)
      const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
      const path = await callService<string>('ToolService', 'SaveImage', b64, ext, base)
      // path 为空 = 用户取消，不做任何提示
      if (path) setSavedPath(path)
    } catch (err) {
      setSaveError(extractErrorMessage(err, t('saveImageFailed')))
    } finally {
      setSaving(false)
    }
  }

  const empty = !sourceImg
  const cropActive = cropNorm.w < 0.999 || cropNorm.h < 0.999 || cropNorm.x > 0.001 || cropNorm.y > 0.001

  return (
    <div className="space-y-4 animate-page-enter">
      {/* 头部 */}
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="btn-ghost btn-sm" title={t('backToToolbox')}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Camera className="w-5 h-5 text-surface-500" />
        <h2 className="text-base font-semibold text-surface-800">{t('idPhotoKit')}</h2>
        {sourceName && (
          <span className="text-xs text-surface-400 truncate ml-1 max-w-[180px]">{sourceName}</span>
        )}
      </div>

      {/* 文件选择 */}
      <div className="form-section">
        <label className="w-full p-4 rounded-lg border-2 border-dashed border-surface-300 flex items-center justify-center gap-2 cursor-pointer hover:border-primary-400 hover:bg-surface-50 transition-colors">
          <Upload className="w-4 h-4 text-surface-400" />
          <span className="text-sm text-surface-600">{empty ? t('choosePhoto') : t('changePhoto')}</span>
          <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,340px)_1fr] gap-4">
        {/* 控制区 */}
        <div className="space-y-4">
          {/* 压缩 */}
          <section className="form-section">
            <div className="form-section-header">
              <span className="form-section-title">{t('compression')}</span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs text-surface-500 mb-1">
                  <span>{t('imageQuality')}</span>
                  <span>{quality}</span>
                </div>
                <AnimatedRange
                  value={quality}
                  min={1}
                  max={100}
                  onChange={setQuality}
                  className="w-full"
                />
              </div>
              {!empty && (
                <div className="grid grid-cols-3 gap-2 text-xs text-surface-600">
                  <div className="p-2 rounded bg-surface-50 border border-surface-200">
                    <p className="text-surface-400">{t('originalImg')}</p>
                    <p className="font-medium">{formatBytes(sourceBytes)}</p>
                  </div>
                  <div className="p-2 rounded bg-surface-50 border border-surface-200">
                    <p className="text-surface-400">{t('outputImg')}</p>
                    <p className="font-medium">{resultBytes > 0 ? formatBytes(resultBytes) : t('computing')}</p>
                  </div>
                  <div className="p-2 rounded bg-surface-50 border border-surface-200">
                    <p className="text-surface-400">{t('compressionRate')}</p>
                    <p className="font-medium">
                      {resultBytes > 0 && sourceBytes > 0 ? `${Math.max(0, Math.round((1 - resultBytes / sourceBytes) * 100))}%` : '—'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* 尺寸 */}
          <section className="form-section">
            <div className="form-section-header">
              <span className="form-section-title">{t('idPhotoSize')}</span>
            </div>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => selectPreset('')}
                  className={`btn btn-sm ${presetId === '' ? 'bg-surface-100 text-surface-800' : 'text-surface-500 hover:bg-surface-100'}`}
                >
                  {t('noCrop')}
                </button>
                {SIZE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => selectPreset(p.id)}
                    className={`btn btn-sm ${presetId === p.id ? 'bg-primary-600 text-white' : 'text-surface-500 hover:bg-surface-100'}`}
                  >
                    {t(p.nameKey)}
                  </button>
                ))}
              </div>
              <div>
                <div className="flex items-center justify-between text-xs text-surface-500 mb-1">
                  <span>DPI</span>
                  <input
                    type="number"
                    min={72}
                    max={600}
                    inputMode="numeric"
                    value={dpiText}
                    onChange={(e) => {
                      const raw = e.target.value
                      setDpiText(raw)
                      // 输入到合法、完整的数值时即时驱动滑块；中间态/越界暂不提交，留待失焦 clamp
                      const n = parseInt(raw, 10)
                      if (Number.isFinite(n) && n >= 72 && n <= 600) setDpi(n)
                    }}
                    onFocus={() => {
                      dpiFocusedRef.current = true
                    }}
                    onBlur={() => {
                      dpiFocusedRef.current = false
                      commitDpi()
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    }}
                    className="w-12 h-6 text-right text-[11px] px-1 border border-surface-200 rounded-md bg-elev text-surface-700 focus:outline-none focus:ring-1 focus:ring-primary-400"
                    title={t('dpiHint')}
                  />
                </div>
                <AnimatedRange value={dpi} min={72} max={600} onChange={setDpi} className="w-full" />
              </div>
              {/* 目标尺寸提示：选中预设时展开、取消时收起（0fr→1fr 高度渐变）。内容始终渲染
             （预设为空时用占位），收起时高度才能从 1fr 平滑过渡到 0fr */}
              <div className={`grid transition-all duration-200 ${preset ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                  <div className={`pt-1 space-y-0.5 text-xs min-h-0 ${preset ? '' : 'invisible'}`}>
                    <p className="text-surface-600">
                      {preset
                        ? t('targetSizeHint')
                            .replace('{w}', String(preset.widthMm))
                            .replace('{h}', String(preset.heightMm))
                            .replace('{pw}', String(mmToPx(preset.widthMm, dpi)))
                            .replace('{ph}', String(mmToPx(preset.heightMm, dpi)))
                            .replace('{note}', dpi === DPI ? t('stdOutputNote').replace('{dpi}', String(dpi)) : '')
                        : '\u00A0'}
                    </p>
                    <p className="text-surface-400">
                      {preset
                        ? t('physicalSizeHint')
                            .replace('{w}', String(preset.widthMm))
                            .replace('{h}', String(preset.heightMm))
                            .replace('{dpi}', String(dpi))
                            .replace('{stdNote}', dpi !== DPI ? t('stdDpiNote')
                              .replace('{dpi}', String(DPI))
                              .replace('{pw}', String(mmToPx(preset.widthMm, DPI)))
                              .replace('{ph}', String(mmToPx(preset.heightMm, DPI))) : '')
                            .replace('{stdDpi}', String(DPI))
                        : '\u00A0'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 自由裁剪 */}
          <section className="form-section">
            <div className="form-section-header">
              <div className="flex items-center gap-2">
                <CropIcon className="w-4 h-4 text-surface-400" />
                <span className="form-section-title">{t('freeCrop')}</span>
              </div>
            </div>
            <div className="space-y-2 text-xs text-surface-500">
              <p>{t('freeCropHint1')}</p>
              <p className="text-surface-400">{t('freeCropHint2')}</p>
              <button
                onClick={() =>
                  setCropNorm(
                    preset && sourceImg
                      ? fitAspectBox(sourceImg.naturalWidth / sourceImg.naturalHeight, preset.widthMm / preset.heightMm)
                      : { x: 0, y: 0, w: 1, h: 1 },
                  )
                }
                disabled={!cropActive}
                className="btn-secondary btn-sm inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CropIcon className="w-4 h-4" /> {t('resetCrop')}
              </button>
            </div>
          </section>

          {/* 换底（AI 智能抠图） */}
          <section className="form-section">
            <div className="form-section-header">
              <span className="form-section-title">{t('aiBg')}</span>
              <input
                type="checkbox"
                checked={bgEnabled}
                onChange={(e) => setBgEnabled(e.target.checked)}
                className="w-4 h-4 rounded accent-primary-600"
              />
            </div>
            <div className={`grid transition-all duration-200 ${bgEnabled ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
              <div className="overflow-hidden">
                <div className="space-y-3 pt-1">
                  {/* 去掉浅蓝预设后整组缩排：加水平内边距，使两端控件与父容器
                      overflow-hidden 边界留出缓冲，选中/按下态向外的外圈不再被遮挡 */}
                  <div className="flex flex-wrap items-center gap-1.5 px-2 py-1">
                    {BG_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setBgRgb(p.rgb)}
                        className={`flex items-center gap-1.5 btn btn-sm ${bgEnabled && bgRgb[0] === p.rgb[0] && bgRgb[1] === p.rgb[1] && bgRgb[2] === p.rgb[2] ? 'ring-2 ring-inset ring-primary-400' : 'text-surface-500 hover:bg-surface-100'}`}
                      >
                        <span
                          className="w-3 h-3 rounded-full inline-block shrink-0 border border-surface-300"
                          style={{ backgroundColor: `rgb(${p.rgb[0]}, ${p.rgb[1]}, ${p.rgb[2]})` }}
                        />
                        {t(p.nameKey)}
                      </button>
                    ))}
                    <input
                      type="color"
                      value={rgbToHex(bgRgb)}
                      onChange={(e) => setBgRgb(hexToRgb(e.target.value))}
                      className="w-8 h-8 rounded cursor-pointer border border-surface-200"
                      title={t('customColor')}
                    />
                  </div>
                  {matteError && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" /> {matteError}
                    </p>
                  )}
                  <p className="text-xs text-surface-500 flex items-center gap-1.5">
                    {matting && (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('aiMattingPleaseWait')}</>
                    )}
                    <span>{t('aiMattingHint')}</span>
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="form-section">
            <div className="form-section-header">
              <span className="form-section-title">{t('outputSettings')}</span>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-surface-500 mb-2">{t('exportFormat')}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(Object.keys(FMT_INFO) as ExportFmt[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFmt(f)}
                      className={`btn btn-sm ${fmt === f ? 'bg-primary-600 text-white' : 'text-surface-500 hover:bg-surface-100'}`}
                    >
                      {FMT_INFO[f].label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handleDownload}
                disabled={empty || saving}
                className="btn-primary w-full inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {t('savingElipsis')}</>
                ) : (
                  <><Download className="w-4 h-4" /> {t('saveImageFmt').replace('{fmt}', FMT_INFO[fmt].label)}{!empty && resultBytes > 0 ? `（${formatBytes(resultBytes)}）` : ''}</>
                )}
              </button>
            </div>
            {saveError && (
              <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" /> {saveError}
              </p>
            )}
          </section>
        </div>

        {/* 预览区 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg border border-surface-200 bg-elev p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-surface-400">{t('sourcePreview')}</p>
              {!empty && (
                <span className={`text-[11px] px-1.5 py-0.5 rounded ${cropActive ? 'bg-primary-100 text-primary-700' : 'bg-surface-100 text-surface-400'}`}>
                  {cropActive ? t('cropStatus') : t('fullImage')}
                </span>
              )}
            </div>
            <div ref={cellRef} className="flex items-center justify-center min-h-[220px] bg-surface-50 rounded overflow-hidden">
              {empty ? (
                <div className="flex flex-col items-center gap-2 text-surface-300 py-10">
                  <ImageIcon className="w-8 h-8" />
                  <span className="text-xs">{t('choosePhotoPrompt')}</span>
                </div>
              ) : preview && sourceUrl ? (
                <ReactCrop
                  key={presetId}
                  crop={cropPx}
                  onChange={onCropChange}
                  aspect={presetAspect ?? undefined}
                  minWidth={10}
                  minHeight={10}
                  keepSelection
                >
                  <img
                    src={sourceUrl}
                    className="block"
                    style={{ width: preview.w, height: preview.h }}
                    draggable={false}
                  />
                </ReactCrop>
              ) : (
                <span className="text-xs text-surface-300 py-10">{t('loadingElipsis')}</span>
              )}
            </div>
            {!empty && sourceImg && (
              <p className="text-xs text-surface-400 mt-2">{sourceImg.naturalWidth} × {sourceImg.naturalHeight} px</p>
            )}
          </div>
          <div className="rounded-lg border border-surface-200 bg-elev p-3">
            <p className="text-xs text-surface-400 mb-2">{t('resultLabel')}</p>
            <div className="relative flex items-center justify-center min-h-[220px] bg-surface-50 rounded overflow-hidden">
              {empty ? (
                <div className="flex flex-col items-center gap-2 text-surface-300 py-10">
                  <Check className="w-8 h-8" />
                  <span className="text-xs">{t('resultAfterChoose')}</span>
                </div>
              ) : (
                <canvas ref={previewRef} className="max-w-full max-h-[460px] w-auto h-auto animate-preview-enter" />
              )}
              {/* 智能抠图进行中：半透明遮罩盖住结果图，避免误以为卡住 */}
              {bgEnabled && !matte && matteError === '' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-50/70 backdrop-blur-[1px]">
                  <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                  <span className="text-xs text-surface-500">{matting ? t('smartMattingShort') : t('generating')}</span>
                </div>
              )}
            </div>
            {!empty && (
              <p className="text-xs text-surface-400 mt-2">{resultLabel}{resultBytes > 0 ? formatBytes(resultBytes) : t('computing')}</p>
            )}
          </div>
        </div>
      </div>

      {/* 保存结果弹窗（应用内自实现，替代浏览器原生下载栏） */}
      <ConfirmDialog
        open={!!savedPath}
        title={t('savedTitle')}
        description={t('savedDesc').replace('{path}', savedPath ?? '')}
        confirmText={t('ok')}
        icon={<FolderOpen className="w-5 h-5 text-primary-600" />}
        onConfirm={() => setSavedPath(null)}
        onCancel={() => setSavedPath(null)}
      />
    </div>
  )
}

/** RGB 元组 → #rrggbb。 */
function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** #rrggbb → RGB 元组。 */
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255]
}