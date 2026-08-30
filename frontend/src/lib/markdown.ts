import MarkdownIt from 'markdown-it'
import type { default as StateBlock } from 'markdown-it/lib/rules_block/state_block.mjs'
import DOMPurify from 'dompurify'
import TurndownService from 'turndown'

/**
 * Markdown 富文本转换工具（受限子集）。
 *
 * 为保护简历版式与分页，仅开放与主打格式兼容的少量元素：
 *   段落 <p> / 换行 <br> / 加粗 <strong> / 斜体 <em> /
 *   链接 <a> / 无序列表 <ul><li> / 有序列表 <ol><li> / 字体颜色 <span style="color">
 * 标题、图片、表格、引用、代码块与原始 HTML 一律禁用。
 *
 * 字体颜色为私有扩展：源语法 `[color:#rrggbb]文字[/color]` ↔ 渲染 `<span style="color:...">`，
 * 与列表 data-marker 同属"编辑器生成、渲染期转换"的受限语法，用户手写同样生效。
 *
 * 强调（加粗/斜体）采用"保留 HTML 标签"无损方案：
 *   - 编辑区 DOM 里的 <strong>/<em> 交叉嵌套树，序列化时原样保留标签（不压成 `**`/`*`），
 *     渲染端 html:true 透传 + DOMPurify 白名单，简历与编辑区所见完全一致（规避 CommonMark
 *     对交叉强调的死区）；
 *   - 手写/历史 `**`、`*` 定界符仍由宽松强调规则兜底解析，兼容手动输入。
 *
 * 双链路约定（编辑器 + 模板渲染共用同一条解析链，保证往返一致）：
 *   - markdownToHtml：Markdown 源（含 <strong>/<em> 标签与 [color:]/列表私有语法）→ 受限 HTML
 *   - htmlToMarkdown：编辑区 HTML → Markdown 源（turndown 序列化，保存落库用）
 */

export type MarkdownMode = 'block' | 'inline'

/** 列表符号前缀 → data-marker 名称（私有 Markdown 扩展，前端/Go 双引擎共享约定）。
 *  默认 `- ` 为圆点（无 data-marker）；以下符号开头的行渲染为对应样式的列表。 */
export const LIST_MARKERS: Record<string, string> = {
  '□': 'square',
  '→': 'arrow',
  '—': 'dash',
  '✓': 'check',
}

/** data-marker 名称 → 符号前缀（turndown 序列化时把标记还原为行首前缀；组件侧图标复用）。 */
export const LIST_MARKER_NAMES: Record<string, string> = {
  point: '•',
  square: '□',
  arrow: '→',
  dash: '—',
  check: '✓',
}

/**
 * 有序列表样式 → 行首前缀（私有扩展）。编号不写入数据源：渲染时用 CSS counter
 * 自动从 1 连续编号，删除条目后浏览器自动递补，天然满足"编号从 1 开始"。
 * decimal 为 markdown 原生 `1.`（无 data-marker），此处仅列自定义样式。
 */
export const ORDERED_MARKERS: Record<string, string> = {
  decimal: '1.',
  lower_roman: 'i.',
  upper_roman: 'I.',
  lower_alpha: 'a.',
  upper_alpha: 'A.',
  paren: '(1) ',
  bracket: '[1] ',
}

/** 有序自定义样式前缀（行首匹配，key 即 data-marker 名称）。
 *  前缀只作样式标记，编号不落库（渲染时由 CSS counter 生成）。
 *  decimal 走 markdown 原生 `1.`（无 data-marker），故不在其中。
 *  注意匹配顺序：罗马（i/I 开头）需在字母（[a-z]/[A-Z]）之前，避免 `i.` 落入 alpha。 */
const ORDERED_PREFIX_PATTERNS: Record<string, RegExp> = {
  lower_roman: /^i[vxlcdm]*\.\s*/,
  upper_roman: /^I[VXLCDM]*\.\s*/,
  lower_alpha: /^[a-z]\.\s*/,
  upper_alpha: /^[A-Z]\.\s*/,
  paren: /^\(\d+\)\s*/,
  bracket: /^\[\d+\]\s*/,
}

/** 输出白名单：仅允许与简历版式兼容的标签。 */
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'a', 'span', 'ul', 'ol', 'li']
const ALLOWED_ATTR = ['href', 'data-marker', 'style']

/** 链接协议白名单（http/https/mailto）；javascript: 等危险协议一律剥离。 */
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i

// 仅允许 style 里的 color 声明（DOMPurify 默认 CSS 白名单过宽，含 background 等，
// 超出受限子集）：无 color 的 style 直接移除，有 color 的收敛为纯 color。
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName !== 'style') return
  const m = /(?:^|;)\s*color\s*:\s*(#[0-9a-fA-F]{3,8})\s*(?:;|$)/i.exec(String(data.attrValue ?? ''))
  if (m) {
    data.attrValue = 'color:' + m[1]
  } else {
    data.keepAttr = false
  }
})

