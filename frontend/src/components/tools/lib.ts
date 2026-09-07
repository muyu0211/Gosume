/**
 * 证件照工具包纯函数工具：尺寸换算、中心裁剪、纯色换底（色键+羽化）、预设常量、输出字节。
 */

/** 毫米 → 像素，按给定 DPI。 */
export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi)
}

export interface SizePreset {
  id: string
  name: string
  widthMm: number
  heightMm: number
}

/** 常见证件照尺寸（mm）。 */
export const SIZE_PRESETS: SizePreset[] = [
  { id: 'one', name: '一寸', widthMm: 25, heightMm: 35 },
  { id: 'smallone', name: '小一寸', widthMm: 22, heightMm: 32 },
  { id: 'two', name: '二寸', widthMm: 35, heightMm: 49 },
  { id: 'bigone', name: '大一寸', widthMm: 33, heightMm: 48 },
]

/** 换底目标色预设（RGB）。 */
export const BG_PRESETS: Array<{ id: string; name: string; rgb: [number, number, number] }> = [
  { id: 'white', name: '白色', rgb: [255, 255, 255] },
  { id: 'red', name: '红色', rgb: [213, 0, 0] },
  { id: 'blue', name: '蓝色', rgb: [67, 142, 235] },
  { id: 'lightblue', name: '浅蓝', rgb: [143, 183, 235] },
]

export interface BgParams {
  enabled: boolean
  rgb: [number, number, number]
  /** 0–100，识别为背景的 RGB 欧氏距离阈值。 */
  tolerance: number
  /** 0–128，边界羽化像素范围。 */
  feather: number
}

function rgbDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
}

/**
 * 纯色换底：采样源背景色（左上角像素），按 RGB 欧氏距离阈值识别背景，
 * 通过 alpha 渐变实现边界羽化，再以 destination-over 下垫目标色。
 * 返回新 canvas。仅对背景均匀的照片效果好。
 */
export function replaceBackground(
  source: HTMLImageElement | CanvasImageSource,
  params: BgParams,
): HTMLCanvasElement {
  const srcCanv = document.createElement('canvas')
  srcCanv.width = (source as HTMLCanvasElement).width || (source as HTMLImageElement).naturalWidth
  srcCanv.height = (source as HTMLCanvasElement).height || (source as HTMLImageElement).naturalHeight
  const sctx = srcCanv.getContext('2d')!
  sctx.drawImage(source as CanvasImageSource, 0, 0)

  const { width, height } = srcCanv
  const imageData = sctx.getImageData(0, 0, width, height)
  const data = imageData.data

  // 采样源背景色：取左上角、右上角、顶部中点平均，更稳。
  const idx = (x: number, y: number) => (y * width + x) * 4
  const corner = [data[idx(0, 0)], data[idx(0, 0) + 1], data[idx(0, 0) + 2]]
  const p1 = [data[idx(width - 1, 0)], data[idx(width - 1, 0) + 1], data[idx(width - 1, 0) + 2]]
  const p2 = [data[idx(Math.floor(width / 2), 0)], data[idx(Math.floor(width / 2), 0) + 1], data[idx(Math.floor(width / 2), 0) + 2]]
  const srcBg: [number, number, number] = [
    Math.round((corner[0] + p1[0] + p2[0]) / 3),
    Math.round((corner[1] + p1[1] + p2[1]) / 3),
    Math.round((corner[2] + p1[2] + p2[2]) / 3),
  ]

  const tol = (params.tolerance / 100) * 442 // 归一化到 RGB 立方体对角线
  const soft = params.feather > 0 ? (params.feather / 100) * 442 * 0.5 : 0

  for (let i = 0; i < data.length; i += 4) {
    const d = rgbDistance([data[i], data[i + 1], data[i + 2]], srcBg)
    if (d <= tol) {
      data[i + 3] = 0 // 完全透明
    } else if (soft > 0 && d <= tol + soft) {
      // 羽化带：半透明
      const a = Math.max(0, 1 - (d - tol) / soft)
      data[i + 3] = a * 255
    }
  }
  sctx.putImageData(imageData, 0, 0)

  // 下垫目标色
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const ctx = out.getContext('2d')!
  ctx.fillStyle = `rgb(${params.rgb[0]}, ${params.rgb[1]}, ${params.rgb[2]})`
  ctx.fillRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'destination-over'
  ctx.drawImage(srcCanv, 0, 0)
  return out
}

/**
 * 按目标像素尺寸中心裁剪重绘；若宽高比不同则放大到覆盖后居中。
 * 返回新 canvas。
 */
export function centerCropToSize(
  source: CanvasImageSource,
  targetW: number,
  targetH: number,
): HTMLCanvasElement {
  const srcCanv = document.createElement('canvas')
  const srcWidth = (source as HTMLCanvasElement).width || (source as HTMLImageElement).naturalWidth
  const srcHeight = (source as HTMLCanvasElement).height || (source as HTMLImageElement).naturalHeight
  srcCanv.width = srcWidth
  srcCanv.height = srcHeight
  srcCanv.getContext('2d')!.drawImage(source as CanvasImageSource, 0, 0)

  const out = document.createElement('canvas')
  out.width = targetW
  out.height = targetH
  const ctx = out.getContext('2d')!
  const scale = Math.max(targetW / srcWidth, targetH / srcHeight)
  const sw = srcWidth * scale
  const sh = srcHeight * scale
  const sx = targetW / 2 - sw / 2
  const sy = targetH / 2 - sh / 2
  ctx.drawImage(srcCanv, sx, sy, sw, sh)
  return out
}

/** 读取 canvas 编码后字节数。 */
export async function canvasByteSize(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number,
): Promise<number> {
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, quality))
  return blob ? blob.size : 0
}

/** 触发浏览器下载。 */
export function downloadCanvas(canvas: HTMLCanvasElement, mime: string, fileName: string, quality?: number): void {
  canvas.toBlob(async (blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, mime, quality)
}

/** 格式化字节数为可读字符串。 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export interface NormRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * 按像素矩形裁剪 canvas（矩形坐标在 source 像素空间）。
 * 返回新 canvas。
 */
export function cropCanvas(
  source: CanvasImageSource,
  rect: { x: number; y: number; w: number; h: number },
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(rect.w))
  out.height = Math.max(1, Math.round(rect.h))
  out.getContext('2d')!.drawImage(source as CanvasImageSource, -rect.x, -rect.y)
  return out
}

/**
 * 在单位平面（1×1）内，生成宽高比为 aspect（=w/h）的居中最大内接框。
 * 用于选择证件照尺寸预设时，把自由裁剪框吸附到目标比例。
 */
export function centeredAspectBox(aspect: number): NormRect {
  let w: number
  let h: number
  if (aspect <= 1) {
    h = 1
    w = aspect
  } else {
    w = 1
    h = 1 / aspect
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}