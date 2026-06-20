import html2canvas from 'html2canvas'
import { renderTemplate } from '../lib/template-engine'
import { loadTemplateContent } from './templateService'
import type { Resume } from '../types/resume'
import type { TemplateSet } from '../lib/template-engine'

const CACHE_KEY = 'resume-craft-thumbnails'
const CACHE_VERSION = 2

const SAMPLE_DATA: Resume = {
  version: '1.0',
  meta: {
    template_id: '',
    language: 'zh-CN',
    font_size: 10,
    page_margin: 'normal',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    export_count: 0,
    name: '示例简历',
  },
  personal: {
    full_name: '张三',
    email: 'zhangsan@example.com',
    phone: '138-0000-1234',
    location: '北京市',
    job_title: '高级前端工程师',
    years_of_exp: 6,
  },
  summary: '拥有6年前端开发经验===========================，擅长React生态系统与TypeScript，主导过多个大型中后台项目的架构设计与落地。注重代码质量与团队协作，持续关注前端工程化与性能优化。',
  jobs: [
    {
      id: 'sample-job-1',
      company: '字节跳动',
      title: '高级前端工程师',
      start_date: '2020-03',
      end_date: '',
      is_current: true,
      highlights: [
        '主导飞书文档编辑器核心模块重构，性能提升40%',
        '搭建组件库与工程化体系，覆盖20+业务线',
      ],
    },
    {
      id: 'sample-job-2',
      company: '阿里巴巴',
      title: '前端开发工程师',
      start_date: '2018-07',
      end_date: '2020-02',
      is_current: false,
      highlights: [
        '参与淘宝商家后台系统开发与维护',
        '负责前端监控SDK的设计与迭代',
      ],
    },
  ],
  education: [
    {
      id: 'sample-edu-1',
      school: '浙江大学',
      degree: '本科',
      major: '软件工程',
      start_date: '2014-09',
      end_date: '2018-06',
      gpa: '3.7/4.0',
    },
  ],
  skills: [
    {
      id: 'sample-skill-1',
      category: '前端技术',
      items: [
        { name: 'React', level: 5 },
        { name: 'TypeScript', level: 4 },
        { name: 'Vue.js', level: 4 },
      ],
    },
    {
      id: 'sample-skill-2',
      category: '工程化',
      items: [
        { name: 'Webpack', level: 4 },
        { name: 'Vite', level: 4 },
      ],
    },
  ],
  projects: [
    {
      id: 'sample-proj-1',
      name: '跨平台组件库建设',
      role: '技术负责人',
      start_date: '2021-06',
      end_date: '2022-03',
      highlights: ['设计并落地了支持Web/小程序双端的组件体系'],
    },
  ],
  languages: [
    { id: 'sample-lang-1', name: '英语', level: 'CET-6 · 流利' },
  ],
  awards: [
    {
      id: 'sample-award-1',
      title: '年度最佳技术项目奖',
      date: '2022',
      issuer: '字节跳动技术委员会',
    },
  ],
}

interface ThumbnailCache {
  version: number
  data: Record<string, string>
}

function getCache(): ThumbnailCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cache = JSON.parse(raw)
    if (cache.version !== CACHE_VERSION) return null
    return cache
  } catch {
    return null
  }
}

function setCache(data: Record<string, string>): void {
  const cache: ThumbnailCache = { version: CACHE_VERSION, data }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    console.warn('Thumbnail cache write failed (quota)')
  }
}

async function captureOne(templateId: string, tmpl: TemplateSet): Promise<string> {
  const html = renderTemplate(tmpl, { ...SAMPLE_DATA, meta: { ...SAMPLE_DATA.meta, template_id: templateId } })

  // Use iframe to preserve full HTML structure (doctype, <style>, body classes)
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;height:1123px;border:0;'
  iframe.srcdoc = html
  document.body.appendChild(iframe)

  try {
    // Wait for iframe to render
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve()
      iframe.onerror = () => reject(new Error('iframe load failed'))
      // Timeout after 5s
      setTimeout(() => resolve(), 5000)
    })

    const body = iframe.contentDocument?.body
    if (!body) throw new Error('iframe body not accessible')

    const canvas = await html2canvas(body, {
      scale: 1,
      useCORS: true,
      logging: false,
      allowTaint: true,
      backgroundColor: '#ffffff',
      windowWidth: 794,
      windowHeight: 1123,
    })

    // Scale down to thumbnail size (A4 ratio: 1:√2)
    const thumbW = 280
    const thumbH = Math.round(thumbW * Math.SQRT2)
    const thumb = document.createElement('canvas')
    thumb.width = thumbW
    thumb.height = thumbH
    const ctx = thumb.getContext('2d')!
    ctx.drawImage(canvas, 0, 0, thumbW, thumbH)

    return thumb.toDataURL('image/jpeg', 0.6)
  } finally {
    document.body.removeChild(iframe)
  }
}

export async function generateAllThumbnails(
  templateIds: string[],
): Promise<Record<string, string>> {
  const cached = getCache()
  if (cached) {
    // Check if all requested templates are cached
    const missing = templateIds.filter((id) => !cached.data[id])
    if (missing.length === 0) return cached.data
  }

  const result: Record<string, string> = { ...cached?.data }

  // Generate missing thumbnails sequentially to avoid layout thrashing
  for (const id of templateIds) {
    if (result[id]) continue
    try {
      const tmpl = await loadTemplateContent(id)
      result[id] = await captureOne(id, tmpl)
    } catch (err) {
      console.error(`Thumbnail generation failed for ${id}:`, err)
      result[id] = '' // marker for empty, won't retry
    }
  }

  setCache(result)
  return result
}

export function getCachedThumbnails(): Record<string, string> {
  const cached = getCache()
  return cached?.data || {}
}
