import { useCallback, useEffect, useRef } from 'react'
import { useResumeStore } from '../stores/resumeStore'
import { callService } from '../services/backend'

const AUTOSAVE_KEY = 'resume-craft-autosave'

export function useAutoSave(intervalMs: number = 30000) {
  const isDirty = useResumeStore((s) => s.isDirty)
  const resume = useResumeStore((s) => s.resume)
  const currentId = useResumeStore((s) => s.currentId)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const doAutoSave = useCallback(async () => {
    // Only auto-save persisted resumes (explicitly saved at least once).
    // currentId is null for new resumes that haven't been saved yet.
    if (!isDirty || !resume || !currentId) return
    try {
      // Try Go backend
      await callService('ResumeService', 'AutoSave')
      // Also save to localStorage as fallback (strip avatar to avoid QuotaExceededError)
      const slimResume = { ...resume, personal: { ...resume.personal, avatar: undefined } }
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
        resume: slimResume,
        timestamp: new Date().toISOString(),
      }))
      console.debug('[AutoSave] saved at', new Date().toLocaleTimeString())
    } catch (err) {
      // Non-critical — backend is the source of truth
      console.warn('[AutoSave] failed:', err)
    }
  }, [isDirty, resume, currentId])

  useEffect(() => {
    const enabled = localStorage.getItem('resume-craft-autosave-enabled')
    if (enabled === 'false') return
    timerRef.current = setInterval(doAutoSave, intervalMs)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [doAutoSave, intervalMs])
}
