// 应用背景壁纸（渐变）的标识、清单与生效入口。
//
// 设计要点：
// 1. 壁纸**不是图片文件**，而是纯 CSS 渐变（--bg-image），由 globals.css 按
//    `[data-app-bg='<id>']` 给出。零字节、随窗口无损缩放、且能跟着主题装饰色
//    自动换色（深浅主题各有一套浓度 --bg-glow）。
// 2. 本文件只维护「有哪些壁纸 + 怎么写入文档」，不存任何颜色 —— 配色单一来源
//    始终是 globals.css。设置页的色板小图与实际壁纸消费同一个 --bg-image，
//    因此「预览」与「实际效果」必然一致，不存在两份配色漂移。
// 3. 持久化在本地（localStorage）：壁纸是 UI 装饰，不随数据目录迁移。

/** 壁纸标识；'none' 表示不使用壁纸（纯主题底色）。 */
export type BackgroundId =
  | 'none'
  | 'aurora'
  | 'dawn'
  | 'mint'
  | 'dusk'
  | 'dune'
  | 'graphite'

export interface BackgroundPreset {
  id: BackgroundId
  /** i18n 词条 key（zh/en 在 lib/i18n.ts）。 */
  labelKey: string
}

/** 壁纸清单（设置页展示顺序）。'none' 始终在首位。 */
export const BACKGROUND_PRESETS: readonly BackgroundPreset[] = [
  { id: 'none', labelKey: 'bgNone' },
  { id: 'aurora', labelKey: 'bgAurora' },
  { id: 'dawn', labelKey: 'bgDawn' },
  { id: 'mint', labelKey: 'bgMint' },
  { id: 'dusk', labelKey: 'bgDusk' },
  { id: 'dune', labelKey: 'bgDune' },
  { id: 'graphite', labelKey: 'bgGraphite' },
]

export const DEFAULT_BACKGROUND: BackgroundId = 'none'

const STORAGE_KEY = 'gosume-app-background'

/** 校验字符串是否为合法的壁纸标识（读取本地存储时防脏数据）。 */
export function isBackgroundId(value: string): value is BackgroundId {
  return BACKGROUND_PRESETS.some((p) => p.id === value)
}

/** 读取本地持久化的壁纸选项；无记录或值非法时回落到 DEFAULT_BACKGROUND。 */
export function readBackground(): BackgroundId {
  const v = localStorage.getItem(STORAGE_KEY)
  return v && isBackgroundId(v) ? v : DEFAULT_BACKGROUND
}

/** 持久化壁纸选项。 */
export function persistBackground(id: BackgroundId): void {
  localStorage.setItem(STORAGE_KEY, id)
}

/**
 * 把壁纸写入 <html data-app-bg>，触发 globals.css 的 --bg-image 取值。
 * 只做属性写入，不负责渐变内容本身。
 */
export function applyBackgroundToDocument(id: BackgroundId): void {
  persistBackground(id)
  document.documentElement.dataset.appBg = id
}
