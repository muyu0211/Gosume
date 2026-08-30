import { useCallback, useEffect, useRef } from 'react'
import { useResumeStore } from '../stores/resumeStore'
import { useTemplateStore } from '../stores/templateStore'
import { useLayoutSettingsStore } from '../stores/layoutSettingsStore'
import { renderTemplate, type TemplateSet } from '../lib/templateEngine'
import { loadTemplateContent } from '../services/templateService'
import { injectLayoutCss, injectAvatarSizeCss } from '../lib/layoutPresets'

export function usePreview() {
  const resume = useResumeStore((s) => s.resume)
  const setPreviewHtml = useResumeStore((s) => s.setPreviewHtml)
  const setPreviewLoading = useResumeStore((s) => s.setPreviewLoading)
  const activeTemplateId = useTemplateStore((s) => s.activeTemplateId)
  const layoutSettings = useLayoutSettingsStore()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
    if (!resume) return

    setPreviewLoading(true)
    try {
      // Always use client-side rendering for live preview so it reflects
      // the current Zustand state immediately (Go backend memory is only
      // synced on explicit save, not on every keystroke).
      const tmpl = await getTemplate()
      const rendered = renderTemplate(tmpl, resume)
      // Inject layout CSS (page margin + section spacing) from the meta
      // tier keys, resolved against the user-customized tier lists.
      // lib/layoutPresets maps each tier to concrete CSS values; the
      // 'normal' spacing tier injects nothing so each template keeps its
      // own block rhythm.
      const htmlWithLayout = injectLayoutCss(
        rendered,
        resume.meta?.page_margin,
        resume.meta?.section_spacing,
        layoutSettings,
      )
      // Apply user-controlled avatar display size (overrides the template's
      // own .r-avatar img width/height via !important).
      const htmlWithAvatar = injectAvatarSizeCss(htmlWithLayout, resume.personal)
      setPreviewHtml(htmlWithAvatar)
    } catch (err) {
      console.error('Preview refresh failed:', err)
    } finally {
      setPreviewLoading(false)
    }
  }, [resume, layoutSettings, setPreviewHtml, setPreviewLoading, getTemplate])

  const debouncedRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(refreshPreview, 300)
  }, [refreshPreview])

  // Refresh when resume or template changes
  useEffect(() => {
    if (resume) debouncedRefresh()
  }, [resume, debouncedRefresh])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { refreshPreview, debouncedRefresh }
}
