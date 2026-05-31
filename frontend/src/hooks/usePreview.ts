import { useCallback, useEffect, useRef } from 'react'
import { useResumeStore } from '../stores/resumeStore'
import { useTemplateStore } from '../stores/templateStore'
import { renderTemplate } from '../lib/template-engine'
import { loadTemplateContent } from '../services/templateService'

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
      const tmpl = await loadTemplateContent(activeTemplateId || 'modern')
      const rendered = renderTemplate(tmpl, resume)
      setPreviewHtml(rendered)
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
