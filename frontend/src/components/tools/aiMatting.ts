/**
 * MODNet 人像抠图主线程入口。
 *
 * 推理在独立 Web Worker（./mattingWorker.ts）中执行，避免阻塞主线程——
 * 勾选换底 / 换图时 UI 立即渲染并可显示 loading，不等待计算完成。
 *
 * 模型：yakhyo/modnet 的 modnet_photographic.onnx（Apache-2.0），内嵌于
 * frontend/public/models/modnet.onnx。WASM 运行时在 worker 内用 Vite `?url`
 * 导入并精确指定资产 URL，保证离线、无误取。
 */

const REF_SIZE = 512

export interface Matte {
  width: number
  height: number
  /** 长度 = width*height，取值 0..255，作为图像 alpha 通道。 */
  alpha: Uint8Array
}

interface Pending {
  resolve: (m: Matte) => void
  reject: (err: Error) => void
}

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, Pending>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./mattingWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent) => {
      const { id, ok, error, width, height, alpha } = e.data
      const p = pending.get(id)
      if (!p) return
      pending.delete(id)
      if (ok) p.resolve({ width, height, alpha })
      else p.reject(new Error(error || '智能抠图失败'))
    }
    worker.onerror = (e) => {
      const err = new Error(e.message || '智能抠图失败')
      pending.forEach((p) => p.reject(err))
      pending.clear()
    }
  }
  return worker
}

/**
 * 对源图像进行 MODNet 人像分割，返回与原图同尺寸的 alpha matte。
 * 主线程只做缩放与转发；推理在 worker 中，不会阻塞 UI。
 */
export async function computeMatte(source: HTMLImageElement): Promise<Matte> {
  const W = source.naturalWidth
  const H = source.naturalHeight
  if (W === 0 || H === 0) throw new Error('图片尺寸无效')

  const full = document.createElement('canvas')
  full.width = W
  full.height = H
  full.getContext('2d')!.drawImage(source, 0, 0)

  // 计算推理参考尺寸（等比，对齐 32）
  let rw = W
  let rh = H
  if (Math.max(W, H) < REF_SIZE || Math.min(W, H) > REF_SIZE) {
    if (W >= H) {
      rh = REF_SIZE
      rw = Math.round((W / H) * REF_SIZE)
    } else {
      rw = REF_SIZE
      rh = Math.round((H / W) * REF_SIZE)
    }
  }
  rw = Math.max(1, rw - (rw % 32))
  rh = Math.max(1, rh - (rh % 32))

  // 缩放并读取 RGBA 小图，交给 worker
  const small = document.createElement('canvas')
  small.width = rw
  small.height = rh
  const sctx = small.getContext('2d')!
  sctx.imageSmoothingEnabled = true
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(full, 0, 0, rw, rh)
  const imageData = sctx.getImageData(0, 0, rw, rh)
  // 以对象 URL 形式把模型地址传给 worker（worker 内相对路径基准不同，避免 404）
  const modelUrl = new URL('models/modnet.onnx', document.baseURI).href

  const w = getWorker()
  const id = ++seq
  return new Promise<Matte>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage(
      { id, modelUrl, rw, rh, width: W, height: H, data: imageData.data },
      { transfer: [imageData.data.buffer] },
    )
  })
}