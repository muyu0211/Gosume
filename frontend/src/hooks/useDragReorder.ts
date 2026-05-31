import { useState, useCallback, useRef } from 'react'

export function useDragReorder(onReorder: (from: number, to: number) => void) {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const dragRef = useRef<number | null>(null)

  const onDragStart = useCallback((idx: number) => {
    dragRef.current = idx
    setDraggedIdx(idx)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOverIdx(idx)
  }, [])

  const onDrop = useCallback((idx: number) => {
    const from = dragRef.current
    setDraggedIdx(null)
    setOverIdx(null)
    if (from != null && from !== idx) {
      onReorder(from, idx)
    }
  }, [onReorder])

  const onDragEnd = useCallback(() => {
    dragRef.current = null
    setDraggedIdx(null)
    setOverIdx(null)
  }, [])

  return { draggedIdx, overIdx, onDragStart, onDragOver, onDrop, onDragEnd }
}
