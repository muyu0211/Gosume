import type { Resume } from '../types/resume'

type TemplateFunc = (...args: string[]) => string

export interface TemplateSet {
  html: string
  css: string
}

/**
 * Renders a Go-style template ({{.Field}}, {{if}}, {{range}}, {{template "name"}})
 * against a JS Resume object. Handles the snake_case/PascalCase mismatch between
 * frontend JSON keys and Go struct field names used in the templates.
 */
export function renderTemplate(tmpl: TemplateSet, resume: Resume): string {
  const funcs: Record<string, TemplateFunc> = {
    dateRange: (start, end, isCurrent) => {
      if (!start) return ''
      if (isCurrent === 'true' || !end) return start + ' - 至今'
      return start + ' - ' + end
    },
    skillLevel: (level) => {
      let html = ''
      for (let i = 0; i < 5; i++) {
        html += i < parseInt(level || '0') ? '<span class="skill-dot filled"></span>' : '<span class="skill-dot"></span>'
      }
      return html
    },
    nl2br: (s) => escapeHtml(s).replace(/\n/g, '<br>'),
  }

  // Merge CSS as a named sub-template
  let merged = tmpl.html
  if (tmpl.html.includes('{{template "styles.css"') && tmpl.css) {
    merged = merged.replace(/\{\{template "styles\.css" \.\}\}/g, tmpl.css)
  }

  // Resolve all template includes first
  merged = resolveIncludes(merged)

  // Convert resume to PascalCase for Go-template compatibility
  const data = toGoShape(resume)

  // Evaluate the template
  return evaluate(merged, data, funcs)
}

function resolveIncludes(html: string): string {
  // Handle {{template "name" .}} patterns (CSS already merged above)
  // Future: support partial includes
  return html
}

function evaluate(
  template: string,
  data: Record<string, unknown>,
  funcs: Record<string, TemplateFunc>,
): string {
  let i = 0
  let result = ''

  while (i < template.length) {
    if (template[i] === '{' && template[i + 1] === '{') {
      const end = template.indexOf('}}', i)
      if (end === -1) { result += template[i]; i++; continue }
      const expr = template.slice(i + 2, end).trim()
      i = end + 2

      // {{end}}
      if (expr === 'end') continue

      // {{else}}
      if (expr === 'else') continue

      // {{if .Field}} ... {{else}} ... {{end}}
      const ifMatch = expr.match(/^if\s+(.+)$/)
      if (ifMatch) {
        const cond = isGoTruthy(evalExpr(ifMatch[1], data, funcs))
        const { consumed: blockEnd, rendered: blockContent } = consumeBlock(template, i, data, funcs, cond)
        result += cond ? blockContent : ''
        i = blockEnd
        continue
      }

      // {{range .Array}} ... {{end}}
      const rangeMatch = expr.match(/^range\s+(.+)$/)
      if (rangeMatch) {
        const arr = evalExpr(rangeMatch[1], data, funcs)
        const { consumed: blockEnd, rendered: blockContent, elseContent } = consumeRangeBlock(template, i, data, funcs)
        if (Array.isArray(arr) && arr.length > 0) {
          for (const item of arr) {
            // . inside range refers to the current item
            // Spread object fields so .Company works; set $ for {{.}} to resolve
            const itemObj = typeof item === 'object' && item !== null ? item as Record<string, unknown> : null
            const scopedData = itemObj
              ? { ...data, ...itemObj, $: item }
              : { ...data, $: item }
            result += evaluate(blockContent, scopedData, funcs)
          }
        } else if (elseContent) {
          result += evaluate(elseContent, data, funcs)
        }
        i = blockEnd
        continue
      }

      // {{funcName arg1 arg2}} or {{.Field}}
      const val = evalExpr(expr, data, funcs)
      if (val != null && val !== false) {
        result += typeof val === 'string' ? val : String(val)
      }
    } else {
      result += template[i]
      i++
    }
  }

  return result
}

function consumeBlock(
  template: string,
  start: number,
  data: Record<string, unknown>,
  funcs: Record<string, TemplateFunc>,
  condition: unknown,
): { consumed: number; rendered: string } {
  let i = start
  let depth = 1
  let ifContent = ''
  let elseContent = ''
  let inElse = false

  while (i < template.length && depth > 0) {
    if (template[i] === '{' && template[i + 1] === '{') {
      const end = template.indexOf('}}', i)
      if (end === -1) { i++; continue }
      const expr = template.slice(i + 2, end).trim()

      if (expr === 'end') {
        depth--
        if (depth === 0) { i = end + 2; break }
      } else if (expr === 'else') {
        if (depth === 1) { inElse = true }
      } else if (expr.startsWith('if ')) {
        depth++
      } else if (expr.startsWith('range ')) {
        depth++
      }

      // Collect into the appropriate branch (inElse tracks which branch we're in)
      if (inElse) {
        elseContent += '{{' + expr + '}}'
      } else {
        ifContent += '{{' + expr + '}}'
      }
      i = end + 2
    } else {
      if (inElse) {
        elseContent += template[i]
      } else {
        ifContent += template[i]
      }
      i++
    }
  }

  if (condition) {
    return { consumed: i, rendered: evaluate(ifContent, data, funcs) }
  } else if (elseContent) {
    return { consumed: i, rendered: evaluate(elseContent, data, funcs) }
  }
  return { consumed: i, rendered: '' }
}

