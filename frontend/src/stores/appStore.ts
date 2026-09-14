import { create } from 'zustand'
import {
  applyBackgroundToDocument,
  readBackground,
  type BackgroundId,
} from '../lib/background'

/**
 * 应用 UI 语言（Gosume 界面语言），与「简历语言」（resume.meta.language）解耦：
 * - 设置页「语言」控制这里 → 只切换应用界面（编辑区板块标题等），不改简历；
 * - 编辑页工具栏的「中英切换」控制 resume.meta.language → 只切换简历渲染语言。
 * 持久化到 localStorage。
 *
 * 同时持有「应用背景壁纸」偏好（同样持久化到 localStorage）：
 * 壁纸是纯 UI 装饰，不随数据目录迁移，因此与语言一样留在本地。
 */

const APP_LANG_KEY = 'gosume-app-language'

export type AppLanguage = 'zh-CN' | 'en-US'

function readInit(): AppLanguage {
  return localStorage.getItem(APP_LANG_KEY) === 'en-US' ? 'en-US' : 'zh-CN'
}

interface AppState {
  language: AppLanguage
  setLanguage: (lang: AppLanguage) => void
  /** 当前壁纸（'none' = 纯主题底色）。 */
  background: BackgroundId
  /** 持久化并立即生效（写入 <html data-app-bg>，由 CSS 提供渐变）。 */
  setBackground: (id: BackgroundId) => void
}

export const useAppStore = create<AppState>((set) => ({
  language: readInit(),
  setLanguage: (lang) => {
    localStorage.setItem(APP_LANG_KEY, lang)
    set({ language: lang })
  },

  background: readBackground(),
  setBackground: (id) => {
    applyBackgroundToDocument(id)
    set({ background: id })
  },
}))