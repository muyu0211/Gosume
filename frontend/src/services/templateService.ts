import { isWails, callService } from './backend'
import type { TemplateMeta } from '../types/template'
import type { TemplateSet } from '../lib/templateEngine'

// ---------------------------------------------------------------------------
// Dynamic imports of template files from the ../../templates/ directory.
// These are resolved at build time by Vite via import.meta.glob.
// In Wails (production) mode these are never used — the Go backend serves
// templates. They exist purely as a dev-mode fallback so the editor and
// preview work when running `task dev` without a Wails runtime.
// ---------------------------------------------------------------------------

const metaModules = import.meta.glob<Record<string, unknown>>(
  '../../../templates/*/template.json',
  { eager: true, import: 'default' },
)

// 统一 HTML（Gosume 一期改造）：全应用共享一份；已迁移模板（uses_unified_html）
// 或模板无自带 HTML 时使用它。生产模式下由 Go 后端 GetTemplateContent 返回。
// 路径从 frontend/src/services/ 出发需三层 ../ 才能到达项目根目录 templates/。
const unifiedHtmlModules = import.meta.glob<string>(
  '../../../templates/unified.html',
  { eager: true, query: '?raw', import: 'default' },
)
const unifiedHtml = Object.values(unifiedHtmlModules)[0] ?? ''

// 尚未迁移模板的 dev 兜底（模板文件全部移除后此 glob 为空，自然回退统一 HTML）
const htmlModules = import.meta.glob<string>(
  '../../../templates/*/template.html',
  { eager: true, query: '?raw', import: 'default' },
)

const cssModules = import.meta.glob<string>(
  '../../../templates/*/styles.css',
  { eager: true, query: '?raw', import: 'default' },
)

// ---------------------------------------------------------------------------
// Build a single lookup map from the three glob results.
// Keyed by template ID (UUID from template.json).
// ---------------------------------------------------------------------------

interface TemplateEntry {
  meta: TemplateMeta
  html: string
  css: string
}

function buildTemplateMap(): Map<string, TemplateEntry> {
  const map = new Map<string, TemplateEntry>()

  for (const [filePath, raw] of Object.entries(metaModules)) {
    const meta = raw as unknown as TemplateMeta
    if (!meta.id) continue

    // Derive the HTML and CSS paths by swapping the filename
    const htmlPath = filePath.replace('template.json', 'template.html')
    const cssPath = filePath.replace('template.json', 'styles.css')

    const html = htmlModules[htmlPath] ?? ''
    const css = cssModules[cssPath] ?? ''

    // 已迁移到统一骨架（uses_unified_html）或模板无自带 HTML → 使用统一 HTML
    const entryHtml = meta.uses_unified_html || !html ? unifiedHtml : html

    // Built-in templates are always marked as such
    meta.is_builtin = true

    map.set(meta.id, { meta, html: entryHtml, css })
  }

  return map
}

const templateMap = buildTemplateMap()

// ---------------------------------------------------------------------------
// Public API — mirrors the previous interface exactly.
// ---------------------------------------------------------------------------

const TEMPLATES_KEY = 'resume-craft-templates'
const TEMPLATES_VERSION = 3

export interface ImportTemplateResult {
  id: string
  name: string
  version: string
  meta: TemplateMeta
}

/**
 * Loads template metadata. In Wails mode, calls Go TemplateService.
 * In dev mode, loads from the templates/ directory via import.meta.glob.
 */
export async function loadTemplateMetas(): Promise<TemplateMeta[]> {
  // In Wails mode, fetch from Go backend which reads from filesystem
  if (isWails()) {
    try {
      const metas = await callService<TemplateMeta[]>('TemplateService', 'ListTemplates')
      if (metas && metas.length > 0) return metas
    } catch { /* fallback to cache / built-in */ }
  }

  const versionKey = `${TEMPLATES_KEY}-version`

  // Try loading from localStorage cache if version matches
  const cachedVersion = localStorage.getItem(versionKey)
  if (cachedVersion === String(TEMPLATES_VERSION)) {
    const cached = localStorage.getItem(TEMPLATES_KEY)
    if (cached) {
      try {
        return JSON.parse(cached)
      } catch { /* ignore */ }
    }
  }

  // Use the glob-imported template metadata (synced with templates/ directory)
  const defaults: TemplateMeta[] = []
  for (const [, entry] of templateMap) {
    defaults.push(entry.meta)
  }
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(defaults))
  localStorage.setItem(versionKey, String(TEMPLATES_VERSION))
  return defaults
}

export async function loadTemplateContent(templateId: string): Promise<TemplateSet> {
  if (isWails()) {
    try {
      const content = await callService<{ html: string; css: string }>(
        'TemplateService',
        'GetTemplateContent',
        templateId,
      )
      if (content && content.html) return content
    } catch { /* fallback to built-in */ }
  }

  const entry = templateMap.get(templateId)
  if (entry) {
    return { html: entry.html, css: entry.css }
  }
  // Fallback: return the first available template, or empty
  const first = templateMap.values().next().value
  return first ? { html: first.html, css: first.css } : { html: '', css: '' }
}

export async function importTemplatePackage(): Promise<ImportTemplateResult | null> {
  if (!isWails()) {
    throw new Error('模板导入需要在 Gosume 桌面应用中使用')
  }
  return callService<ImportTemplateResult>('TemplateService', 'ImportTemplatePackage')
}

export async function saveTemplateMetas(templates: TemplateMeta[]): Promise<void> {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates))
}