function consumeRangeBlock(
  template: string,
  start: number,
  data: Record<string, unknown>,
  funcs: Record<string, TemplateFunc>,
): { consumed: number; rendered: string; elseContent: string | null } {
  let i = start
  let depth = 1
  let body = ''
  let elseContent: string | null = null
  let inElse = false

  while (i < template.length && depth > 0) {
    if (template[i] === '{' && template[i + 1] === '{') {
      const end = template.indexOf('}}', i)
      if (end === -1) { i++; continue }
      const expr = template.slice(i + 2, end).trim()

      if (expr === 'end') {
        depth--
        if (depth === 0) { i = end + 2; break }
      } else if (expr === 'else') {
        if (depth === 1) { inElse = true; elseContent = '' }
      } else if (expr.startsWith('if ') || expr.startsWith('range ')) {
        depth++
      }

      if (inElse) {
        elseContent += '{{' + expr + '}}'
      } else {
        body += '{{' + expr + '}}'
      }
      i = end + 2
    } else {
      if (inElse) {
        elseContent += template[i]
      } else {
        body += template[i]
      }
      i++
    }
  }

  return { consumed: i, rendered: body, elseContent }
}

function evalExpr(
  expr: string,
  data: Record<string, unknown>,
  funcs: Record<string, TemplateFunc>,
): unknown {
  expr = expr.trim()

  // Function call: funcName arg1 arg2 ...
  const funcMatch = expr.match(/^(\w+)\s+(.+)$/)
  if (funcMatch && funcs[funcMatch[1]]) {
    const rawArgs = parseArgs(funcMatch[2])
    const resolved = rawArgs.map((arg) => {
      if (arg.startsWith('.')) {
        const val = resolvePath(data, arg.slice(1))
        return val == null ? '' : String(val)
      }
      return arg
    })
    return funcs[funcMatch[1]](...resolved)
  }

  // Simple value: .Field.Nested or .Field
  if (expr.startsWith('.')) {
    return resolvePath(data, expr.slice(1))
  }

  // String literal
  if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
    return expr.slice(1, -1)
  }

  return undefined
}

function isGoTruthy(val: unknown): boolean {
  if (val === undefined || val === null || val === false) return false
  if (val === 0) return false
  if (val === '') return false
  if (Array.isArray(val) && val.length === 0) return false
  return true
}

function parseArgs(argsStr: string): string[] {
  const args: string[] = []
  let i = 0
  let current = ''
  let inString = false
  let quoteChar = ''

  while (i < argsStr.length) {
    const ch = argsStr[i]
    if (inString) {
      if (ch === quoteChar) {
        inString = false
        args.push(current)
        current = ''
      } else {
        current += ch
      }
    } else if (ch === '"' || ch === "'") {
      inString = true
      quoteChar = ch
    } else if (ch === ' ') {
      if (current) {
        args.push(current)
        current = ''
      }
    } else {
      current += ch
    }
    i++
  }
  if (current) args.push(current)
  return args
}

function resolvePath(data: Record<string, unknown>, path: string): unknown {
  // {{.}} — return the current dot value
  if (path === '') {
    return '$' in data ? data.$ : data
  }
  const parts = path.split('.')
  let current: unknown = data
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (Array.isArray(current) && /^\d+$/.test(part)) {
      current = current[parseInt(part)]
      continue
    }
    if (typeof current === 'object') {
      const obj = current as Record<string, unknown>
      current = obj[part] ?? obj[part.toLowerCase()] ?? obj[snakeToPascal(part)] ?? obj[pascalToSnake(part)]
    } else {
      return undefined
    }
  }
  return current
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function snakeToPascal(s: string): string {
  const pascal = s
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
  // Fix common acronyms: template_id -> TemplateID, company_url -> CompanyURL, etc.
  return pascal
    .replace(/\bId\b/g, 'ID')
    .replace(/\bUrl\b/g, 'URL')
    .replace(/\bQq\b/g, 'QQ')
    .replace(/\bGpa\b/g, 'GPA')
    .replace(/\bPdf\b/g, 'PDF')
    .replace(/\bDocx\b/g, 'DOCX')
    .replace(/\bPng\b/g, 'PNG')
}

function pascalToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (m, i) => (i > 0 ? '_' : '') + m.toLowerCase())
}

function toGoShape(resume: Resume): Record<string, unknown> {
  // Convert the snake_case frontend data to PascalCase for Go template compatibility
  function convert(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj
    if (Array.isArray(obj)) return obj.map(convert)
    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        result[snakeToPascal(key)] = convert(value)
      }
      return result
    }
    return obj
  }
  return convert(resume) as Record<string, unknown>
}
