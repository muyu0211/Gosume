import { useEffect } from 'react'

type ShortcutHandler = () => void

interface Shortcut {
  key: string
  ctrl?: boolean
  shift?: boolean
  handler: ShortcutHandler
}

const shortcuts: Shortcut[] = []

export function useKeyboardShortcuts(
  onSave?: ShortcutHandler,
  onExport?: ShortcutHandler,
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey

      if (ctrl && e.key === 's' && !e.shiftKey) {
        e.preventDefault()
        onSave?.()
      }
      if (ctrl && e.key === 'e' && !e.shiftKey) {
        e.preventDefault()
        onExport?.()
      }
      if (ctrl && e.key === '0') {
        e.preventDefault()
        document.dispatchEvent(new CustomEvent('zoom:reset'))
      }
      if (ctrl && e.key === '=') {
        e.preventDefault()
        document.dispatchEvent(new CustomEvent('zoom:in'))
      }
      if (ctrl && e.key === '-') {
        e.preventDefault()
        document.dispatchEvent(new CustomEvent('zoom:out'))
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onSave, onExport])
}
