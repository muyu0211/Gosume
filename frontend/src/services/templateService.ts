import { isWails, callService } from './backend'
import type { TemplateMeta, TemplateCategory, TemplateListResponse, ImportLog } from '../types/template'
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
  '../../../templates/template.html',
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
      const content = await callService<{ html: string; css: string; paper_size?: string; orientation?: string }>(
        'TemplateService',
        'GetTemplateContent',
        templateId,
      )
      if (content && content.html) {
        return {
          html: content.html,
          css: content.css,
          paperSize: content.paper_size,
          orientation: content.orientation,
        }
      }
    } catch { /* fallback to built-in */ }
  }

  const entry = templateMap.get(templateId)
  if (entry) {
    return {
      html: entry.html,
      css: entry.css,
      paperSize: entry.meta.paper_size,
      orientation: entry.meta.orientations?.[0],
    }
  }
  // Fallback: return the first available template, or empty
  const first = templateMap.values().next().value
  return first
    ? { html: first.html, css: first.css, paperSize: first.meta.paper_size, orientation: first.meta.orientations?.[0] }
    : { html: '', css: '' }
}

export async function importTemplatePackage(): Promise<ImportTemplateResult | null> {
  if (!isWails()) {
    throw new Error('模板导入需要在 Gosume 桌面应用中使用')
  }
  return callService<ImportTemplateResult>('TemplateService', 'ImportTemplatePackage')
}

/**
 * Deletes a user-imported template by ID. Built-in templates are protected by
 * the backend (SoftDelete only affects rows where is_builtin=0) — attempting to
 * delete one surfaces a user-friendly error.
 */
export async function deleteTemplate(templateId: string): Promise<void> {
  if (!isWails()) {
    throw new Error('模板删除需要在 Gosume 桌面应用中使用')
  }
  await callService('TemplateService', 'DeleteTemplate', templateId)
}

export async function saveTemplateMetas(templates: TemplateMeta[]): Promise<void> {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates))
}

// ---------------------------------------------------------------------------
// 模板市场能力（分类浏览 / 收藏 / 导入记录 / 分享导出与导入）
// 仅在 Wails 桌面环境下可用；纯浏览器模式直接抛错。
// ---------------------------------------------------------------------------

/** 返回模板分类及数量，供模板市场分类筛选。 */
export async function listTemplateCategories(): Promise<TemplateCategory[]> {
  if (!isWails()) return []
  return (await callService<TemplateCategory[]>('TemplateService', 'ListCategories')) ?? []
}

/** 按分类/标签/收藏筛选模板并分页返回。 */
export async function queryTemplates(
  options: { category?: string; tag?: string; favoriteOnly?: boolean; page?: number; pageSize?: number } = {},
): Promise<TemplateListResponse | null> {
  if (!isWails()) return null
  return callService<TemplateListResponse>(
    'TemplateService',
    'ListTemplatesByCategory',
    options.category ?? '',
    options.tag ?? '',
    options.favoriteOnly ?? false,
    options.page ?? 1,
    options.pageSize ?? 0,
  )
}

/** 收藏或取消收藏模板。 */
export async function setTemplateFavorite(templateId: string, favorite: boolean): Promise<void> {
  if (!isWails()) throw new Error('模板收藏需要在 Gosume 桌面应用中使用')
  await callService('TemplateService', 'SetTemplateFavorite', templateId, favorite)
}

/** 分页返回模板包导入历史。 */
export async function listImportLogs(page = 1, pageSize = 50): Promise<ImportLog[]> {
  if (!isWails()) return []
  return (await callService<ImportLog[]>('TemplateService', 'ListImportLogs', page, pageSize)) ?? []
}

/** 删除一条导入历史记录。 */
export async function deleteImportLog(logId: number): Promise<void> {
  if (!isWails()) throw new Error('删除导入记录需要在 Gosume 桌面应用中使用')
  await callService('TemplateService', 'DeleteImportLog', logId)
}

/**
 * 把模板导出为可分享的 zip 分享包（弹出原生保存对话框）。
 * 用户取消时返回空串。
 */
export async function exportTemplatePackage(templateId: string): Promise<string | null> {
  if (!isWails()) throw new Error('模板导出需要在 Gosume 桌面应用中使用')
  const path = await callService<string>('TemplateService', 'ExportTemplatePackage', templateId)
  return path || null
}

/**
 * 导入他人分享的 .zip 模板包（弹出原生文件选择对话框，复用现有校验流程）。
 * 用户取消时返回 null。
 */
export async function importSharePackage(): Promise<ImportTemplateResult | null> {
  if (!isWails()) throw new Error('分享包导入需要在 Gosume 桌面应用中使用')
  return callService<ImportTemplateResult>('TemplateService', 'ImportSharePackage')
}