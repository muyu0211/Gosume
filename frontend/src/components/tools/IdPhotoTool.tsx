import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Upload, Download, ArrowLeft, Check, Image as ImageIcon, Camera, Crop as CropIcon,
} from 'lucide-react'
import { AnimatedRange } from '../ui/AnimatedRange'
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** 拖拽模式：move=移动裁剪框；其余为四个角的缩放。 */
type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

/** 由固定对角 + 光标位置 + 可选比例锁定，计算新的裁剪框（归一化坐标）。 */
function resizeFromCorner(
  o: NormRect,
  mode: DragMode,
  nx: number,
  ny: number,
  aspect: number | null,
): NormRect {
  const MIN = 0.02
  // 固定对角（不动的那只角）
  let ox: number
  let oy: number
  if (mode === 'se') { ox = o.x; oy = o.y }
  else if (mode === 'nw') { ox = o.x + o.w; oy = o.y + o.h }
  else if (mode === 'ne') { ox = o.x; oy = o.y + o.h }
  else { ox = o.x + o.w; oy = o.y } // sw

  if (aspect) {
    const dirX = nx >= ox ? 1 : -1
    const dirY = ny >= oy ? 1 : -1
    let dw = Math.max(MIN, Math.abs(ox - nx))
    let dh = Math.max(MIN, Math.abs(oy - ny))
    if (dw / dh > aspect) dh = dw / aspect
    else dw = dh * aspect
    let w = Math.min(dw, dirX > 0 ? 1 - ox : ox)
    let h = Math.min(dh, dirY > 0 ? 1 - oy : oy)
    if (w / h > aspect) h = w / aspect
    else w = h * aspect
    w = Math.max(MIN, Math.min(w, dirX > 0 ? 1 - ox : ox))
    h = Math.max(MIN, Math.min(h, dirY > 0 ? 1 - oy : oy))
    return { x: dirX > 0 ? ox : ox - w, y: dirY > 0 ? oy : oy - h, w, h }
  }

  const x = Math.min(ox, nx)
  const y = Math.min(oy, ny)
  let w = Math.abs(ox - nx)
  let h = Math.abs(oy - ny)
  w = Math.max(MIN, Math.min(w, 1 - x))
  h = Math.max(MIN, Math.min(h, 1 - y))
  return { x, y, w, h }
}

