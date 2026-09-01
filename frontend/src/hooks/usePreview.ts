import { useCallback, useEffect, useRef } from 'react'
import { useResumeStore } from '../stores/resumeStore'
import { useTemplateStore } from '../stores/templateStore'
import { useLayoutStore } from '../stores/layoutStore'
import { renderTemplate, type TemplateSet } from '../lib/templateEngine'
import { loadTemplateContent } from '../services/templateService'
import { injectLayoutCss, injectAvatarSizeCss } from '../lib/layoutPresets'

export function usePreview() {
  const resume = useResumeStore((s) => s.resume)
  const setPreviewHtml = useResumeStore((s) => s.setPreviewHtml)
  const setPreviewLoading = useResumeStore((s) => s.setPreviewLoading)
  const activeTemplateId = useTemplateStore((s) => s.activeTemplateId)
  const layout = useLayoutStore((s) => s.layout)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 用于检测「全局布局变化」：布局拖动时即时刷新（不做 300ms 防抖）。
  const prevLayoutRef = useRef(layout)
  // 用于检测「头像尺寸变化」：头像拖动（width/height）时即时刷新，避免 300ms 防抖。
  const prevAvatarRef = useRef<{ w: number; h: number } | null>(null)
  // 模板内容缓存：编辑期间模板不变，避免每次编辑都走一次后端 GetTemplateContent。
  const templateCacheRef = useRef<{ id: string; tmpl: TemplateSet } | null>(null)

  const getTemplate = useCallback(async (): Promise<TemplateSet> => {
    const resume = useResumeStore.getState().resume
    const id = resume?.meta?.template_id || activeTemplateId || 'a406004d-d3b8-4900-969f-8094f8e85cf0'
    if (templateCacheRef.current?.id === id) return templateCacheRef.current.tmpl
    const tmpl = await loadTemplateContent(id)
    templateCacheRef.current = { id, tmpl }
    return tmpl
  }, [activeTemplateId])

  const refreshPreview = useCallback(async () => {
    const resume = useResumeStore.getState().resume
    if (!resume) return

    setPreviewLoading(true)
    try {
      // Always use client-side rendering for live preview so it reflects
      // the current Zustand state immediately (Go backend memory is only
      // synced on explicit save, not on every keystroke).
      const tmpl = await getTemplate()
      const rendered = renderTemplate(tmpl, resume)
      // 注入全局布局 CSS（页边距 + 内容间距，px→mm）；布局实时变化时读取最新值。
      const htmlWithLayout = injectLayoutCss(rendered, useLayoutStore.getState().layout)
      // Apply user-controlled avatar display size (overrides the template's
      // own .r-avatar img width/height via !important).
      const htmlWithAvatar = injectAvatarSizeCss(htmlWithLayout, resume.personal)
      setPreviewHtml(htmlWithAvatar)
    } catch (err) {
      console.error('Preview refresh failed:', err)
    } finally {
      setPreviewLoading(false)
    }
  }, [setPreviewHtml, setPreviewLoading, getTemplate])

  const debouncedRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(refreshPreview, 300)
  }, [refreshPreview])

  // Refresh when resume or template changes.
  // 头像拖动（width/height）走即时路径；其余内容编辑走 300ms 防抖合并。
  useEffect(() => {
    if (!resume) return
    const w = resume.personal?.avatar_width ?? 0
    const h = resume.personal?.avatar_height ?? 0
    const prev = prevAvatarRef.current
    prevAvatarRef.current = { w, h }
    const avatarChanged = !prev || prev.w !== w || prev.h !== h
    if (avatarChanged) {
      refreshPreview()
    } else {
      debouncedRefresh()
    }
  }, [resume, refreshPreview, debouncedRefresh])

  // 布局拖动：去除防抖，即时刷新（传入最新 getState().layout），实现实时渲染。
  useEffect(() => {
    if (prevLayoutRef.current === layout) return
    prevLayoutRef.current = layout
    if (useResumeStore.getState().resume) refreshPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { refreshPreview, debouncedRefresh }
}
