import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditorStore, STYLE_PANEL_MIN_WIDTH, STYLE_PANEL_MAX_WIDTH } from '../../stores/editorStore'
import { useResumeStore } from '../../stores/resumeStore'
import {
  MARGIN_PX_MIN,
  MARGIN_PX_MAX,
  SPACING_PX_MIN,
  SPACING_PX_MAX,
  DETIAL_SPACING_PX_MIN,
  DETIAL_SPACING_PX_MAX,
} from '../../lib/layoutPresets'
import { parseCustomCss, DISPLAY_DEFAULT_LAYOUT } from '../../lib/customCss'
import { FONT_OPTIONS, findFontOption } from '../../lib/fontOptions'
import { CustomSelect, type SelectOption } from '../ui/CustomSelect'
import { ChevronsLeftRight, Rows3, AlignVerticalJustifyStart, Type } from 'lucide-react'

/**
 * 编辑页右侧栏：收纳样式排版功能（页边距 / 内容间距 / 字体），随 Toolbar 开关按钮
 * 呼出/隐藏（宽度过渡动画，推开预览区）。支持拖拽左缘调整宽度（限制最小/最大）。
 *
 * 数值存于每份简历的 custom_css（resume.custom_css），nil = 跟随模板原生外观；
 * 拖动立即写入并触发预览刷新（WYSIWYG）。
 */

/** 字体下拉选项：首项「跟随模板」，其余为商用安全字体（hint 标注分类）。 */
const FONT_SELECT_OPTIONS: SelectOption[] = [
  { value: '', label: '跟随模板' },
  ...FONT_OPTIONS.map((o) => ({
    value: o.key,
    label: o.label,
    hint: o.category === 'system' ? '系统内置' : '开源免费 · 可商用',
  })),
]

/** 字号档位（px）：姓名 18–40（步长2）、标题 12–22、正文 10–18、细节 9–16。 */
function pxOptions(min: number, max: number, step = 1): SelectOption[] {
  const opts: SelectOption[] = []
  for (let v = min; v <= max; v += step) opts.push({ value: String(v), label: `${v}px` })
  return opts
}

const NAME_SIZE_OPTIONS = pxOptions(18, 40, 2)
const TITLE_SIZE_OPTIONS = pxOptions(12, 22)
const BODY_SIZE_OPTIONS = pxOptions(10, 18)
const DETAIL_SIZE_OPTIONS = pxOptions(9, 16)

/** 字号行：label + px 下拉（首项「跟随模板」= nil）。 */
function FontSizeRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: number | null | undefined
  options: SelectOption[]
  onChange: (v: number | null) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2 last:mb-0">
      <span className="text-[12px] font-medium text-surface-600">{label}</span>
      <div className="w-[108px] flex-shrink-0">
        <CustomSelect
          value={value == null ? '' : String(value)}
          onChange={(v) => onChange(v ? parseInt(v, 10) : null)}
          options={[{ value: '', label: '跟随模板' }, ...options]}
          placeholder="跟随模板"
        />
      </div>
    </div>
  )
}

/** 单条拖动条：label + 数值（px）+ range。 */
function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  // 进入编辑页/外部值变化（nativeLayout 实测值回填等）时，用 rAF 从"当前实际显示值"
  // 平滑缓动到目标值，避免滑块直接跳变（同头像尺寸调节的 animateTo 手法）。
  // 关键点：起始值用 ref 实时读取，而非渲染闭包——否则连续 re-target 会从旧值重启，
  // 造成橡皮筋式回弹/顿挫；re-target 一律从当前 ref 值续接，保证丝滑。
  const [cur, setCur] = useState<number>(() => min)
  const curRef = useRef<number>(min)
  const rafRef = useRef<number | null>(null)
  const draggingRef = useRef(false)

  // 立即设置显示值（用户拖动时用，取消进行中的动画）。
  const setValInstant = useCallback((v: number) => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    curRef.current = v
    setCur(v)
  }, [])

  useEffect(() => {
    if (draggingRef.current) {
      setValInstant(value)
      return
    }
    const from = curRef.current
    const to = value
    if (to === from) return
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    const DURATION = 400
    const start = performance.now()
    const ease = (t: number) => 1 - Math.pow(1 - t, 3) // easeOutCubic
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION)
      const v = Math.round(from + (to - from) * ease(t))
      curRef.current = v
      setCur(v)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
      else rafRef.current = null
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [value, setValInstant])

  // 卸载时清理 rAF。
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

  return (
    <div className="mb-2.5 last:mb-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-medium text-surface-600">{label}</span>
        <span className="text-[12px] font-mono text-surface-500">{cur}px</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={cur}
        onPointerDown={() => {
          draggingRef.current = true
          setValInstant(value)
        }}
        onPointerUp={() => {
          draggingRef.current = false
          setValInstant(value)
        }}
        onPointerCancel={() => {
          draggingRef.current = false
          setValInstant(value)
        }}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10)
          setValInstant(v)
          onChange(v)
        }}
        className="w-full margin-range-slider"
      />
    </div>
  )
}

