import { create } from 'zustand'

/**
 * 应用 UI 语言（Gosume 界面语言），与「简历语言」（resume.meta.language）解耦：
 * - 设置页「语言」控制这里 → 只切换应用界面（编辑区板块标题等），不改简历；
 * - 编辑页工具栏的「中英切换」控制 resume.meta.language → 只切换简历渲染语言。
 * 持久化到 localStorage。
 */

const APP_LANG_KEY = 'gosume-app-language'

export type AppLanguage = 'zh-CN' | 'en-US'

function readInit(): AppLanguage {
  return localStorage.getItem(APP_LANG_KEY) === 'en-US' ? 'en-US' : 'zh-CN'
}

interface AppState {
  language: AppLanguage
  setLanguage: (lang: AppLanguage) => void
}

export const useAppStore = create<AppState>((set) => ({
  language: readInit(),
  setLanguage: (lang) => {
    localStorage.setItem(APP_LANG_KEY, lang)
    set({ language: lang })
  },
}))