/**
 * 把任意 CSS 颜色值（#hex / rgb()/rgba() / 命名色）归一化为 #rrggbb。
 *
 * 浏览器会把内联 style 序列化为 rgb() 形式（如 style.color 返回 "rgb(255, 0, 0)"），
 * 而私有语法只认 `[color:#rrggbb]`，这里统一回写为 hex，保证往返一致。
 * canvas 的 fillStyle 支持解析全部合法 CSS 颜色，归一化结果最稳定。
 */
export function cssColorToHex(input: string): string | null {
  if (!input) return null
  if (!input.trim()) return null
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#000000'
    ctx.fillStyle = input
    const norm = ctx.fillStyle.toLowerCase()
    if (/^#[0-9a-f]{6}$/.test(norm)) return norm
    const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(norm)
    if (m) {
      return (
        '#' +
        [1, 2, 3]
          .map((i) => Math.round(Number(m[i])).toString(16).padStart(2, '0'))
          .join('')
      )
    }
    return null
  } catch {
    return null
  }
}

/** block 模式：段落 + 行内 + 列表；breaks 开启使单个换行输出 <br>。
 *  html 开启：编辑区强/斜序列化为 <strong>/<em> 标签直接透传，规避 CommonMark
 *  对交叉强调嵌套的死区；HTML 由下方 DOMPurify 白名单（仅 strong/em/span color）兜底。 */
const mdBlock = new MarkdownIt({ html: true, breaks: true, linkify: false, typographer: false }).disable([
  'image',
  'table',
  'blockquote',
  'heading',
  'lheading',
  'hr',
  'fence',
  'backticks',
  'strikethrough',
  'html_block',
])

/** inline 模式：仅行内规则（粗体/斜体/链接/颜色），不产生任何块级元素。
 *  html_inline 保留：inline 字段（亮点/扩展值）同样需要透传编辑区 <strong>/<em> 标签。 */
const mdInline = new MarkdownIt({ html: true, breaks: false, linkify: false, typographer: false }).disable([
  'image',
  'backticks',
  'strikethrough',
])

/** markdown-it inline state 的最小接口（仅用到的成员）。 */
interface InlineRuleState {
  src: string
  pos: number
  push(type: string, tag: string, nesting: number): { attrSet(name: string, value: string): void }
}

