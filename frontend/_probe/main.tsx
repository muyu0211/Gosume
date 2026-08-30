import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { RichTextField } from '../src/components/ui/RichTextField'

/** 测试辅助：在 contentEditable 中选中一段文字（block/inline 通用）。 */
function selectTextIn(el: HTMLDivElement, startText: string, endText?: string) {
  const node = window.document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let startNode: Text | null = null
  let endNode: Text | null = null
  let startOff = 0
  let endOff = 0
  while (node.nextNode()) {
    const t = node.currentNode as Text
    const si = t.data.indexOf(startText)
    if (si >= 0 && !startNode) {
      startNode = t
      startOff = si
      if (!endText) {
        endNode = t
        endOff = si + startText.length
        break
      }
    }
    if (startNode) {
      const ei = t.data.indexOf(endText)
      if (ei >= 0) {
        endNode = t
        endOff = ei + endText.length
        break
      }
    }
  }
  if (!startNode || !endNode) return false
  const range = window.document.createRange()
  range.setStart(startNode, startOff)
  range.setEnd(endNode, endOff)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
  el.focus()
  return true
}

declare global {
  interface Window {
    probeSelect: (which: 'block' | 'inline', start: string, end?: string) => boolean
    __records: string[]
  }
}

function App() {
  const [block, setBlock] = useState('工作概述文本：掌握前端开发与架构设计')
  const [inline, setInline] = useState('亮点文本内容')

  // 诊断：记录两个编辑区 DOM 的变化历史，判断「没改」还是「改了又被回写」。
  useEffect(() => {
    const records: string[] = []
    window.__records = records
    const els = Array.from(window.document.querySelectorAll<HTMLDivElement>('.rich-editor'))
    const dump = (tag: string) =>
      records.push(
        `${tag} t=${Date.now() % 100000} block=${els[0]?.innerHTML || ''} || inline=${els[1]?.innerHTML || ''}`,
      )
    dump('init')
    const obs = new MutationObserver(() => dump('mut'))
    els.forEach((el) => obs.observe(el, { childList: true, characterData: true, subtree: true, attributes: true }))
    return () => obs.disconnect()
  }, [])

  if (typeof window !== 'undefined') {
    window.probeSelect = (which, start, end) => {
      const els = Array.from(window.document.querySelectorAll<HTMLDivElement>('.rich-editor'))
      const el = which === 'block' ? els[0] : els[1]
      return el ? selectTextIn(el, start, end) : false
    }
  }

  return (
    <div>
      <div className="probe">
        <h3>block（工作概述同款）</h3>
        <RichTextField value={block} onChange={setBlock} maxLength={500} />
        <pre id="out-block">{block}</pre>
      </div>
      <div className="probe">
        <h3>inline（亮点同款）</h3>
        <RichTextField variant="inline" minHeight={36} value={inline} onChange={setInline} maxLength={500} />
        <pre id="out-inline">{inline}</pre>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
