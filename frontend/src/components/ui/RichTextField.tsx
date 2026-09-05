import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ClipboardEvent, FormEvent, ReactNode } from 'react'
import { Bold, Italic, Link, List, ListOrdered, Palette, RemoveFormatting } from 'lucide-react'
import { cssColorToHex, htmlToMarkdown, LIST_MARKER_NAMES, ORDERED_MARKERS, markdownToHtml, type MarkdownMode } from '../../lib/markdown'

/** 无序列表可选符号（value 为 data-marker；disc 为默认圆点，不带标记）。
 *  符号字符复用 markdown.ts 的 LIST_MARKER_NAMES，避免两处重复维护。 */
const LIST_OPTIONS = [
  { value: 'disc', icon: LIST_MARKER_NAMES.point, label: '圆点' },
  { value: 'square', icon: LIST_MARKER_NAMES.square, label: '方点' },
  { value: 'arrow', icon: LIST_MARKER_NAMES.arrow, label: '箭头' },
  { value: 'dash', icon: LIST_MARKER_NAMES.dash, label: '破折号' },
  { value: 'check', icon: LIST_MARKER_NAMES.check, label: '对勾' },
]

/** 有序列表可选标号（value 为 data-marker；decimal 为原生数字，不带标记）。
 *  编号由渲染层 counter 自动生成，删项自动递补，数据源不存编号。 */
const ORDERED_OPTIONS = [
  { value: 'decimal', icon: ORDERED_MARKERS.decimal, label: '数字' },
  { value: 'lower_roman', icon: ORDERED_MARKERS.lower_roman, label: '小罗马数字' },
  { value: 'upper_roman', icon: ORDERED_MARKERS.upper_roman, label: '大罗马数字' },
  { value: 'lower_alpha', icon: ORDERED_MARKERS.lower_alpha, label: '小写字母' },
  { value: 'upper_alpha', icon: ORDERED_MARKERS.upper_alpha, label: '大写字母' },
  { value: 'paren', icon: ORDERED_MARKERS.paren, label: '圆括号' },
  { value: 'bracket', icon: ORDERED_MARKERS.bracket, label: '方括号' },
]

/** 字体颜色预设色板（类 Word 常用色，8 列 × 3 行 = 24 色）。 */
const COLOR_PRESETS = [
  // 黑白灰
  '#000000',
  '#404040',
  '#808080',
  '#BFBFBF',
  '#FFFFFF',
  // 红/橙/黄
  '#C00000',
  '#FF0000',
  '#ED7D31',
  '#FF7F00',
  '#FFC000',
  '#FFFF00',
  // 绿
  '#A9D18E',
  '#92D050',
  '#70AD47',
  '#00B050',
  // 蓝
  '#5B9BD5',
  '#00B0F0',
  '#4472C4',
  '#0070C0',
  '#0000FF',
  // 紫/品红
  '#7030A0',
  '#FF00FF',
  // 深棕/青
  '#C55A11',
  '#2E75B6',
]

/**
 * 锚点下拉菜单 hook：基于触发按钮定位（fixed + Portal），含滚动跟随、
 * 外部点击 / Escape 关闭。列表符号与有序标号两个下拉共用。
 */
