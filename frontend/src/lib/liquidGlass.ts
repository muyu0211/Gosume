/**
 * 液态玻璃引擎 —— Tier 1 边缘折射。
 *
 * 规范：docs/Gosume液态玻璃/液态玻璃落地规范.md 第 5–6 节
 * 预览：docs/liquid-glass-preview/index.html
 *
 * ## 为什么需要运行时而不是纯 CSS
 *
 * `backdrop-filter: url(#svgFilter)`（feImage + feDisplacementMap 折射）
 * **只有 Chromium 支持**：Safari / Firefox 会解析通过但把元素渲染成透明块，
 * 而且 `@supports` 会误报 true。所以必须做内核探测，并由运行时在确认 SVG
 * 已挂载后再注入 `--lg-backdrop`，绝不能在样式表里静态写 `url(#...)`。
 *
 * 本项目跑在 Wails v3 + WebView2（Chromium），因此正式包内 Tier 1 可用；
 * 非 Chromium 环境下什么都不做，元素停在 Tier 0（纯模糊，由 CSS 的 var() 回退提供）。
 *
 * ## 原型踩过的四个坑（移植时必须保持已修好的状态）
 *
 * 1. 单实例 + fixed 居中 + 圆角写死 → 改为多实例，圆角读 computed 值并夹到 min(w,h)/2。
 * 2. 每实例全量逐像素 → 位移贴图按「几何签名」缓存并设上限。
 * 3. `maxScale` 编码溢出被 Uint8ClampedArray 夹断，实际位移只有理论值 1/4
 *    → 改为 `scale = 2 * Dmax`、`c = d / (2 * Dmax) + 0.5` 满量程编码。
 * 4. 按几何签名缓存 `<filter>` 节点本身 → 改参数会残留上百个节点。
 *    **每个元素固定持有 1 个节点，刷新时原地更新 href / scale。**
 */

const NS = 'http://www.w3.org/2000/svg'
const XLINK = 'http://www.w3.org/1999/xlink'

/** 位移贴图缓存上限；超出后淘汰最早的一半（防止拖动参数时无限增长）。 */
const MAX_MAPS = 240

interface DisplacementMap {
  url: string
  scale: number
  w: number
  h: number
}

interface GlassState {
  id: string
  filter: SVGFilterElement
  img: SVGFEImageElement
  disp: SVGFEDisplacementMapElement
}

/* ---------------- 内核 / 特性探测 ---------------- */

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
const isChromium =
  /Chrome|Chromium|CriOS|Edg\//.test(ua) && !/Firefox|Gecko\/|OPR\//.test(ua)

const supportsBackdrop =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  (CSS.supports('backdrop-filter', 'blur(1px)') ||
    CSS.supports('-webkit-backdrop-filter', 'blur(1px)'))

const prefersReducedMotion =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** 当前环境能否渲染 Tier 1 折射。false 时元素自动停在 Tier 0。 */
export const canRefract: boolean = supportsBackdrop && isChromium && !prefersReducedMotion

/* ---------------- 全局宿主与缓存 ---------------- */

const mapCache = new Map<string, DisplacementMap | null>()
const states = new WeakMap<HTMLElement, GlassState>()
const attached = new Set<HTMLElement>()

let svgHost: SVGSVGElement | null = null
let defsHost: SVGDefsElement | null = null
let uid = 0
let sharedRO: ResizeObserver | null = null

function ensureHost(): SVGDefsElement {
  if (svgHost && defsHost) return defsHost
  svgHost = document.createElementNS(NS, 'svg')
  svgHost.setAttribute('width', '0')
  svgHost.setAttribute('height', '0')
  svgHost.setAttribute('aria-hidden', 'true')
  svgHost.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;'
  defsHost = document.createElementNS(NS, 'defs')
  svgHost.appendChild(defsHost)
  document.body.appendChild(svgHost)
  return defsHost
}

/* ---------------- SDF 与缓动 ---------------- */

function smoothStep(a: number, b: number, t: number): number {
  const v = Math.max(0, Math.min(1, (t - a) / (b - a)))
  return v * v * (3 - 2 * v)
}

function lengthOf(x: number, y: number): number {
  return Math.sqrt(x * x + y * y)
}

/** 圆角矩形有向距离场：< 0 内部，0 边界，> 0 外部。hw/hh 为半宽半高。 */
function roundedRectSDF(x: number, y: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(x) - hw + r
  const qy = Math.abs(y) - hh + r
  return Math.min(Math.max(qx, qy), 0) + lengthOf(Math.max(qx, 0), Math.max(qy, 0)) - r
}

/* ---------------- 位移贴图 ---------------- */