/** 字体颜色私有扩展：`[color:#rrggbb]` 起始规则（inline），生成 <span style="color:...">。 */
function colorOpenRule(state: InlineRuleState, silent: boolean): boolean {
  const src = state.src.slice(state.pos)
  const m = /^\[color:(#[0-9a-fA-F]{3,8})\](?!\])/.exec(src)
  if (!m) return false
  if (silent) return true
  const token = state.push('color_open', 'span', 1)
  token.attrSet('style', 'color:' + m[1])
  state.pos += m[0].length
  return true
}

/** 字体颜色私有扩展：`[/color]` 结束规则（inline），闭合上面的 span。 */
function colorCloseRule(state: InlineRuleState, silent: boolean): boolean {
  if (state.src.slice(state.pos, state.pos + 8) !== '[/color]') return false
  if (silent) return true
  state.push('color_close', 'span', -1)
  state.pos += 8
  return true
}

// 注册到两个引擎（block/inline 共用），放在 emphasis 前使 `[color:...]<strong>粗</strong>[/color]` 可内嵌加粗。
for (const md of [mdBlock, mdInline]) {
  md.inline.ruler.before('emphasis', 'color_open', colorOpenRule as any, { alt: ['['] })
  md.inline.ruler.before('emphasis', 'color_close', colorCloseRule as any, { alt: ['/'] })
  // 纯标签方案：强调只接受 <strong>/<em> 标签，禁用 markdown 定界符强调（`**`/`*` 显示为字面）。
  md.inline.ruler.disable('emphasis')
}

/**
 * markdown-it block rule：把「□ / → / — / ✓ + 空格」开头的连续行解析为
 * 带 data-marker 属性的无序列表，并把符号前缀从文本中剔除（所见即所得，
 * 用户看到的即最终排版）。默认 `- ` 仍走 markdown-it 原生 list 规则（圆点）。
 */
function symbolListRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const pos = state.bMarks[startLine] + state.tShift[startLine]
  const ch = state.src[pos]
  const marker = LIST_MARKERS[ch]
  if (!marker) return false
  const after = state.src[pos + 1]
  if (after !== ' ' && after !== '\t') return false
  if (silent) return true

  // 收集以同一类符号开头的连续行。
  const items: string[] = []
  let line = startLine
  while (line < endLine) {
    const p = state.bMarks[line] + state.tShift[line]
    const c = state.src[p]
    if (LIST_MARKERS[c] !== marker) break
    const nxt = state.src[p + 1]
    if (nxt !== ' ' && nxt !== '\t') break
    items.push(state.src.slice(p + 2, state.eMarks[line]))
    line++
  }
  if (items.length === 0) return false

  const Token = state.Token
  const open = new Token('bullet_list_open', 'ul', 1)
  open.attrSet('data-marker', marker)
  open.map = [startLine, line]
  open.level = state.level
  state.tokens.push(open)
  state.level++
  for (let i = 0; i < items.length; i++) {
    const liOpen = new Token('list_item_open', 'li', 1)
    liOpen.map = [startLine + i, startLine + i + 1]
    liOpen.level = state.level
    state.tokens.push(liOpen)

    const inline = new Token('inline', '', 0)
    inline.content = items[i]
    inline.children = []
    inline.map = [startLine + i, startLine + i + 1]
    inline.level = state.level + 1
    state.tokens.push(inline)

    const liClose = new Token('list_item_close', 'li', -1)
    liClose.level = state.level
    state.tokens.push(liClose)
  }
  state.level--
  const close = new Token('bullet_list_close', 'ul', -1)
  close.level = state.level
  state.tokens.push(close)
  state.line = line
  return true
}

// 注册到 markdown-it 块级解析器，仅在这些符号开头时触发（不影响原生列表）。
mdBlock.block.ruler.before('list', 'resume_symbol_list', symbolListRule as any, {
  alt: ['□', '→', '—', '✓'],
})

/**
 * markdown-it block rule：把「（1）/ [1] / a. + 空格」开头的连续行解析为
 * 带 data-marker 的有序列表。编号前缀被剥离（数据源不存编号），渲染时由 CSS
 * counter 自动从 1 连续编号，删项后浏览器自动递补。默认 `1. ` 走原生 list。
 */
function orderedListRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const pos = state.bMarks[startLine] + state.tShift[startLine]
  const lineText = state.src.slice(pos, state.eMarks[startLine])
  const marker = matchOrderedPrefix(lineText)
  if (!marker) return false
  if (silent) return true

  // 收集以同一类前缀开头的连续行。
  const items: string[] = []
  let line = startLine
  while (line < endLine) {
    const p = state.bMarks[line] + state.tShift[line]
    const text = state.src.slice(p, state.eMarks[line])
    const m = matchOrderedPrefix(text)
    if (m !== marker) break
    const pattern = ORDERED_PREFIX_PATTERNS[marker]
    if (!pattern) break
    items.push(text.replace(pattern, ''))
    line++
  }
  if (items.length === 0) return false

  const Token = state.Token
  const open = new Token('ordered_list_open', 'ol', 1)
  open.attrSet('data-marker', marker)
  open.map = [startLine, line]
  open.level = state.level
  state.tokens.push(open)
  state.level++
  for (let i = 0; i < items.length; i++) {
    const liOpen = new Token('list_item_open', 'li', 1)
    liOpen.map = [startLine + i, startLine + i + 1]
    liOpen.level = state.level
    state.tokens.push(liOpen)

    const inline = new Token('inline', '', 0)
    inline.content = items[i]
    inline.children = []
    inline.map = [startLine + i, startLine + i + 1]
    inline.level = state.level + 1
    state.tokens.push(inline)

    const liClose = new Token('list_item_close', 'li', -1)
    liClose.level = state.level
    state.tokens.push(liClose)
  }
  state.level--
  const close = new Token('ordered_list_close', 'ol', -1)
  close.level = state.level
  state.tokens.push(close)
  state.line = line
  return true
}

/** 返回行文本匹配到的有序自定义样式名（如 lower_roman/paren），无匹配返回 null。 */
function matchOrderedPrefix(text: string): string | null {
  for (const [name, pattern] of Object.entries(ORDERED_PREFIX_PATTERNS)) {
    if (pattern.test(text)) return name
  }
  return null
}

mdBlock.block.ruler.before('list', 'resume_ordered_list', orderedListRule as any, {
  alt: 'iIaA(['.split(''),
})

/** HTML → Markdown 序列化器：规则裁剪到与受限子集对齐，块内容降级为段落文本。 */
const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
  codeBlockStyle: 'fenced',
})