/** 功能区域卡片：统一边框 + 底色。summary 可选，省略时头部仅显示标题。 */
function PanelCard({ title, icon, summary, children }: { title: string; icon: React.ReactNode; summary?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-surface-200 bg-surface-50/60 px-3 py-3">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[12px] font-medium text-surface-600 flex items-center gap-1.5">
          {icon}
          {title}
        </span>
        {summary != null && <span className="text-[12px] font-mono text-surface-500">{summary}</span>}
      </div>
      {children}
    </div>
  )
}

export function StylePanel() {
  const open = useEditorStore((s) => s.stylePanelOpen)
  const width = useEditorStore((s) => s.stylePanelWidth)
  const setStylePanelWidth = useEditorStore((s) => s.setStylePanelWidth)
  const resume = useResumeStore((s) => s.resume)
  const updateCustomCss = useResumeStore((s) => s.updateCustomCss)
  const nativeLayout = useResumeStore((s) => s.nativeLayout)
  const style = parseCustomCss(resume?.custom_css ?? '')

  // 拖拽调宽期间禁用宽度过渡，避免拖动滞后。
  const [dragging, setDragging] = useState(false)

  // 页边距成对语义：--resume-padding 简写无法表达"一侧原生一侧自定义"，
  // 故任一滑块拖动都写入整对；未设置一侧取模板原生测量值（nativeLayout）作占位，
  // 使拖动从"当前实际渲染值"起步。测量前回退 DISPLAY_DEFAULT_LAYOUT。
  const marginY = style.pageMarginY ?? nativeLayout?.pageMarginY ?? DISPLAY_DEFAULT_LAYOUT.pageMarginY
  const marginX = style.pageMarginX ?? nativeLayout?.pageMarginX ?? DISPLAY_DEFAULT_LAYOUT.pageMarginX
  const setMargins = (patch: { pageMarginY?: number; pageMarginX?: number }) =>
    updateCustomCss({
      pageMarginY: patch.pageMarginY ?? marginY,
      pageMarginX: patch.pageMarginX ?? marginX,
    })

  const spacingSection = style.spacingSection ?? nativeLayout?.spacingSection ?? DISPLAY_DEFAULT_LAYOUT.spacingSection
  const spacingItem = style.spacingItem ?? nativeLayout?.spacingItem ?? DISPLAY_DEFAULT_LAYOUT.spacingItem
  const spacingDetail = style.spacingDetail ?? nativeLayout?.spacingDetail ?? DISPLAY_DEFAULT_LAYOUT.spacingDetail

  // 拖拽左缘调宽：向右拖动加宽，向左收窄；实时写入 store（setStylePanelWidth 内部限制范围）。
  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setDragging(true)
      const startX = e.clientX
      const startWidth = useEditorStore.getState().stylePanelWidth
      const onMove = (ev: MouseEvent) => {
        // 面板锚定在右侧：抓住左缘往左拖（dx<0）应加宽，往右拖应收窄，故用「减」。
        setStylePanelWidth(startWidth - (ev.clientX - startX))
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        setDragging(false)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [setStylePanelWidth],
  )

  return (
    <div
      className="flex-shrink-0 overflow-hidden bg-surface-100 relative"
      style={{
        width: open ? width : 0,
        transition: dragging ? 'none' : 'width 220ms ease',
      }}
    >
      {/* 内层固定宽度：动画/拖拽期间内容不重排，仅由外层 overflow-hidden 裁切；
          左缘边框放在内层，收起动画时随内容一起滑出，避免 0 宽外层残留 1px 竖线。
          内容透明度随呼出/隐藏淡入淡出，与宽度滑动配合成弹入弹出效果（拖拽时无过渡）。 */}
      <div
        className="h-full flex flex-col border-l border-surface-200"
        style={{
          width,
          opacity: open ? 1 : 0,
          transition: dragging ? 'none' : 'opacity 160ms ease',
        }}
      >
        {/* 拖拽调宽手柄（面板展开时可见） */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 bg-surface-200 hover:bg-primary-400 cursor-col-resize transition-colors"
          onMouseDown={startResize}
          title="拖拽调整面板宽度"
        />

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
          <div className="text-xs font-semibold text-surface-700 px-1 pt-0.5">样式排版</div>

          <PanelCard title="页边距" icon={<ChevronsLeftRight className="w-3 h-3" />} summary={`${marginY}×${marginX}px`}>
            <SliderRow
              label="上下"
              value={marginY}
              min={MARGIN_PX_MIN}
              max={MARGIN_PX_MAX}
              onChange={(v) => setMargins({ pageMarginY: v })}
            />
            <SliderRow
              label="左右"
              value={marginX}
              min={MARGIN_PX_MIN}
              max={MARGIN_PX_MAX}
              onChange={(v) => setMargins({ pageMarginX: v })}
            />
            <p className="text-[10px] text-surface-400 mt-2 leading-relaxed">控制页面四周的留白，仅作用于当前简历。</p>
          </PanelCard>

          <PanelCard
            title="内容间距"
            icon={<Rows3 className="w-3 h-3" />}
            summary={`${spacingSection}·${spacingItem}·${spacingDetail}px`}
          >
            <SliderRow
              label="模块"
              value={spacingSection}
              min={SPACING_PX_MIN}
              max={SPACING_PX_MAX}
              onChange={(v) => updateCustomCss({ spacingSection: v })}
            />
            <SliderRow
              label="条目"
              value={spacingItem}
              min={SPACING_PX_MIN}
              max={SPACING_PX_MAX}
              onChange={(v) => updateCustomCss({ spacingItem: v })}
            />
            <SliderRow
              label="细节"
              value={spacingDetail}
              min={SPACING_PX_MIN}
              max={DETIAL_SPACING_PX_MAX}
              onChange={(v) => updateCustomCss({ spacingDetail: v })}
            />
            <p className="text-[10px] text-surface-400 mt-2 leading-relaxed">
              模块=板块之间；条目=板块内单项之间；细节=单项内各行之间。
            </p>
          </PanelCard>

          <PanelCard
            title="字体"
            icon={<Type className="w-3 h-3" />}
            summary={style.fontKey ? (findFontOption(style.fontKey)?.label ?? '跟随模板') : '跟随模板'}
          >
            <CustomSelect
              value={style.fontKey ?? ''}
              onChange={(v) => updateCustomCss({ fontKey: v ? v : null })}
              options={FONT_SELECT_OPTIONS}
              placeholder="跟随模板"
            />
            <p className="text-[10px] text-surface-400 mt-2 leading-relaxed">
              均含中英文回退栈；开源字体未安装时自动回退到系统字体。
            </p>
          </PanelCard>

          <PanelCard title="字号" icon={<Type className="w-3 h-3" />}>
            <FontSizeRow
              label="姓名"
              value={style.fontSizeName}
              options={NAME_SIZE_OPTIONS}
              onChange={(v) => updateCustomCss({ fontSizeName: v })}
            />
            <FontSizeRow
              label="标题"
              value={style.fontSizeTitle}
              options={TITLE_SIZE_OPTIONS}
              onChange={(v) => updateCustomCss({ fontSizeTitle: v })}
            />
            <FontSizeRow
              label="正文"
              value={style.fontSizeBody}
              options={BODY_SIZE_OPTIONS}
              onChange={(v) => updateCustomCss({ fontSizeBody: v })}
            />
            <FontSizeRow
              label="细节"
              value={style.fontSizeDetail}
              options={DETAIL_SIZE_OPTIONS}
              onChange={(v) => updateCustomCss({ fontSizeDetail: v })}
            />
            <p className="text-[10px] text-surface-400 mt-2 leading-relaxed">
              姓名=最大标题；标题=章节/条目标题；正文=主要文本；细节=日期/地点等次要信息。
            </p>
          </PanelCard>

          <div className="flex items-center justify-between px-1 pt-1">
            <span className="text-[10px] text-surface-400 flex items-center gap-1.5">
              <AlignVerticalJustifyStart className="w-3 h-3" />
              拖拽面板左缘可调整宽度（{STYLE_PANEL_MIN_WIDTH}–{STYLE_PANEL_MAX_WIDTH}px）
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
