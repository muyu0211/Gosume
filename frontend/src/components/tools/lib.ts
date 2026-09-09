/**
 * 证件照工具包纯函数工具：尺寸换算、中心裁剪、纯色换底（色键+羽化）、预设常量、输出字节。
 */

/** 毫米 → 像素，按给定 DPI。 */
export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi)
}

export interface SizePreset {
  id: string
  /** i18n 词条 key（组件渲染时用 t(nameKey) 取文案）。 */
  nameKey: string
  widthMm: number
  heightMm: number
}

/** 常见证件照尺寸（mm）。nameKey 对应 i18n 词条。 */
export const SIZE_PRESETS: SizePreset[] = [
  { id: 'one', nameKey: 'sizeOne', widthMm: 25, heightMm: 35 },
  { id: 'smallone', nameKey: 'sizeSmallOne', widthMm: 22, heightMm: 32 },
  { id: 'two', nameKey: 'sizeTwo', widthMm: 35, heightMm: 49 },
  { id: 'bigone', nameKey: 'sizeBigOne', widthMm: 33, heightMm: 48 },
]

/** 换底目标色预设（RGB）。少一项浅蓝，避免按钮换行贴边导致选中环被父容器裁剪。
 *  nameKey 对应 i18n 词条。 */
export const BG_PRESETS: Array<{ id: string; nameKey: string; rgb: [number, number, number] }> = [
  { id: 'white', nameKey: 'bgWhite', rgb: [255, 255, 255] },
  { id: 'red', nameKey: 'bgRed', rgb: [213, 0, 0] },
  { id: 'blue', nameKey: 'bgBlue', rgb: [67, 142, 235] },
]

/**
 * 用 AI 人像分割得到的 alpha matte 与目标底色合成。
 * alpha 长度必须等于 width*height，坐标对齐源图原始像素。
 *
 * 步骤：先把人像（逐像素 alpha）画到画布（默认 source-over，初始透明），
 * 再用 destination-over 把底色垫到人像背后；透明区域透出底色，发丝软边自然。
 * 返回新 canvas。
 */
export function applyMatte(
  source: CanvasImageSource,
  width: number,
  height: number,
  alpha: Uint8Array,
  rgb: [number, number, number],
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const ctx = out.getContext('2d')!
  // 1) 先画源图
  ctx.drawImage(source, 0, 0, width, height)
  // 2) 写入逐像素 alpha
  const img = ctx.getImageData(0, 0, width, height)
  const d = img.data
  const n = width * height
  for (let i = 0; i < n; i++) {
    d[i * 4 + 3] = alpha[i >= alpha.length ? alpha.length - 1 : i]
  }
  ctx.putImageData(img, 0, 0)
  // 3) destination-over：把底色垫在人像背后
  ctx.globalCompositeOperation = 'destination-over'
  ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
  ctx.fillRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'source-over'
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

/**
 * 按图片自身宽高比补偿后，生成「像素宽高比 = aspect」的居中最大内接框。
 *
 * 与 centeredAspectBox 不同，后者在 1×1 正方形平面里按 aspect 取框，一旦源图
 * 非正方形，换算到真实像素后选区宽高比会偏离 aspect（≈ aspect × 图片宽高比），
 * 导致选区与 ReactCrop 的 aspect 锁定不一致。这里用归一化 w/h = aspect / naturalRatio
 * 补偿，保证换算成像素后选区宽高比严格等于目标 aspect。
 *
 * @param naturalRatio 源图宽高比（naturalWidth / naturalHeight）
 * @param aspect 目标宽高比（width / height），如证件照 25/35
 */
export function fitAspectBox(naturalRatio: number, aspect: number): NormRect {
  if (!isFinite(naturalRatio) || naturalRatio <= 0) {
    return centeredAspectBox(aspect)
  }
  // 归一化空间的 w/h 需满足：换算像素后 (w*naturalW)/(h*naturalH) = aspect
  const r = aspect / naturalRatio
  let w: number
  let h: number
  if (r <= 1) {
    h = 1
    w = r
  } else {
    w = 1
    h = 1 / r
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}