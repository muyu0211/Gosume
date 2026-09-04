import { useEffect, useMemo, useState } from 'react'
import { useResumeStore } from '../../stores/resumeStore'
import { useTemplateStore } from '../../stores/templateStore'
import type { Resume } from '../../types/resume'
import { Circle, Ruler } from 'lucide-react'
import { getTemplatePaper, contentHeightRatio, ratioLevel } from '../../lib/contentHeight'
import { sectionTitleId } from '../../lib/resumeSections'
import { getAppVersion } from '../../services/systemService'

interface StatusBarProps {
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
}

/** 一条板块统计：标题取模板实际渲染文本，计数为可见条目数。 */
interface SectionStat {
  title: string
  count: number
}

/** 从预览 HTML 中解析出的板块标题元信息（按渲染顺序）。 */
interface SectionTitleMeta {
  id: string
  title: string
}

/**
 * 解析预览 HTML 中的真实板块标题（含本地化标题与自定义模块标题）：
 * - 语言块在 header 内（.r-langs .r-subtitle），单独取；
 * - 其余板块为 .r-main 内的 .section-title，按渲染顺序取，id 由 data-section 推断。
 * 以 previewHtml 为依赖缓存（约 300ms 防抖变化一次），避免每次渲染重复解析 DOM。
 */
function extractSectionMeta(previewHtml: string): { langsTitle: string | null; sections: SectionTitleMeta[] } {
  if (!previewHtml) return { langsTitle: null, sections: [] }
  const doc = new DOMParser().parseFromString(previewHtml, 'text/html')
  const langsTitle = doc.querySelector('.r-langs .r-subtitle')?.textContent?.trim() ?? null
  const sections = Array.from(doc.querySelectorAll('.r-main .section-title')).map((el) => ({
    id: sectionTitleId(el as Element),
    title: el.textContent?.trim() ?? '',
  }))
  return { langsTitle, sections }
}

/** 统计数组中未隐藏的条目数。 */
function visibleCount<T extends { hidden?: boolean }>(arr?: T[]): number {
  return (arr ?? []).filter((x) => !x.hidden).length
}

/**
 * 将解析出的板块标题与简历数据的可见计数配对（排除隐藏项，与实际渲染内容一致）。
 * 自定义模块（id=custom，多个）按渲染顺序与可见模块逐条配对，label 即用户自定义模块名。
 */
function computeSectionStats(
  meta: { langsTitle: string | null; sections: SectionTitleMeta[] },
  resume: Resume | null,
): SectionStat[] {
  const stats: SectionStat[] = []
  if (!resume) return stats

  const langsCount = visibleCount(resume.languages)
  if (meta.langsTitle && langsCount > 0) stats.push({ title: meta.langsTitle, count: langsCount })

  const countById: Record<string, number> = {
    education: visibleCount(resume.education),
    internships: visibleCount(resume.internships),
    jobs: visibleCount(resume.jobs),
    projects: visibleCount(resume.projects),
    awards: visibleCount(resume.awards),
    skills: (resume.skills ?? [])
      .filter((g) => !g.hidden)
      .reduce((sum, g) => sum + (g.items ?? []).filter((i) => !i.hidden).length, 0),
  }

  // 可见自定义模块的条目数（按模块顺序，与渲染出的多个自定义标题逐条配对）。
  const customCounts = (resume.custom ?? []).filter((s) => !s.hidden).map((s) => visibleCount(s.items))
  let customIdx = 0

  for (const { id, title } of meta.sections) {
    const count = id === 'custom' ? (customCounts[customIdx++] ?? 0) : (countById[id] ?? 0)
    if (count > 0) stats.push({ title, count })
  }
  return stats
}

export function StatusBar({ saveStatus = 'idle' }: StatusBarProps) {
  const isDirty = useResumeStore((s) => s.isDirty)
  const resume = useResumeStore((s) => s.resume)
  const previewHtml = useResumeStore((s) => s.previewHtml)
  const contentHeight = useResumeStore((s) => s.contentHeight)
  const templates = useTemplateStore((s) => s.templates)
  const activeTemplateId = useTemplateStore((s) => s.activeTemplateId)

  // 应用版本号从后端获取（编译期嵌入），避免写死。
  const [appVersion, setAppVersion] = useState('')
  useEffect(() => {
    let cancelled = false
    getAppVersion().then((v) => {
      if (!cancelled) setAppVersion(v)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const activeTemplate = templates.find((t) => t.id === activeTemplateId)

  // 标题解析按 previewHtml 缓存；计数配对随 resume 实时重算。
  const sectionMeta = useMemo(() => extractSectionMeta(previewHtml), [previewHtml])
  const sectionStats = useMemo(() => computeSectionStats(sectionMeta, resume), [sectionMeta, resume])

  const paper = getTemplatePaper(activeTemplate?.paper_size, activeTemplate?.orientations?.[0])

  const heightRatio = contentHeightRatio(contentHeight, paper)
  const level = heightRatio == null ? null : ratioLevel(heightRatio)

  const heightColor =
    level == null ? '' :
    level === 'over' ? 'text-red-500' :
    level === 'ok' ? 'text-amber-500' : 'text-emerald-500'

  const heightTip =
    heightRatio == null ? '' :
    level === 'over'
      ? `当前内容高度 ${contentHeight}px，约一页纸的 ${Math.round(heightRatio * 100)}%，超出较多，导出为一页 PDF 会使内容过小`
      : level === 'ok'
      ? `当前内容高度 ${contentHeight}px，约一页纸的 ${Math.round(heightRatio * 100)}%，略超一页，仍适合导出为一页 PDF`
      : `当前内容高度 ${contentHeight}px，约一页纸的 ${Math.round(heightRatio * 100)}%，一页即可完整放下`

  const statusText =
    saveStatus === 'saving' ? '保存中...' :
    saveStatus === 'saved' ? '已保存' :
    saveStatus === 'error' ? '保存失败' :
    isDirty ? '未保存' : '已保存'

  const statusColor =
    saveStatus === 'saving' ? 'text-blue-500 fill-blue-500' :
    saveStatus === 'saved' ? 'text-emerald-500 fill-emerald-500' :
    saveStatus === 'error' ? 'text-red-500 fill-red-500' :
    isDirty ? 'text-amber-500 fill-amber-500' : 'text-emerald-500 fill-emerald-500'

  return (
    <div className="h-7 flex items-center justify-between px-3 bg-surface-100 text-surface-400 text-xs flex-shrink-0 select-none border-t border-surface-200">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Circle className={`w-2 h-2 ${statusColor}`} />
          <span className="text-surface-500">{statusText}</span>
        </div>
        <span className="text-surface-300">|</span>
        <span className="text-surface-500">{activeTemplate?.name || '现代专业风'}</span>
      </div>
      <div className="flex items-center gap-3">
        {heightRatio != null && (
          <span
            className={`flex items-center gap-1 ${heightColor}`}
            title={heightTip}
          >
            <Ruler className="w-3 h-3" />
            实际内容高度 {Math.round(heightRatio * 100)}%
          </span>
        )}
        {sectionStats.map((s) => (
          <span key={`${s.title}:${s.count}`} className="text-surface-500">
            {s.title} {s.count}
          </span>
        ))}
        <span className="text-surface-300">|</span>
        <span className="text-surface-500">Gosume{appVersion ? ` v${appVersion}` : ''}</span>
      </div>
    </div>
  )
}
