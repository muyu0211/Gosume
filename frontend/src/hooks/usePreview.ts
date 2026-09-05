import { useCallback, useEffect, useRef } from 'react'
import { useResumeStore } from '../stores/resumeStore'
import { useTemplateStore } from '../stores/templateStore'
import { renderTemplate, type TemplateSet } from '../lib/templateEngine'
import { loadTemplateContent } from '../services/templateService'
import { injectGlobalVarsCss } from '../lib/layoutPresets'

export function usePreview() {
  const resume = useResumeStore((s) => s.resume)
  const setPreviewHtml = useResumeStore((s) => s.setPreviewHtml)
  const setPreviewLoading = useResumeStore((s) => s.setPreviewLoading)
  const activeTemplateId = useTemplateStore((s) => s.activeTemplateId)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevCustomCssRef = useRef<string | null>(null)
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
      const tmpl = await getTemplate()
      const rendered = renderTemplate(tmpl, resume)
      // 注入 per-resume custom_css（空则不注入 → 模板原生外观）。
      const htmlWithVars = injectGlobalVarsCss(rendered, resume)
      setPreviewHtml(htmlWithVars)
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

  // 样式拖动（custom_css 变化）路径走「节流」：拖动期间最多每 THROTTLE 毫秒渲染一次，
  const STYLE_THROTTLE_MS = 20
  const styleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastStyleRunRef = useRef(0)

  useEffect(() => {
    if (!resume) return
    const css = resume.custom_css ?? ''
    const prev = prevCustomCssRef.current
    prevCustomCssRef.current = css
    if (prev === css) {
      debouncedRefresh()
      return
    }
    const run = () => {
      styleTimerRef.current = null
      lastStyleRunRef.current = performance.now()
      refreshPreview()
    }
    if (performance.now() - lastStyleRunRef.current >= STYLE_THROTTLE_MS) {
      run()
    } else if (styleTimerRef.current == null) {
      styleTimerRef.current = setTimeout(run, STYLE_THROTTLE_MS)
    }
  }, [resume, refreshPreview, debouncedRefresh])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (styleTimerRef.current) clearTimeout(styleTimerRef.current)
    }
  }, [])

  return { refreshPreview, debouncedRefresh }
}
