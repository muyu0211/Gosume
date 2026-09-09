/**
 * MODNet 抠图 Worker：在独立线程里跑 onnxruntime-web 推理，避免阻塞主线程。
 *
 * 主线程把缩放好的 RGBA（小图）经 postMessage 传来，worker 构建 CHW 张量、
 * 运行推理、做双线性放大，回传与源图同尺寸的 alpha matte。
 * 会话在 worker 内缓存，多次换底/多图复用。
 */
import * as ort from 'onnxruntime-web/wasm'
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import ortWasmMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url'

let sessionPromise: Promise<ort.InferenceSession> | null = null
let sessionModelUrl = ''

/** 获取（并缓存）ONNX 推理会话。 */
function getSession(modelUrl: string): Promise<ort.InferenceSession> {
  if (!sessionPromise || sessionModelUrl !== modelUrl) {
    ort.env.wasm.numThreads = 1
    // 本线程已是 worker，直接推理（不开 proxy）
    ort.env.wasm.wasmPaths = { wasm: ortWasmUrl, mjs: ortWasmMjsUrl }
    sessionModelUrl = modelUrl
    sessionPromise = ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
    })
  }
  return sessionPromise
}

/** 双线性放大 matte 矩阵（rw×rh → width×height）。 */
function upsample(matte: Float32Array, rw: number, rh: number, width: number, height: number): Uint8Array {
  const alpha = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const fy = ((y + 0.5) / height) * rh - 0.5
    const y0 = Math.max(0, Math.min(rh - 1, Math.floor(fy)))
    const y1 = Math.min(rh - 1, y0 + 1)
    const ty = Math.max(0, Math.min(1, fy - y0))
    for (let x = 0; x < width; x++) {
      const fx = ((x + 0.5) / width) * rw - 0.5
      const x0 = Math.max(0, Math.min(rw - 1, Math.floor(fx)))
      const x1 = Math.min(rw - 1, x0 + 1)
      const tx = Math.max(0, Math.min(1, fx - x0))
      const a00 = matte[y0 * rw + x0]
      const a10 = matte[y0 * rw + x1]
      const a01 = matte[y1 * rw + x0]
      const a11 = matte[y1 * rw + x1]
      const v = a00 * (1 - tx) * (1 - ty) + a10 * tx * (1 - ty) + a01 * (1 - tx) * ty + a11 * tx * ty
      alpha[y * width + x] = Math.round(Math.max(0, Math.min(1, v)) * 255)
    }
  }
  return alpha
}

interface Msg {
  id: number
  modelUrl: string
  rw: number
  rh: number
  width: number
  height: number
  data: Uint8Array
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const { id, modelUrl, rw, rh, width, height, data } = e.data
  try {
    const session = await getSession(modelUrl)
    const plane = rh * rw
    const input = new Float32Array(3 * plane)
    const rOff = 0
    const gOff = plane
    const bOff = plane * 2
    for (let i = 0; i < plane; i++) {
      const p = i * 4
      input[rOff + i] = data[p] / 127.5 - 1
      input[gOff + i] = data[p + 1] / 127.5 - 1
      input[bOff + i] = data[p + 2] / 127.5 - 1
    }
    const tensor = new ort.Tensor('float32', input, [1, 3, rh, rw])
    const feeds: Record<string, ort.Tensor> = {}
    feeds[session.inputNames[0]] = tensor
    const result = await session.run(feeds)
    const matte = result[session.outputNames[0]].data as Float32Array
    const alpha = upsample(matte, rw, rh, width, height)
    const res = { id, ok: true as const, width, height, alpha }
    self.postMessage(res, { transfer: [alpha.buffer] })
  } catch (err) {
    const res = { id, ok: false as const, error: err instanceof Error ? err.message : String(err) }
    self.postMessage(res)
  }
}