/**
 * 生成折射位移贴图。
 * 原理：以矩形中心为原点，越靠近边缘、采样点越向中心收缩 → 边缘内容被放大拉伸，
 * 形成透镜般的边缘折射（液态玻璃辨识度的来源）。
 *
 * x / y 按轴独立标定，使两个方向的最大位移都恰好等于 refractPx，
 * 因此同一参数在宽按钮和高按钮上的观感一致。
 */
function buildMap(w: number, h: number, r: number, refract: number, edge: number): DisplacementMap | null {
  const ww = Math.max(1, Math.round(w))
  const hh = Math.max(1, Math.round(h))
  // 小控件上折射带宽不能超过短边 35%，否则整块被扭曲
  const effEdge = Math.max(1, Math.min(edge, Math.min(ww, hh) * 0.35))
  const effR = Math.max(0, Math.min(r, Math.min(ww, hh) / 2))

  const data = new Uint8ClampedArray(ww * hh * 4)
  const rawX = new Float32Array(ww * hh)
  const rawY = new Float32Array(ww * hh)
  let dmax = 0

  for (let py = 0; py < hh; py++) {
    for (let px = 0; px < ww; px++) {
      const i = py * ww + px
      const x = px + 0.5 - ww / 2
      const y = py + 0.5 - hh / 2
      const d = roundedRectSDF(x, y, ww / 2, hh / 2, effR)
      // f: 0 = 深处（不折射），1 = 贴边（折射最强）
      const f = smoothStep(-effEdge, 0, d)
      const dx = -x * ((2 * refract) / ww) * f
      const dy = -y * ((2 * refract) / hh) * f
      rawX[i] = dx
      rawY[i] = dy
      const m = Math.max(Math.abs(dx), Math.abs(dy))
      if (m > dmax) dmax = m
    }
  }

  if (dmax < 0.0001) return null // refract = 0

  // 满量程编码：位移 = scale * (channel - 0.5)，故 scale = 2 * Dmax
  const scale = 2 * dmax
  for (let i = 0; i < rawX.length; i++) {
    data[i * 4] = (rawX[i] / scale + 0.5) * 255 // R → X 位移
    data[i * 4 + 1] = (rawY[i] / scale + 0.5) * 255 // G → Y 位移
    data[i * 4 + 2] = 0
    data[i * 4 + 3] = 255
  }

  const canvas = document.createElement('canvas')
  canvas.width = ww
  canvas.height = hh
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.putImageData(new ImageData(data, ww, hh), 0, 0)
  return { url: canvas.toDataURL(), scale, w: ww, h: hh }
}

/** 按「几何签名」取贴图（唯一昂贵的部分）。 */
function getMap(w: number, h: number, r: number, refract: number, edge: number): DisplacementMap | null {
  const key = `${w}|${h}|${r}|${refract}|${edge}`
  let map = mapCache.get(key)
  if (map === undefined) {
    map = buildMap(w, h, r, refract, edge)
    if (mapCache.size >= MAX_MAPS) {
      const it = mapCache.keys()
      for (let k = 0, n = MAX_MAPS >> 1; k < n; k++) {
        const old = it.next().value
        if (old !== undefined) mapCache.delete(old)
      }
    }
    mapCache.set(key, map)
  }
  return map
}

/* ---------------- filter 节点 ---------------- */

function ensureFilter(el: HTMLElement): GlassState {
  const existing = states.get(el)
  if (existing) return existing

  const defs = ensureHost()
  const id = `lg-filter-${++uid}`
  const mapId = `${id}-map`

  const filter = document.createElementNS(NS, 'filter')
  filter.setAttribute('id', id)
  filter.setAttribute('filterUnits', 'userSpaceOnUse')
  filter.setAttribute('color-interpolation-filters', 'sRGB')
  // 位移只向内收缩，采样点始终落在元素盒内，无需外扩滤镜区域（外扩反而引入透明边）
  filter.setAttribute('x', '0')
  filter.setAttribute('y', '0')

  const img = document.createElementNS(NS, 'feImage')
  img.setAttribute('id', mapId)

  const disp = document.createElementNS(NS, 'feDisplacementMap')
  disp.setAttribute('in', 'SourceGraphic')
  disp.setAttribute('in2', mapId)
  disp.setAttribute('xChannelSelector', 'R')
  disp.setAttribute('yChannelSelector', 'G')

  filter.appendChild(img)
  filter.appendChild(disp)
  defs.appendChild(filter)

  const state: GlassState = { id, filter, img, disp }
  states.set(el, state)
  return state
}

/* ---------------- 参数与应用 ---------------- */

function num(v: string | undefined, fallback: number): number {
  const n = parseFloat(v ?? '')
  return Number.isFinite(n) ? n : fallback
}

interface Params {
  w: number
  h: number
  r: number
  refract: number
  edge: number
  blur: number
  sat: string
}

