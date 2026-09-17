import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { callService } from '../services/backend'
import { renderResumeForCard } from '../lib/resumePreview'
import type { Resume, ResumeListItem } from '../types/resume'

/** 预览 HTML 缓存上限（超出按插入顺序淘汰）。 */
const CACHE_MAX = 200
/** 同时进行的渲染任务数（每个任务 = 一次后端读取 + 一次模板渲染）。 */
const MAX_CONCURRENT = 2

/** 模块级缓存：跨挂载保留，切 Tab / 翻页回来不必重渲染。key = `${id}:${updated_at}`。 */
const previewCache = new Map<string, string>()

function cacheKey(item: ResumeListItem): string {
  return `${item.id}:${item.updated_at}`
}

function cacheGet(key: string): string | undefined {
  const hit = previewCache.get(key)
  if (hit === undefined) return undefined
  // 命中即刷新 LRU 顺序（先删再插）
  previewCache.delete(key)
  previewCache.set(key, hit)
  return hit
}

function cacheSet(key: string, html: string): void {
  previewCache.set(key, html)
  while (previewCache.size > CACHE_MAX) {
    const oldest = previewCache.keys().next()
    if (oldest.done) break
    previewCache.delete(oldest.value)
  }
}

/**
 * 简历卡片预览的按需渲染：视口懒加载 + 并发上限 + LRU 缓存。
 *
 * - 卡片进入视口（含 200px 预取边距）才渲染，避免一屏 N 个 iframe 同时布局；
 * - 渲染结果按 `id:updated_at` 缓存，简历被编辑后自动失效，无需手动清理；
 * - 组件卸载 / 列表刷新后过期结果会被丢弃（generation 守卫），防止竞态覆盖。
 *
 * @param items 当前需要展示的简历列表（已排序/过滤）
 */
export function useResumePreviews(items: ResumeListItem[]) {
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState<Record<string, boolean>>({})

  const itemsRef = useRef(items)
  itemsRef.current = items
  const generationRef = useRef(0)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const queueRef = useRef<string[]>([])
  const runningRef = useRef(0)
  /** 元素 → 简历 id，用于 ref 卸载时反查取消观察。 */
  const elToId = useRef(new Map<Element, string>())
  /** 已入队/已渲染过的 id，避免重复入队。 */
  const requestedRef = useRef(new Set<string>())
  /** id → ref callback 缓存，保证传给 React 的 ref 引用稳定。 */
  const refCbs = useRef(new Map<string, (el: HTMLDivElement | null) => void>())

  const runOne = useCallback(async (id: string) => {
    const gen = generationRef.current
    const item = itemsRef.current.find((it) => it.id === id)
    if (!item) return
    try {
      const resume = await callService<Resume>('ResumeService', 'GetResumeByID', id)
      if (!resume || gen !== generationRef.current) return
      const html = await renderResumeForCard(resume)
      if (gen !== generationRef.current) return
      cacheSet(cacheKey(item), html)
      setPreviews((prev) => ({ ...prev, [id]: html }))
    } catch {
      if (gen !== generationRef.current) return
      setFailed((prev) => ({ ...prev, [id]: true }))
    }
  }, [])

  const pump = useCallback(() => {
    while (runningRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const id = queueRef.current.shift()
      if (!id) break
      runningRef.current += 1
      runOne(id).finally(() => {
        runningRef.current -= 1
        pump()
      })
    }
  }, [runOne])

  const enqueue = useCallback(
    (id: string) => {
      if (requestedRef.current.has(id)) return
      requestedRef.current.add(id)
      queueRef.current.push(id)
      pump()
    },
    [pump],
  )

  // 观察器：卡片进入视口才排队渲染
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const id = elToId.current.get(entry.target)
          if (!id) continue
          io.unobserve(entry.target)
          elToId.current.delete(entry.target)
          enqueue(id)
        }
      },
      { rootMargin: '200px' },
    )
    observerRef.current = io
    // ref 回调先于 effect 执行：面板挂载/重挂载时卡片可能已注册但 observer 尚未
    // 创建（ref 里的 observe 是空操作），这里补观察，否则这些卡片永不入队渲染。
    for (const el of elToId.current.keys()) io.observe(el)
    return () => {
      io.disconnect()
      observerRef.current = null
    }
  }, [enqueue])

  // 列表变化（刷新 / 删除 / 翻页）→ 作废在途任务，避免旧结果覆盖新列表。
  // 用「内容签名」而非数组引用做依赖：数组每次渲染都是新引用，会误伤在途任务。
  const itemsKey = useMemo(
    () => items.map((it) => `${it.id}:${it.updated_at}`).join('|'),
    [items],
  )
  useEffect(() => {
    generationRef.current += 1
    queueRef.current = []
    requestedRef.current = new Set()
    // 注意：这里不能清空 elToId —— 新卡片的 ref 回调在本 effect 之前执行，
    // 清空会把刚挂载的「元素 → 简历 id」映射抹掉，IntersectionObserver 回调
    // 查不到 id 就不会入队，预览永远停在 loading。卸载的卡片由 ref 回调的
    // null 分支自行摘除映射，这里无需（也不应该）整体重建。
    setFailed({})
  }, [itemsKey])

  /**
   * 取得挂到卡片根节点上的 ref callback：进入视口即触发渲染，命中缓存时立即回填。
   * 每个 id 只创建一次，保证引用稳定（否则 React 每次渲染都会 detach/attach）。
   */
  const observeRef = useCallback((id: string) => {
    const cached = refCbs.current.get(id)
    if (cached) return cached
    const cb = (el: HTMLDivElement | null) => {
      if (!el) {
        const observer = observerRef.current
        if (observer) {
          // 元素已卸载：找出并取消其观察（el 本身不可用时按 id 反查）
          for (const [node, nodeId] of elToId.current) {
            if (nodeId === id) {
              observer.unobserve(node)
              elToId.current.delete(node)
            }
          }
        }
        return
      }
      elToId.current.set(el, id)
      observerRef.current?.observe(el)
    }
    refCbs.current.set(id, cb)
    return cb
  }, [])

  // 命中缓存的立即回填（如切 Tab 回来、翻页回上一页）
  const cachedPreviewOf = useCallback((item: ResumeListItem) => cacheGet(cacheKey(item)), [])

  /** 列表刷新后清掉某份（或全部）缓存：由调用方在数据确实变化但 updated_at 未变时调用。 */
  const invalidate = useCallback(() => {
    previewCache.clear()
  }, [])

  const merged = useMemo(() => {
    const out: Record<string, string> = {}
    for (const item of items) {
      const hit = previews[item.id] ?? cachedPreviewOf(item)
      if (hit) out[item.id] = hit
    }
    return out
  }, [items, previews, cachedPreviewOf])

  return { previews: merged, failed, observeRef, invalidate }
}
