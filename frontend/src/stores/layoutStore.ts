import { create } from 'zustand'
import { callService } from '../services/backend'
import {
  DEFAULT_GLOBAL_LAYOUT,
  type GlobalLayout,
} from '../lib/layoutPresets'

/**
 * 全局布局（页边距 + 内容间距，px 数值），经 SystemService.GetLayout / SaveLayout
 * 持久化到 config.json，所有简历共享。
 * 启动时 ensureLoaded 拉取一次；拖动条拖拽通过 setLayout 即时生效并落盘。
 */
interface LayoutState {
  layout: GlobalLayout
  loaded: boolean
  /** 启动加载一次全局布局。 */
  ensureLoaded: () => Promise<void>
  /** 覆盖部分字段并持久化：状态先即时提交（预览实时刷新），落盘尾随节流。 */
  setLayout: (patch: Partial<GlobalLayout>) => void
}

// 落盘尾随节流：拖动条连续变化时避免每次写 config.json，只在停止 250ms 后写一次最新值。
let pendingSave: ReturnType<typeof setTimeout> | null = null

export const useLayoutStore = create<LayoutState>((set, get) => ({
  layout: DEFAULT_GLOBAL_LAYOUT,
  loaded: false,

  ensureLoaded: async () => {
    if (get().loaded) return
    try {
      const stored = await callService<GlobalLayout>('SystemService', 'GetLayout')
      if (stored) {
        set({ layout: { ...DEFAULT_GLOBAL_LAYOUT, ...stored }, loaded: true })
      } else {
        set({ loaded: true })
      }
    } catch (err) {
      console.error('[layoutStore] ensureLoaded failed, using defaults:', err)
      set({ loaded: true })
    }
  },

  setLayout: (patch) => {
    const next = {
      ...get().layout,
      ...patch,
    }
    // 乐观提交：先让状态与预览即时更新，不等待后端往返。
    set({ layout: next, loaded: true })

    // 落盘节流：连续拖动只写一次最新值。
    if (pendingSave) clearTimeout(pendingSave)
    pendingSave = setTimeout(() => {
      pendingSave = null
      callService('SystemService', 'SaveLayout', get().layout).catch((err) =>
        console.error('[layoutStore] setLayout persist failed:', err),
      )
    }, 250)
  },
}))