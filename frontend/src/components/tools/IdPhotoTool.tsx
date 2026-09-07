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
import {
  SIZE_PRESETS, BG_PRESETS, mmToPx, replaceBackground, centerCropToSize,
  canvasByteSize, downloadCanvas, formatBytes, cropCanvas, centeredAspectBox,
} from './lib'
import type { BgParams, NormRect } from './lib'

interface Props {
  onBack: () => void
}

const QUALITY = 90
const DPI = 300

/** 从源图像构造等尺寸 canvas 并绘制。 */
function canvasFrom(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  c.getContext('2d')!.drawImage(img, 0, 0)
  return c
}

export function IdPhotoTool({ onBack }: Props) {
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [sourceBytes, setSourceBytes] = useState(0)

  const [quality, setQuality] = useState(QUALITY)
  const [dpi, setDpi] = useState(DPI)
  const [presetId, setPresetId] = useState('')
  const [keepAlpha, setKeepAlpha] = useState(false)
  const [bg, setBg] = useState<BgParams>({
    enabled: false,
    rgb: BG_PRESETS[2].rgb,
    tolerance: 35,
    feather: 20,
  })

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

  const mime = keepAlpha ? 'image/png' : 'image/jpeg'

  const preset = SIZE_PRESETS.find((p) => p.id === presetId)
  const presetAspect = preset ? preset.widthMm / preset.heightMm : null

  // 归一化裁剪框 → ReactCrop 的 px 裁剪（渲染尺寸空间）
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

  // 选择证件照尺寸预设时，裁剪框吸附到目标比例（居中内接框）
  useEffect(() => {
    if (presetAspect) setCropNorm(centeredAspectBox(presetAspect))
    // 仅在 preset 变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId])

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
    (img: HTMLImageElement, bgParams: BgParams, pid: string, d: number, cr: NormRect) => {
      let cur = canvasFrom(img)
      const nearFull = cr.x <= 0.001 && cr.y <= 0.001 && cr.w >= 0.999 && cr.h >= 0.999
      if (!nearFull) {
        const nw = img.naturalWidth
        const nh = img.naturalHeight
        const r = { x: cr.x * nw, y: cr.y * nh, w: cr.w * nw, h: cr.h * nh }
        if (r.w > 1 && r.h > 1) cur = cropCanvas(cur, r)
      }
      if (bgParams.enabled) cur = replaceBackground(cur, bgParams)
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
      setResultLabel(`${cur.width} × ${cur.height} px · `)
    },
    [preview],
  )

  // 像素重建用 rAF 节流：高频拖动（裁剪框/DIP 条）时同帧内只执行一次，避免每帧重算。
  useEffect(() => {
    if (!sourceImg) return
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rebuild(sourceImg, bg, presetId, dpi, cropNorm)
    })
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [sourceImg, bg, presetId, dpi, cropNorm, rebuild])

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
  }, [sourceImg, bg, presetId, dpi, cropNorm, quality, mime])

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    if (byteTimerRef.current !== null) window.clearTimeout(byteTimerRef.current)
  }, [])

  const handleDownload = async () => {
    const c = resultCanvasRef.current
    if (!c) return
    const dot = sourceName.lastIndexOf('.')
    const base = dot > 0 ? sourceName.slice(0, dot) : 'resume-photo'
    const ext = mime === 'image/png' ? 'png' : 'jpg'

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
      setSaveError(extractErrorMessage(err, '保存图片失败'))
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
        <button onClick={onBack} className="btn-ghost btn-sm" title="返回工具箱">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Camera className="w-5 h-5 text-surface-500" />
        <h2 className="text-base font-semibold text-surface-800">证件照工具包</h2>
        {sourceName && (
          <span className="text-xs text-surface-400 truncate ml-1 max-w-[180px]">{sourceName}</span>
        )}
      </div>

      {/* 文件选择 */}
      <div className="form-section">
        <label className="w-full p-4 rounded-lg border-2 border-dashed border-surface-300 flex items-center justify-center gap-2 cursor-pointer hover:border-primary-400 hover:bg-surface-50 transition-colors">
          <Upload className="w-4 h-4 text-surface-400" />
          <span className="text-sm text-surface-600">{empty ? '选择照片文件' : '更换照片'}</span>
          <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,340px)_1fr] gap-4">
        {/* 控制区 */}
        <div className="space-y-4">
          {/* 压缩 */}
          <section className="form-section">
            <div className="form-section-header">
              <span className="form-section-title">压缩</span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs text-surface-500 mb-1">
                  <span>图片质量</span>
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
                    <p className="text-surface-400">原图</p>
                    <p className="font-medium">{formatBytes(sourceBytes)}</p>
                  </div>
                  <div className="p-2 rounded bg-surface-50 border border-surface-200">
                    <p className="text-surface-400">输出</p>
                    <p className="font-medium">{resultBytes > 0 ? formatBytes(resultBytes) : '计算中…'}</p>
                  </div>
                  <div className="p-2 rounded bg-surface-50 border border-surface-200">
                    <p className="text-surface-400">压缩率</p>
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
              <span className="form-section-title">证件照尺寸</span>
            </div>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setPresetId('')}
                  className={`btn btn-sm ${presetId === '' ? 'bg-surface-100 text-surface-800' : 'text-surface-500 hover:bg-surface-100'}`}
                >
                  不裁剪
                </button>
                {SIZE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPresetId(p.id)}
                    className={`btn btn-sm ${presetId === p.id ? 'bg-primary-600 text-white' : 'text-surface-500 hover:bg-surface-100'}`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <div>
                <div className="flex items-center justify-between text-xs text-surface-500 mb-1">
                  <span>DPI</span>
                  <span>{dpi}</span>
                </div>
                <AnimatedRange
                  value={dpi}
                  min={72}
                  max={600}
                  onChange={setDpi}
                  className="w-full"
                />
              </div>
              {/* 目标尺寸提示：选中预设时展开、取消时收起（0fr→1fr 高度渐变） */}
              <div className={`grid transition-all duration-200 ${preset ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                  <p className="text-xs text-surface-500 pt-1">
                    目标：{preset ? `${preset.widthMm} × ${preset.heightMm} mm → ${mmToPx(preset.widthMm, dpi)} × ${mmToPx(preset.heightMm, dpi)} px（${dpi} dpi）` : ''}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 自由裁剪 */}
          <section className="form-section">
            <div className="form-section-header">
              <div className="flex items-center gap-2">
                <CropIcon className="w-4 h-4 text-surface-400" />
                <span className="form-section-title">自由裁剪</span>
              </div>
            </div>
            <div className="space-y-2 text-xs text-surface-500">
              <p>在左侧预览图上拖动选框调整保留区域：拖框体移动，拖四角缩放。</p>
              <p className="text-surface-400">选择证件照尺寸后，选框将锁定为对应比例。</p>
              <button
                onClick={() => setCropNorm(presetAspect ? centeredAspectBox(presetAspect) : { x: 0, y: 0, w: 1, h: 1 })}
                disabled={!cropActive}
                className="btn-secondary btn-sm inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CropIcon className="w-4 h-4" /> 重置裁剪
              </button>
            </div>
          </section>

          {/* 换底 */}
          <section className="form-section">
            <div className="form-section-header">
              <span className="form-section-title">背景换底</span>
              <input
                type="checkbox"
                checked={bg.enabled}
                onChange={(e) => setBg((p) => ({ ...p, enabled: e.target.checked }))}
                className="w-4 h-4 rounded accent-primary-600"
              />
            </div>
            <div className={`grid transition-all duration-200 ${bg.enabled ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
              <div className="overflow-hidden">
                <div className="space-y-3 pt-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {BG_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setBg((prev) => ({ ...prev, rgb: p.rgb }))}
                        className={`flex items-center gap-1.5 btn btn-sm ${bg.enabled && bg.rgb[0] === p.rgb[0] && bg.rgb[1] === p.rgb[1] && bg.rgb[2] === p.rgb[2] ? 'ring-2 ring-primary-400' : 'text-surface-500 hover:bg-surface-100'}`}
                      >
                        <span
                          className="w-3 h-3 rounded-full inline-block shrink-0 border border-surface-300"
                          style={{ backgroundColor: `rgb(${p.rgb[0]}, ${p.rgb[1]}, ${p.rgb[2]})` }}
                        />
                        {p.name}
                      </button>
                    ))}
                    <input
                      type="color"
                      value={rgbToHex(bg.rgb)}
                      onChange={(e) => setBg((prev) => ({ ...prev, rgb: hexToRgb(e.target.value) }))}
                      className="w-8 h-8 rounded cursor-pointer border border-surface-200"
                      title="自定义颜色"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs text-surface-500 mb-1">
                      <span>容差</span>
                      <span>{bg.tolerance}</span>
                    </div>
                    <AnimatedRange
                      value={bg.tolerance}
                      min={0}
                      max={100}
                      onChange={(v) => setBg((p) => ({ ...p, tolerance: v }))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs text-surface-500 mb-1">
                      <span>边缘羽化</span>
                      <span>{bg.feather}</span>
                    </div>
                    <AnimatedRange
                      value={bg.feather}
                      min={0}
                      max={100}
                      onChange={(v) => setBg((p) => ({ ...p, feather: v }))}
                      className="w-full"
                    />
                  </div>
                  <p className="text-xs text-surface-400">
                    换底为纯色算法，仅对背景均匀的照片效果较好；复杂/渐变背景请手动处理。
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="form-section">
            <div className="form-section-header">
              <span className="form-section-title">输出设置</span>
            </div>
            <label className="flex items-center justify-between p-3 rounded-lg border border-surface-200">
              <div>
                <p className="text-sm font-medium text-surface-700">保留透明背景</p>
                <p className="text-xs text-surface-400">导出为 PNG（关闭则以 JPEG 导出）</p>
              </div>
              <input
                type="checkbox"
                checked={keepAlpha}
                onChange={(e) => setKeepAlpha(e.target.checked)}
                className="w-4 h-4 rounded accent-primary-600"
              />
            </label>
            <button
              onClick={handleDownload}
              disabled={empty || saving}
              className="btn-primary w-full mt-3 inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> 保存中…</>
              ) : (
                <><Download className="w-4 h-4" /> 保存图片{!empty && resultBytes > 0 ? `（${formatBytes(resultBytes)}）` : ''}</>
              )}
            </button>
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
              <p className="text-xs text-surface-400">原图（可拖动裁剪）</p>
              {!empty && (
                <span className={`text-[11px] px-1.5 py-0.5 rounded ${cropActive ? 'bg-primary-100 text-primary-700' : 'bg-surface-100 text-surface-400'}`}>
                  {cropActive ? '已裁剪' : '整图'}
                </span>
              )}
            </div>
            <div ref={cellRef} className="flex items-center justify-center min-h-[220px] bg-surface-50 rounded overflow-hidden">
              {empty ? (
                <div className="flex flex-col items-center gap-2 text-surface-300 py-10">
                  <ImageIcon className="w-8 h-8" />
                  <span className="text-xs">请选择照片</span>
                </div>
              ) : preview && sourceUrl ? (
                <ReactCrop
                  crop={cropPx}
                  onChange={onCropChange}
                  aspect={presetAspect ?? undefined}
                  minWidth={20}
                  minHeight={20}
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
                <span className="text-xs text-surface-300 py-10">正在加载…</span>
              )}
            </div>
            {!empty && sourceImg && (
              <p className="text-xs text-surface-400 mt-2">{sourceImg.naturalWidth} × {sourceImg.naturalHeight} px</p>
            )}
          </div>
          <div className="rounded-lg border border-surface-200 bg-elev p-3">
            <p className="text-xs text-surface-400 mb-2">结果</p>
            <div className="flex items-center justify-center min-h-[220px] bg-surface-50 rounded overflow-hidden">
              {empty ? (
                <div className="flex flex-col items-center gap-2 text-surface-300 py-10">
                  <Check className="w-8 h-8" />
                  <span className="text-xs">选择照片后生成</span>
                </div>
              ) : (
                <canvas ref={previewRef} className="max-w-full max-h-[460px] w-auto h-auto animate-preview-enter" />
              )}
            </div>
            {!empty && (
              <p className="text-xs text-surface-400 mt-2">{resultLabel}{resultBytes > 0 ? formatBytes(resultBytes) : '计算中…'}</p>
            )}
          </div>
        </div>
      </div>

      {/* 保存结果弹窗（应用内自实现，替代浏览器原生下载栏） */}
      <ConfirmDialog
        open={!!savedPath}
        title="已保存"
        description={`图片已保存到：\n${savedPath ?? ''}`}
        confirmText="好的"
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