import { useCallback, useEffect, useRef } from 'react'
import { useResumeStore } from '../stores/resumeStore'
import { useTemplateStore } from '../stores/templateStore'
import { renderTemplate } from '../lib/template-engine'
import { loadTemplateContent } from '../services/templateService'
import { getMarginPreset, injectMarginCss } from '../lib/marginPresets'

export function usePreview() {
  const resume = useResumeStore((s) => s.resume)
  const setPreviewHtml = useResumeStore((s) => s.setPreviewHtml)
  const setPreviewLoading = useResumeStore((s) => s.setPreviewLoading)
  const activeTemplateId = useTemplateStore((s) => s.activeTemplateId)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshPreview = useCallback(async () => {
    if (!resume) return

    setPreviewLoading(true)
    try {
      // Always use client-side rendering for live preview so it reflects
      // the current Zustand state immediately (Go backend memory is only
      // synced on explicit save, not on every keystroke).
      const tmpl = await loadTemplateContent(activeTemplateId || 'a406004d-d3b8-4900-969f-8094f8e85cf0')
      const rendered = renderTemplate(tmpl, resume)
      // Inject page margin CSS variables so templates can consume them
      // via `padding: var(--resume-padding[-y/-x], <fallback>)`. This way
      // the template itself owns the padding change (no white-margin
      // artifacts from stacked rules) and internal elements like
      // .summary / .section-title keep their design-intended padding.
      // Split-column templates (gradient/creative) consume -y/-x on
      // their inner containers since .resume-page has no padding there.
      const marginPreset = getMarginPreset(resume.meta?.page_margin)
      const htmlWithMargin = injectMarginCss(rendered, marginPreset)
      setPreviewHtml(htmlWithMargin)
    } catch (err) {
      console.error('Preview refresh failed:', err)
    } finally {
      setPreviewLoading(false)
    }
  }, [resume, activeTemplateId, setPreviewHtml, setPreviewLoading])

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