export function IdPhotoTool({ onBack }: Props) {
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null)
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
  const [crop, setCrop] = useState<NormRect>({ x: 0, y: 0, w: 1, h: 1 })
  // 源图预览画布的像素尺寸（按预览区宽度等比缩放，保证 1:1 显示、裁剪框与画布对齐）。
  const [preview, setPreview] = useState<{ w: number; h: number } | null>(null)

  const srcCanvasRef = useRef<HTMLCanvasElement | null>(null)
  // resultCanvasRef 存「合成结果 canvas」（离屏，仅供编码/下载/字节统计）；
  // previewRef 是挂载在 DOM 的结果预览 canvas，recompute 时把合成结果画入其中而非替换 ref。
  const resultCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const previewRef = useRef<HTMLCanvasElement | null>(null)
  const cellRef = useRef<HTMLDivElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ mode: DragMode; startX: number; startY: number; orig: NormRect } | null>(null)

  const [resultBytes, setResultBytes] = useState(0)
  const [resultLabel, setResultLabel] = useState('')

  // 当前输出编码参数
  const mime = keepAlpha ? 'image/png' : 'image/jpeg'

  const preset = SIZE_PRESETS.find((p) => p.id === presetId)
  const presetAspect = preset ? preset.widthMm / preset.heightMm : null

  // 计算源图预览画布尺寸（等比适应预览区）
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

  // 源图加载 / 预览区尺寸变化时重算预览画布尺寸
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

  // 选择证件照尺寸预设时，把裁剪框吸附到目标比例（居中内接框）
  useEffect(() => {
    if (presetAspect) setCrop(centeredAspectBox(presetAspect))
    // 仅在 preset 变化时触发；不依赖 presetAspect 之外的状态
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId])

  // 绘制原图预览（缩放到 preview 像素尺寸，1:1 显示）
  const drawSource = useCallback(
    (img: HTMLImageElement) => {
      const c = srcCanvasRef.current
      if (!c || !preview) return
      c.width = preview.w
      c.height = preview.h
      c.getContext('2d')!.drawImage(img, 0, 0, preview.w, preview.h)
    },
    [preview],
  )

  // 绘制结果：自由裁剪 → 换底 → 尺寸预设
  const recompute = useCallback(
    (img: HTMLImageElement, bgParams: BgParams, pid: string, d: number, cr: NormRect) => {
      let cur = canvasFrom(img)
      // 自由裁剪：裁剪框 ⇒ 源图像素矩形；铺满全图则跳过
      const nearFull = cr.x <= 0.001 && cr.y <= 0.001 && cr.w >= 0.999 && cr.h >= 0.999
      if (!nearFull) {
        const nw = img.naturalWidth
        const nh = img.naturalHeight
        const r = { x: cr.x * nw, y: cr.y * nh, w: cr.w * nw, h: cr.h * nh }
        if (r.w > 1 && r.h > 1) cur = cropCanvas(cur, r)
      }
      if (bgParams.enabled) cur = replaceBackground(cur, bgParams)
      const p = SIZE_PRESETS.find((x) => x.id === pid)
      if (p) {
        const w = mmToPx(p.widthMm, d)
        const h = mmToPx(p.heightMm, d)
        cur = centerCropToSize(cur, w, h)
      }
      resultCanvasRef.current = cur
      // 把合成结果绘制到挂载的结果预览 canvas（而不是替换它的 ref）
      const el = previewRef.current
      if (el) {
        el.width = cur.width
        el.height = cur.height
        el.getContext('2d')!.drawImage(cur, 0, 0)
      }
      setResultLabel(`${cur.width} × ${cur.height} px · `)
      setResultBytes(0) // 占位，由下一 effect 重新编码
    },
    [],
  )

  // 每次状态变化重建结果
  useEffect(() => {
    if (!sourceImg) return
    drawSource(sourceImg)
    recompute(sourceImg, bg, presetId, dpi, crop)
  }, [sourceImg, bg, presetId, dpi, crop, drawSource, recompute])

  // 编码字节数（随质量 / 编码格式 / 结果变化）
  useEffect(() => {
    const c = resultCanvasRef.current
    if (!c) return
    canvasByteSize(c, mime, quality / 100).then((b) => setResultBytes(b))
  }, [sourceImg, bg, presetId, dpi, crop, quality, mime])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSourceName(file.name)
    setSourceBytes(file.size)
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      setSourceImg(img)
      setCrop({ x: 0, y: 0, w: 1, h: 1 })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => URL.revokeObjectURL(url)
    img.src = url
  }

  // ---- 裁剪框交互 ----
  const startDrag = (e: React.PointerEvent<HTMLDivElement>, mode: DragMode) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, orig: { ...crop } }
  }

  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || !preview || !boxRef.current) return
    const box = boxRef.current.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return
    const nx = (e.clientX - box.left) / box.width
    const ny = (e.clientY - box.top) / box.height
    const o = d.orig
    if (d.mode === 'move') {
      const dx = nx - (d.startX - box.left) / box.width
      const dy = ny - (d.startY - box.top) / box.height
      setCrop({
        x: clamp(o.x + dx, 0, 1 - o.w),
        y: clamp(o.y + dy, 0, 1 - o.h),
        w: o.w,
        h: o.h,
      })
    } else {
      setCrop(resizeFromCorner(o, d.mode, nx, ny, presetAspect))
    }
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const clearCrop = () => {
    setCrop(presetAspect ? centeredAspectBox(presetAspect) : { x: 0, y: 0, w: 1, h: 1 })
  }

  const handleDownload = () => {
    const c = resultCanvasRef.current
    if (!c) return
    const dot = sourceName.lastIndexOf('.')
    const base = dot > 0 ? sourceName.slice(0, dot) : 'resume-photo'
    const ext = mime === 'image/png' ? 'png' : 'jpg'
    downloadCanvas(c, mime, `${base}-output.${ext}`, quality / 100)
  }

  const empty = !sourceImg
  const cropActive = crop.w < 0.999 || crop.h < 0.999 || crop.x > 0.001 || crop.y > 0.001

  const cornerHandles: Array<{ mode: DragMode; cls: string }> = [
    { mode: 'nw', cls: 'left-0 top-0 cursor-nwse-resize' },
    { mode: 'ne', cls: 'right-0 top-0 cursor-nesw-resize' },
    { mode: 'sw', cls: 'left-0 bottom-0 cursor-nesw-resize' },
    { mode: 'se', cls: 'right-0 bottom-0 cursor-nwse-resize' },
  ]

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
                    <p className="font-medium">{formatBytes(resultBytes)}</p>
                  </div>
                  <div className="p-2 rounded bg-surface-50 border border-surface-200">
                    <p className="text-surface-400">压缩率</p>
                    <p className="font-medium">
                      {sourceBytes > 0 ? `${Math.max(0, Math.round((1 - resultBytes / sourceBytes) * 100))}%` : '—'}
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
              {preset && (
                <p className="text-xs text-surface-500">
                  目标：{preset.widthMm} × {preset.heightMm} mm → {mmToPx(preset.widthMm, dpi)} × {mmToPx(preset.heightMm, dpi)} px（{dpi} dpi）
                </p>
              )}
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
                onClick={clearCrop}
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
            {/* 折叠面板：关闭换底时用 0fr→1fr 网格动画收起/展开 */}
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
              disabled={empty}
              className="btn-primary w-full mt-3 inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" /> 下载图片{!empty && resultBytes > 0 ? `（${formatBytes(resultBytes)}）` : ''}
            </button>
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
              ) : preview ? (
                <div ref={boxRef} className="relative" style={{ width: preview.w, height: preview.h }}>
                  <canvas
                    ref={srcCanvasRef}
                    width={preview.w}
                    height={preview.h}
                    className="block rounded-md animate-preview-enter"
                    style={{ width: preview.w, height: preview.h }}
                  />
                  {/* 裁剪框 */}
                  <div
                    className="absolute border-2 border-primary-500 bg-primary-500/10 cursor-move touch-none"
                    style={{
                      left: `${crop.x * 100}%`,
                      top: `${crop.y * 100}%`,
                      width: `${crop.w * 100}%`,
                      height: `${crop.h * 100}%`,
                    }}
                    onPointerDown={(e) => startDrag(e, 'move')}
                    onPointerMove={onDragMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  >
                    {cornerHandles.map(({ mode, cls }) => (
                      <div
                        key={mode}
                        className={`absolute w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-primary-500 border border-white touch-none ${cls}`}
                        onPointerDown={(e) => startDrag(e, mode)}
                        onPointerMove={onDragMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                      />
                    ))}
                  </div>
                </div>
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
              <p className="text-xs text-surface-400 mt-2">{resultLabel}{formatBytes(resultBytes)}</p>
            )}
          </div>
        </div>
      </div>
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