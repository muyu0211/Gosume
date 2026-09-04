/**
 * 简历板块标题 → 编辑 tab id 的解析。
 *
 * 模板中板块标题（.section-title）通过 `data-section` 标注所属板块；当模板
 * 未带该属性（如运行中 App 的嵌入式模板未更新）时，按标题文字兜底推断。
 * 两个消费方共享：预览点击跳转（PreviewPanel）与状态栏板块统计（StatusBar）。
 */

/**
 * 板块标题文字 → 编辑 tab id 的兜底映射。
 * 无法识别（如自定义模块名）一律归为 custom。
 */
export const SECTION_TITLE_FALLBACK: Record<string, string> = {
  教育背景: 'education',
  Education: 'education',
  实习经历: 'internships',
  Internship: 'internships',
  工作经历: 'jobs',
  'Work Experience': 'jobs',
  项目经历: 'projects',
  Projects: 'projects',
  荣誉奖项: 'awards',
  Awards: 'awards',
  技能: 'skills',
  Skills: 'skills',
  个人总结: 'summary',
  Summary: 'summary',
}

/** 解析板块标题的编辑 tab id：优先取 data-section，缺失时按标题文字兜底。 */
export function sectionTitleId(title: Element): string {
  const explicit = title.getAttribute('data-section')
  if (explicit) return explicit
  const text = (title.textContent ?? '').trim()
  return SECTION_TITLE_FALLBACK[text] ?? 'custom'
}

// ---------------------------------------------------------------------------
// 板块本地化标题（单一来源，供导航/编辑区/删除确认等复用，避免各处写死）。
// 中文文案与模板 template.html 的 i18n 值保持一致；en-US 用于英文简历场景。
// ---------------------------------------------------------------------------

const SECTION_TITLES: Record<string, { zh: string; en: string }> = {
  personal: { zh: '个人信息', en: 'Personal' },
  education: { zh: '教育背景', en: 'Education' },
  internships: { zh: '实习经历', en: 'Internship' },
  jobs: { zh: '工作经历', en: 'Work Experience' },
  projects: { zh: '项目经历', en: 'Projects' },
  awards: { zh: '荣誉奖项', en: 'Awards' },
  skills: { zh: '技能', en: 'Skills' },
  languages: { zh: '语言能力', en: 'Languages' },
  summary: { zh: '个人总结', en: 'Summary' },
  custom: { zh: '自定义', en: 'Custom' },
}

/**
 * 获取板块本地化标题（zh-CN / en-US）。未知 id 或语言缺失时回退：
 * 未知 id 返回 id 本身，语言非 en-US 一律用中文。
 */
export function getSectionTitle(sectionId: string, language?: string): string {
  const t = SECTION_TITLES[sectionId]
  if (!t) return sectionId
  return language === 'en-US' ? t.en : t.zh
}