// 受限子集之外的块级标签：保留文本内容但去结构化语义（降级为段落）。
const UNWRAP_TAGS: Array<keyof HTMLElementTagNameMap> = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'figure',
]
for (const tag of UNWRAP_TAGS) {
  turndown.addRule('md-unwrap-' + tag, {
    filter: tag,
    replacement: (innerHTML: string) => innerHTML + '\n\n',
  })
}
// 带 data-marker 的列表：把默认 `- ` 行首替换为对应符号前缀，保证往返一致。
turndown.addRule('md-styled-list', {
  filter: (node: HTMLElement) => node.nodeName === 'UL' && !!node.getAttribute('data-marker'),
  replacement: (content: string, node: HTMLElement) => {
    const name = node.getAttribute('data-marker') || ''
    const prefix = LIST_MARKER_NAMES[name] || '-'
    // 把列表项的对齐空格一并收敛为「缩进 + 符号 + 单个空格」。
    return content.replace(/^(\s*)- +/gm, (m, indent) => indent + prefix + ' ')
  },
})
// 带 data-marker 的有序列表：把默认 `N. ` 行首替换为固定前缀（编号不落库，渲染时 counter 自动编号）。
turndown.addRule('md-styled-ol', {
  filter: (node: HTMLElement) => node.nodeName === 'OL' && !!node.getAttribute('data-marker'),
  replacement: (content: string, node: HTMLElement) => {
    const name = node.getAttribute('data-marker') || ''
    // 收敛前缀尾空格，统一为「前缀 + 单个空格」。
    const prefix = (ORDERED_MARKERS[name] || '1.').trimEnd()
    return content.replace(/^(\s*)\d+\. +/gm, (m, indent) => indent + prefix + ' ')
  },
})
// 字体颜色：`<span style="color:...">` 序列化为私有语法 `[color:#hex]...[/color]`。
// 用 node.style.color（浏览器已归一化的值，如 "rgb(255, 0, 0)"）经 cssColorToHex
// 转回 hex —— 不能直接用 getAttribute('style') 正则，内联样式在 DOM 里是 rgb() 形式，
// 只匹配 hex 会把颜色静默丢弃，导致"编辑区有色、简历无色"。
turndown.addRule('md-color-span', {
  filter: (node: HTMLElement) => {
    if (node.nodeName !== 'SPAN') return false
    return !!cssColorToHex(node.style.color)
  },
  replacement: (content: string, node: HTMLElement) => {
    const hex = cssColorToHex(node.style.color)
    return hex ? `[color:${hex}]${content}[/color]` : content
  },
})
// 图片/表格/分割线等不可见或禁止的内容：连同内容一起丢弃。
turndown.remove(['img', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr', 'video', 'iframe', 'script', 'style'])

// 行内强调/加粗：直接保留 <strong>/<em> HTML 标签序列化，而非压成 `**`/`*` 定界符。
//
// 为什么改为保留标签：Markdown 强调（CommonMark）只表达嵌套、不能可靠表达交叉/相邻强调，
// 编辑器 DOM 里的任意 `<strong><em>` 交叉树一旦压成 `**`/`*` 字符串，渲染时无法还原（死区）。
// 保留标签后，简历渲染端（html:true 透传 + DOMPurify 白名单）与编辑区所见完全一致，天然无损。
// 颜色/列表/链接仍是 markdown 私有语法（[color:]、行首符号、[text](url)），与标签混合共存。
turndown.addRule('strong', {
  filter: ['strong', 'b'],
  replacement: (content: string, node: HTMLElement) => {
    if (!content.trim()) return ''
    return `<strong>${content}</strong>`
  },
})
turndown.addRule('emphasis', {
  filter: ['em', 'i'],
  replacement: (content: string, node: HTMLElement) => {
    if (!content.trim()) return ''
    return `<em>${content}</em>`
  },
})

/** 净化受限子集 HTML，并剥离可能残留的零宽空格（U+200B，兼容旧数据）。 */
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOWED_URI_REGEXP }).replace(/\u200b/g, '')
}

/** 把 Markdown 源渲染为受限子集的安全 HTML（模板渲染与编辑器回显共用）。 */
export function markdownToHtml(src: string, mode: MarkdownMode): string {
  if (!src) return ''
  // 纯标签方案：强/斜通过 <strong>/<em> 标签透传；[color:]、列表符号、[text](url) 走私有语法。
  // 强调定界符（`**`/`*`）已在注册处禁用，保持字面显示。
  if (mode === 'inline') {
    return sanitizeHtml(mdInline.renderInline(src).replace(/\n/g, '<br>'))
  }
  const html = mdBlock
    .render(src)
    // 有序列表编号归一：忽略源中的 start（如手写 3.），编号一律从 1 连续。
    .replace(/<ol start="\d+">/g, '<ol>')
  return sanitizeHtml(html)
}

/** 把编辑区 HTML 序列化为 Markdown 源（保存落库用）。 */
export function htmlToMarkdown(html: string): string {
  if (!html) return ''
  // 直接产出标准 `**`/`*` 包裹（相邻会拼成 `***`/`****`，由渲染侧统一处理）。
  return turndown.turndown(html).trim()
}