function useAnchorMenu(triggerRef: React.RefObject<HTMLButtonElement>) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const updatePos = () => {
    const btn = triggerRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.left })
  }

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    updatePos()
    setOpen(true)
  }
  const close = () => setOpen(false)

  // 打开时先定位（useLayoutEffect 避免闪烁）。
  useLayoutEffect(() => {
    if (open) updatePos()
    // 仅依赖 open；updatePos 为稳定函数。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // 外部滚动（面板内部滚动除外）跟随按钮重算，避免 fixed 漂移。
  useEffect(() => {
    if (!open) return
    const onScroll = (e: Event) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      updatePos()
    }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [open])

  // 外部点击 / Escape 关闭。
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return { open, pos, menuRef, toggle, close }
}

interface RichTextFieldProps {
  /** Markdown 源文本（对外受控，变化时若未在输入中则回写编辑区）。 */
  value: string
  onChange: (value: string) => void
  maxLength?: number
  placeholder?: string
  /** 编辑区最小高度（px）。block 默认 88，inline 默认 36。 */
  minHeight?: number
  /** block：段落 + 列表 + 行内；inline：仅行内（亮点条目，保持一条一 bullet）。 */
  variant?: 'block' | 'inline'
  /** 工具栏显示策略：always 常驻 / focus 聚焦时出现 / none 不显示。block 默认 always，inline 默认 focus。 */
  toolbar?: 'always' | 'focus' | 'none'
  /** 是否显示字数统计（block 且提供 maxLength 时默认显示）。 */
  showCount?: boolean
  /** 根节点附加类名（用于布局，如 flex 容器内的尺寸约束）。 */
  className?: string
}

interface ToolButtonProps {
  title: string
  disabled?: boolean
  active?: boolean
  onClick: () => void
  children: ReactNode
  buttonRef?: React.Ref<HTMLButtonElement>
}

/**
 * 通用富文本输入组件（所见即所得，类 Word 工具栏）。
 *
 *   编辑区为 contentEditable，用户选中文字后点击格式按钮即可应用格式，全程不暴露
 *   Markdown 语法标记；底层数据以 Markdown 源码存储（htmlToMarkdown / markdownToHtml 双向转换）。
 * - 受控同步策略：仅当外部 value 与最近落库值不一致且不在输入法组合期时回写 DOM
 *   （输入中 onChange 回流的值被 lastValueRef 短路跳过），避免光标跳动。
 * - 粘贴净化：外部粘贴一律按纯文本插入，防止携带受限子集之外的危险标签。
 */
export function RichTextField({
  value,
  onChange,
  maxLength,
  placeholder,
  minHeight,
  variant = 'block',
  toolbar: toolbarProp,
  showCount = true,
  className,
}: RichTextFieldProps) {
  const isInline = variant === 'inline'
  const mode: MarkdownMode = isInline ? 'inline' : 'block'
  const toolbarMode = toolbarProp ?? (isInline ? 'focus' : 'always')

  const editorRef = useRef<HTMLDivElement>(null)
  /** 链接输入框引用：浮层展开时自动聚焦。 */
  const linkInputRef = useRef<HTMLInputElement>(null)
  /** 编辑器最近一次落库的 Markdown 值，用于区分"外部变更"与"自身输入回流"。 */
  const lastValueRef = useRef(value)
  /** 中文输入法组合期置位，挂起序列化与外部同步。 */
  const composingRef = useRef(false)
  const [count, setCount] = useState(0)
  const [isEmpty, setIsEmpty] = useState(true)
  const [focused, setFocused] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  /** 编辑器是否有非空选区：无选区时格式按钮置灰（对齐"类 Word"交互）。 */
  const [hasSelection, setHasSelection] = useState(false)
  /** 无序符号 / 有序标号 / 字体颜色 三个下拉（共用 useAnchorMenu，Portal 到 body 避免 transform 祖先干扰）。 */
  const listBtnRef = useRef<HTMLButtonElement>(null)
  const orderedBtnRef = useRef<HTMLButtonElement>(null)
  const colorBtnRef = useRef<HTMLButtonElement>(null)
  const listMenu = useAnchorMenu(listBtnRef)
  const orderedMenu = useAnchorMenu(orderedBtnRef)
  const colorMenu = useAnchorMenu(colorBtnRef)

  // 跟踪选区状态：选区变化（含点击/键盘移动）时刷新按钮可用性。
  useEffect(() => {
    const update = () => {
      const selection = window.getSelection()
      setHasSelection(!!selection && !selection.isCollapsed)
    }
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [])

  // 链接浮层展开时自动聚焦输入框。
  useEffect(() => {
    if (linkOpen) linkInputRef.current?.focus()
  }, [linkOpen])

  /** 读取编辑区可见文本长度并同步字数统计。 */
  function syncCount(el: HTMLDivElement) {
    const text = el.innerText || ''
    setCount(text.replace(/\n/g, '').length)
    setIsEmpty(text.trim() === '')
  }

  /** 把编辑区当前 HTML 序列化为 Markdown 并对外通知。 */
  function flush(el: HTMLDivElement) {
    if (composingRef.current) return
    const md = htmlToMarkdown(el.innerHTML)
    lastValueRef.current = md
    onChange(md)
  }

  // 初始化：以初始 value 渲染一次编辑区内容（仅挂载时执行）。
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    el.innerHTML = markdownToHtml(value, mode) || ''
    syncCount(el)
    // 挂载期一次性初始化，后续变更由下方 [value, mode] effect 接管。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 外部值变更：仅当与最近落库值不一致时回写 DOM（输入中被 onChange 回流的值短路跳过）。
  // 对比口径与 flush 一致（统一走 htmlToMarkdown），保证自身回流不会触发重渲染。
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    if (value === lastValueRef.current) return
    if (composingRef.current) return
    const currentMarkdown = htmlToMarkdown(el.innerHTML)
    if (currentMarkdown !== value) {
      el.innerHTML = markdownToHtml(value, mode) || ''
    }
    lastValueRef.current = value
    syncCount(el)
    // mode 由 variant 决定，外部固定不变。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function handleInput() {
    const el = editorRef.current
    if (!el) return
    syncCount(el)
    flush(el)
  }

  function handleCompositionStart() {
    composingRef.current = true
  }

  function handleCompositionEnd() {
    composingRef.current = false
    handleInput()
  }

  function handleBeforeInput(e: FormEvent<HTMLDivElement>) {
    const el = editorRef.current
    if (!el) return
    const event = e.nativeEvent as InputEvent
    const inserting = /insertText|insertFromPaste|insertFromDrop|insertParagraph|insertLineBreak/.test(event.inputType)
    // 超上限时禁止继续插入文本。
    if (maxLength != null && inserting && (el.innerText || '').length >= maxLength) {
      e.preventDefault()
      return
    }
    // inline 单行形态：禁止新增换行（保留一条一 bullet 的结构）。
    if (isInline && (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak')) {
      e.preventDefault()
    }
  }

  /** 粘贴净化：一律按纯文本插入（inline 去除换行），并受字数上限约束。 */
  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    e.preventDefault()
    const el = editorRef.current
    if (!el) return
    let text = e.clipboardData.getData('text/plain')
    if (!text) return
    const remain = maxLength != null ? Math.max(0, maxLength - (el.innerText || '').length) : Infinity
    text = text.slice(0, remain)
    if (isInline) text = text.replace(/\n/g, ' ')
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    el.focus()
    document.execCommand('insertHTML', false, isInline ? escaped : escaped.replace(/\n/g, '<br>'))
    handleInput()
  }

  /** 执行原生格式命令（加粗/斜体），执行后立即序列化。列表走 applyList / applyOrderedList。 */
  function exec(cmd: string, cmdValue?: string) {
    const el = editorRef.current
    if (!el) return
    el.focus()
    document.execCommand(cmd, false, cmdValue)
    handleInput()
  }

  /** 清除整个输入框的所有格式（加粗/斜体/链接/列表等），仅保留纯文本与换行结构。
   *  不依赖选区：读取可见文本后重建为纯文本块，彻底移除格式标签。 */
  function clearAllFormat() {
    const el = editorRef.current
    if (!el) return
    el.focus()
    const lines = (el.innerText || '').split('\n')
    // 每行一个块级 <div>（空行保留占位），避免 HTML 中的 \n 被折叠成空格。
    el.innerHTML = lines
      .map((line) => (line ? `<div>${escapeHtmlEntities(line)}</div>` : '<div><br></div>'))
      .join('')
    handleInput()
  }

  /** 应用字体颜色（DOM 级，类 Word toggle 语义）：
   *  - 选区恰好覆盖一个颜色 span 的全部内容：同色 → 解包（取消颜色）；异色 → 直接改色，保持选区；
   *  - 其余情况（无颜色 / 部分选中 / 跨颜色）：按选区逐文本节点包上新颜色 span，
   *    用 splitText 对齐边界，避免 extractContents+insertNode 造成的嵌套错乱与换行问题。
   *  - 颜色比较统一走 cssColorToHex 归一化（浏览器内联样式是 rgb() 形式），否则 toggle 永不触发。 */
  function applyColor(color: string) {
    colorMenu.close()
    const el = editorRef.current
    if (!el) return
    el.focus()
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return
    const range = selection.getRangeAt(0)

    const startEl = range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : (range.startContainer as HTMLElement)
    const endEl = range.endContainer.nodeType === Node.TEXT_NODE
      ? range.endContainer.parentElement
      : (range.endContainer as HTMLElement)
    const startSpan = startEl ? startEl.closest<HTMLElement>('span[style*="color"]') : null
    const endSpan = endEl ? endEl.closest<HTMLElement>('span[style*="color"]') : null

    // 场景 1：选区完整落在同一个颜色 span 内且覆盖其全部内容。
    if (startSpan && startSpan === endSpan && selectionFillsSpan(range, startSpan)) {
      if (cssColorToHex(startSpan.style.color) === cssColorToHex(color)) {
        // 同色 → 解包并重新选中。
        const parent = startSpan.parentNode
        if (parent) {
          const first = startSpan.firstChild
          const last = startSpan.lastChild
          while (startSpan.firstChild) parent.insertBefore(startSpan.firstChild, startSpan)
          parent.removeChild(startSpan)
          if (first && last) {
            const newRange = document.createRange()
            newRange.setStartBefore(first)
            newRange.setEndAfter(last)
            selection.removeAllRanges()
            selection.addRange(newRange)
          }
        }
      } else {
        // 异色 → 整体改色（保持选区）。
        startSpan.style.color = color
      }
      handleInput()
      return
    }

    // 场景 2：通用包裹（逐文本节点，安全处理部分选中 / 跨颜色选区）。
    wrapSelectionColor(range, color)
    handleInput()
  }

  /** 清除选区内的字体颜色（解包所有 color span），保留其他格式。 */
  function clearColor() {
    colorMenu.close()
    const el = editorRef.current
    if (!el) return
    el.focus()
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return
    const container = selection.getRangeAt(0).commonAncestorContainer
    const root = container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as HTMLElement)
    if (!root) return
    const spans = root.matches('span[style*="color"]') ? [root] : []
    spans.push(...Array.from(root.querySelectorAll<HTMLElement>('span[style*="color"]')))
    spans.forEach((span) => {
      const parent = span.parentNode
      if (!parent) return
      while (span.firstChild) parent.insertBefore(span.firstChild, span)
      parent.removeChild(span)
    })
    handleInput()
  }

  /** 应用列表格式（toggle 语义，无序/有序共用）：
   *  - 不在列表中：新建列表并设置所选符号/标号；
   *  - 已在列表中且点击的是当前符号：取消列表（回到普通文本）；
   *  - 已在列表中且点击其他符号：仅切换符号。
   *  编号不落库，渲染时由 CSS counter 自动从 1 连续编号，删项后浏览器自动递补。 */
  function applyListMarker(
    selector: 'ul' | 'ol',
    cmd: 'insertUnorderedList' | 'insertOrderedList',
    defaultMarker: string,
    marker: string,
  ) {
    const el = editorRef.current
    if (!el) return
    el.focus()

    const existing = findSelectionList(selector)
    if (existing) {
      const current = existing.getAttribute('data-marker') || defaultMarker
      if (current === marker) {
        // 点击当前符号 → 取消列表（原生 toggle 命令移除列表）。
        document.execCommand(cmd)
      } else if (marker !== defaultMarker) {
        existing.setAttribute('data-marker', marker)
      } else {
        existing.removeAttribute('data-marker')
      }
    } else {
      // 新建列表（原生 toggle 命令，保留选区）。
      document.execCommand(cmd)
      const created = findSelectionList(selector)
      if (created && marker !== defaultMarker) created.setAttribute('data-marker', marker)
    }
    handleInput()
  }

  /** 应用无序列表格式（见 applyListMarker）。 */
  function applyList(marker: string) {
    listMenu.close()
    applyListMarker('ul', 'insertUnorderedList', 'disc', marker)
  }

  /** 应用有序列表格式（见 applyListMarker）。 */
  function applyOrderedList(marker: string) {
    orderedMenu.close()
    applyListMarker('ol', 'insertOrderedList', 'decimal', marker)
  }

  /** 返回当前选区所在的列表容器（默认 <ul>；无选区或不在列表中返回 null）。 */
  function findSelectionList(selector = 'ul'): HTMLElement | null {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const container = sel.getRangeAt(0).commonAncestorContainer
    const node = container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as HTMLElement)
    return node?.closest(selector) ?? null
  }

  /** 创建/取消链接：确认后对当前选区应用 http(s)/mailto 链接。 */
  function confirmLink() {
    const url = linkUrl.trim()
    const el = editorRef.current
    setLinkOpen(false)
    setLinkUrl('')
    if (!el) return
    if (/^(https?:\/\/|mailto:)/i.test(url) || url === '') {
      el.focus()
      document.execCommand(url ? 'createLink' : 'unlink', false, url)
      handleInput()
    }
  }

  const showToolbar = toolbarMode === 'always' || (toolbarMode === 'focus' && focused)

  return (
    <div className={`relative ${isInline ? 'min-w-0 flex-1' : ''} ${className ?? ''}`}>
      {/* 工具栏常驻容器：max-height/opacity 过渡实现渐大渐小，避免聚焦时组件高度突变 */}
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${showToolbar ? 'max-h-12 opacity-100 mb-1' : 'max-h-0 opacity-0 pointer-events-none'}`}
        onMouseDown={(e) => e.preventDefault()}
        aria-hidden={!showToolbar}
      >
        <div className="flex items-center gap-0.5">
          <ToolButton title="加粗" disabled={!hasSelection} onClick={() => exec('bold')}>
            <Bold className="w-3.5 h-3.5" />
          </ToolButton>
          <ToolButton title="斜体" disabled={!hasSelection} onClick={() => exec('italic')}>
            <Italic className="w-3.5 h-3.5" />
          </ToolButton>
          <ToolButton title="添加链接" active={linkOpen} onClick={() => setLinkOpen((v) => !v)}>
            <Link className="w-3.5 h-3.5" />
          </ToolButton>
          {!isInline && (
            <>
              <ToolButton
                buttonRef={orderedBtnRef}
                title="有序列表"
                disabled={!hasSelection}
                active={orderedMenu.open}
                onClick={orderedMenu.toggle}
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </ToolButton>
              <ToolButton
                buttonRef={listBtnRef}
                title="无序列表"
                disabled={!hasSelection}
                active={listMenu.open}
                onClick={listMenu.toggle}
              >
                <List className="w-3.5 h-3.5" />
              </ToolButton>
            </>
          )}
          <ToolButton
            buttonRef={colorBtnRef}
            title="字体颜色"
            disabled={!hasSelection}
            active={colorMenu.open}
            onClick={colorMenu.toggle}
          >
            <Palette className="w-3.5 h-3.5" />
          </ToolButton>
          <ToolButton title="清除格式" onClick={clearAllFormat}>
            <RemoveFormatting className="w-3.5 h-3.5" />
          </ToolButton>
        </div>
      </div>

      {/* 链接输入浮层：同样以过渡动画展开/收起 */}
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${linkOpen ? 'max-h-12 opacity-100 mb-1.5' : 'max-h-0 opacity-0 pointer-events-none'}`}
        onMouseDown={(e) => e.preventDefault()}
        aria-hidden={!linkOpen}
      >
        <div className="flex items-center gap-1.5">
          <input
            ref={linkInputRef}
            className="form-input text-xs flex-1"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmLink()
              if (e.key === 'Escape') {
                setLinkOpen(false)
                setLinkUrl('')
              }
            }}
            placeholder="输入链接地址 (https://...)"
          />
          <button className="btn-primary btn-xs" onClick={confirmLink}>
            确认
          </button>
          <button
            className="btn-ghost btn-xs"
            onClick={() => {
              setLinkOpen(false)
              setLinkUrl('')
            }}
          >
            取消
          </button>
        </div>
      </div>

      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onInput={handleInput}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            const el = editorRef.current
            if (el) {
              flush(el)
              syncCount(el)
            }
          }}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onBeforeInput={handleBeforeInput}
          onPaste={handlePaste}
          className={`rich-editor w-full px-3 py-2 text-sm border border-surface-200 rounded-lg bg-elev
            focus:outline-none focus:ring-2 focus:ring-primary-500/15 focus:border-primary-400
            transition-all duration-150 overflow-auto break-words leading-relaxed
            ${isInline ? '' : 'text-surface-800'}`}
          style={{ minHeight: minHeight ?? (isInline ? 36 : 88) }}
        />
        {isEmpty && !focused && placeholder && (
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-surface-300"
            onClick={() => editorRef.current?.focus()}
          >
            {placeholder}
          </span>
        )}
      </div>

      {!isInline && maxLength != null && showCount && (
        <p className="text-[10px] text-surface-400 mt-0.5">
          {count} / {maxLength} 字
        </p>
      )}

      {/* 列表符号 / 有序标号下拉：Portal 到 body + fixed，避免 transform 祖先（AnimatedPage）干扰定位 */}
      {listMenu.open &&
        listMenu.pos &&
        createPortal(
          <div
            ref={listMenu.menuRef}
            className="fixed z-[9999] min-w-[132px] bg-elev border border-surface-200 rounded-lg shadow-lg py-1 animate-dropdown-enter"
            style={{ top: listMenu.pos.top, left: listMenu.pos.left }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {LIST_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-surface-600 hover:bg-surface-100 hover:text-surface-800 text-left"
                onClick={() => applyList(opt.value)}
              >
                <span className="w-4 inline-block text-center">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>,
          document.body,
        )}

      {orderedMenu.open &&
        orderedMenu.pos &&
        createPortal(
          <div
            ref={orderedMenu.menuRef}
            className="fixed z-[9999] min-w-[132px] bg-elev border border-surface-200 rounded-lg shadow-lg py-1 animate-dropdown-enter"
            style={{ top: orderedMenu.pos.top, left: orderedMenu.pos.left }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {ORDERED_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-surface-600 hover:bg-surface-100 hover:text-surface-800 text-left"
                onClick={() => applyOrderedList(opt.value)}
              >
                <span className="w-4 inline-block text-center whitespace-nowrap">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>,
          document.body,
        )}

      {/* 字体颜色色板：预设色 + 常驻自定义色盘 + 无颜色 */}
      {colorMenu.open &&
        colorMenu.pos &&
        createPortal(
          <div
            ref={colorMenu.menuRef}
            className="fixed z-[9999] bg-elev border border-surface-200 rounded-lg shadow-lg p-2 animate-dropdown-enter"
            style={{ top: colorMenu.pos.top, left: colorMenu.pos.left }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="grid grid-cols-8 gap-1">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  className="w-5 h-5 rounded border border-surface-200 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                  onClick={() => applyColor(c)}
                />
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-surface-100 flex items-center justify-end">
              <button
                type="button"
                className="text-[12px] text-surface-500 hover:text-red-600"
                onClick={clearColor}
              >
                无颜色
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

function ToolButton({ title, disabled, active, onClick, children, buttonRef }: ToolButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`p-1 rounded-md text-surface-500 hover:text-primary-600 hover:bg-surface-100 transition-colors
        ${active ? 'text-primary-600 bg-primary-50' : ''} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  )
}

function escapeHtmlEntities(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 选区范围是否完整覆盖 span 的全部内容（selectNodeContents 对齐起点/终点比较）。 */
function selectionFillsSpan(range: Range, span: HTMLElement): boolean {
  const spanRange = document.createRange()
  spanRange.selectNodeContents(span)
  return (
    range.compareBoundaryPoints(Range.START_TO_START, spanRange) <= 0 &&
    range.compareBoundaryPoints(Range.END_TO_END, spanRange) >= 0
  )
}

/** 通用颜色包裹：把选区内的每个文本节点切出选中段并包上新颜色 span。
 *  splitText 在文本节点内部精确切分，避免 extractContents+insertNode 在
 *  跨 span / 部分选中时产生嵌套错乱或破坏换行结构；包裹后重新选中新内容。 */
function wrapSelectionColor(range: Range, color: string) {
  const doc = range.commonAncestorContainer.ownerDocument || document
  const startNode = range.startContainer
  const endNode = range.endContainer
  const startOffset = range.startOffset
  const endOffset = range.endOffset

  // 选区完全落在单个文本节点内时，commonAncestorContainer 就是该文本节点本身，
  // TreeWalker 以它为 root 找不到任何子文本节点（文本节点无子节点）→ 需用其父元素遍历。
  let walkRoot: Node = range.commonAncestorContainer
  if (walkRoot.nodeType === Node.TEXT_NODE) {
    walkRoot = walkRoot.parentNode || walkRoot
  }

  const textNodes: Text[] = []
  const walker = doc.createTreeWalker(walkRoot, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const t = walker.currentNode as Text
    if (range.intersectsNode(t)) textNodes.push(t)
  }

  const created: HTMLElement[] = []
  for (const t of textNodes) {
    let s = 0
    let e = t.length
    if (t === startNode) s = startOffset
    if (t === endNode) e = endOffset
    if (s >= e) continue
    // 切出 [s, e) 段：先切起点，再切终点（splitText 后终点偏移需减去 s）。
    let seg: Text = t
    if (s > 0) seg = seg.splitText(s)
    if (e < seg.length) seg.splitText(e - s)
    const span = doc.createElement('span')
    span.style.color = color
    seg.parentNode!.insertBefore(span, seg)
    span.appendChild(seg)
    created.push(span)
  }

  // 重新选中包裹后的内容（保持"改完继续选中"的类 Word 交互）。
  if (created.length) {
    const newRange = doc.createRange()
    newRange.setStartBefore(created[0])
    newRange.setEndAfter(created[created.length - 1])
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
      selection.addRange(newRange)
    }
  }
}