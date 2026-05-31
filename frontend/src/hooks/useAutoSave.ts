import { useCallback, useEffect, useRef } from 'react'
import { useResumeStore } from '../stores/resumeStore'
import { callService } from '../services/backend'

const AUTOSAVE_KEY = 'resume-craft-autosave'

export function useAutoSave(intervalMs: number = 30000) {
  const isDirty = useResumeStore((s) => s.isDirty)
  const resume = useResumeStore((s) => s.resume)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const doAutoSave = useCallback(async () => {
    if (!isDirty || !resume) return
    try {
      // Try Go backend
      await callService('ResumeService', 'AutoSave')
      // Also save to localStorage as fallback
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
        resume,
        timestamp: new Date().toISOString(),
      }))
      console.debug('[AutoSave] saved at', new Date().toLocaleTimeString())
    } catch (err) {
      console.error('[AutoSave] failed:', err)
    }
  }, [isDirty, resume])

  useEffect(() => {
    const enabled = localStorage.getItem('resume-craft-autosave-enabled')
    if (enabled === 'false') return
    timerRef.current = setInterval(doAutoSave, intervalMs)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [doAutoSave, intervalMs])
}