function readParams(el: HTMLElement): Params | null {
  const rect = el.getBoundingClientRect()
  const w = Math.round(rect.width)
  const h = Math.round(rect.height)
  if (!w || !h) return null // 尚未布局
  const cs = getComputedStyle(el)
  const root = getComputedStyle(document.documentElement)
  return {
    w,
    h,
    // ⚠ computed 值不会自动夹到 h/2：border-radius:9999px 仍返回 9999px，
    // 不夹的话 SDF 圆角远大于短边，折射形变会彻底错乱。
    r: num(cs.borderTopLeftRadius, 12),
    refract: num(root.getPropertyValue('--lg-refract'), 6),
    edge: num(root.getPropertyValue('--lg-edge'), 12),
    blur: num(root.getPropertyValue('--lg-blur'), 12),
    sat: root.getPropertyValue('--lg-sat').trim() || '180%',
  }
}

/** 把玻璃材质写到单个元素上。 */
export function applyGlass(el: HTMLElement): void {
  const p = readParams(el)
  if (!p) return

  const plain = `blur(${p.blur}px) saturate(${p.sat})`

  // refract 为 0（含无障碍回退）或环境不支持 → Tier 0
  if (!canRefract || p.refract <= 0) {
    // 只写自定义属性即可：样式表里 -webkit-backdrop-filter 与 backdrop-filter
    // 都指向 var(--lg-backdrop)，无需再单独赋值（TS 的 CSSStyleDeclaration
    // 也没有 webkitBackdropFilter 这个键）。
    el.style.setProperty('--lg-backdrop', plain)
    el.dataset.lgTier = '0'
    return
  }

  const map = getMap(p.w, p.h, p.r, p.refract, p.edge)
  if (!map) {
    // 只写自定义属性即可：样式表里 -webkit-backdrop-filter 与 backdrop-filter
    // 都指向 var(--lg-backdrop)，无需再单独赋值（TS 的 CSSStyleDeclaration
    // 也没有 webkitBackdropFilter 这个键）。
    el.style.setProperty('--lg-backdrop', plain)
    el.dataset.lgTier = '0'
    return
  }

  const st = ensureFilter(el)
  st.filter.setAttribute('width', String(map.w))
  st.filter.setAttribute('height', String(map.h))
  st.img.setAttribute('width', String(map.w))
  st.img.setAttribute('height', String(map.h))
  st.img.setAttributeNS(XLINK, 'href', map.url)
  st.img.setAttribute('href', map.url)
  st.disp.setAttribute('scale', String(map.scale))

  const value = `url(#${st.id}) ${plain}`
  el.style.setProperty('--lg-backdrop', value)
  el.dataset.lgTier = '1'
}

/* ---------------- 生命周期 ---------------- */

function getSharedRO(): ResizeObserver | null {
  if (typeof ResizeObserver === 'undefined') return null
  if (!sharedRO) {
    // 同步重算，不用 requestAnimationFrame —— rAF 依赖合成器驱动，
    // 在页面不可见 / 无头等场景会整个不触发（表现为参数改了却不生效）。
    sharedRO = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement
        if (attached.has(el)) applyGlass(el)
      }
    })
  }
  return sharedRO
}

export function attachGlass(el: HTMLElement): void {
  if (attached.has(el)) return
  attached.add(el)
  applyGlass(el)
  getSharedRO()?.observe(el)
}

export function detachGlass(el: HTMLElement): void {
  if (!attached.delete(el)) return
  getSharedRO()?.unobserve(el)
  el.style.removeProperty('--lg-backdrop')
  el.style.removeProperty('-webkit-backdrop-filter')
  delete el.dataset.lgTier
  const st = states.get(el)
  if (st) {
    st.filter.remove()
    states.delete(el)
  }
}

/** 重新计算全部已挂载元素（主题/语言切换导致尺寸变化后调用）。 */
export function refreshGlass(): void {
  attached.forEach(applyGlass)
}

/** 扫描 root 下所有 [data-lg] 并挂载。 */
function scan(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-lg]').forEach(attachGlass)
}

/**
 * 启动全局托管：自动挂载/卸载 [data-lg] 元素（用 MutationObserver 跟踪动态节点）。
 * @returns 停止函数
 */
export function startLiquidGlass(): () => void {
  if (!canRefract) return () => {}
  scan(document)

  const mo = new MutationObserver(() => {
    // 新增的 [data-lg] 挂载；已不在文档里的卸载
    attached.forEach((el) => {
      if (!document.contains(el)) detachGlass(el)
    })
    scan(document)
  })
  mo.observe(document.body, { childList: true, subtree: true })

  return () => {
    mo.disconnect()
    Array.from(attached).forEach(detachGlass)
  }
}

/** 调试用：当前挂载元素数与缓存贴图数。 */
export function glassStats(): { elements: number; maps: number } {
  return { elements: attached.size, maps: mapCache.size }
}
