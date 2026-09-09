import { useState, useCallback, useMemo } from 'react'
import { useEditorStore, STYLE_PANEL_MIN_WIDTH, STYLE_PANEL_MAX_WIDTH } from '../../stores/editorStore'
import { useResumeStore } from '../../stores/resumeStore'
import { AnimatedRange } from '../ui/AnimatedRange'
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
import { useT } from '../../lib/i18n'
import { ChevronsLeftRight, Rows3, AlignVerticalJustifyStart, Type } from 'lucide-react'

/**
 * 编辑页右侧栏：收纳样式排版功能（页边距 / 内容间距 / 字体），随 Toolbar 开关按钮
 * 呼出/隐藏（宽度过渡动画，推开预览区）。支持拖拽左缘调整宽度（限制最小/最大）。
 *
 * 数值存于每份简历的 custom_css（resume.custom_css），nil = 跟随模板原生外观；
 * 拖动立即写入并触发预览刷新（WYSIWYG）。
 */

/** 字体下拉选项：首项「跟随模板」，其余为商用安全字体（hint 标注分类）。 */
function buildFontOptions(t: (k: string) => string): SelectOption[] {
  return [
    { value: '', label: t('followTemplate') },
    ...FONT_OPTIONS.map((o) => ({
      value: o.key,
      label: o.label,
      hint: o.category === 'system' ? t('fontSystem') : t('fontOpenSource'),
    })),
  ]
}

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
  const t = useT()
  return (
    <div className="flex items-center justify-between gap-2 mb-2 last:mb-0">
      <span className="text-[12px] font-medium text-surface-600 min-w-0 truncate">{label}</span>
      {/* 下拉宽度跟随面板：面板宽时撑到 max-w 显示完整文本，窄时收缩省略 */}
      <div className="flex-1 min-w-0 max-w-[240px]">
        <CustomSelect
          value={value == null ? '' : String(value)}
          onChange={(v) => onChange(v ? parseInt(v, 10) : null)}
          options={[{ value: '', label: t('followTemplate') }, ...options]}
          placeholder={t('followTemplate')}
        />
      </div>
    </div>
  )
}

/** 单条拖动条：label + 数值（px）+ range（动画/量程映射见 AnimatedRange）。 */
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
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-medium text-surface-600">{label}</span>
        <span className="text-[12px] font-mono text-surface-500">{value}px</span>
      </div>
      <AnimatedRange value={value} min={min} max={max} onChange={onChange} className="w-full margin-range-slider" />
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
  const t = useT()
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

  // 字体下拉选项随语言动态构建（模块级常量无法取 t）。
  const fontOptions = useMemo(() => buildFontOptions(t), [t])

  // 拖拽左缘调宽：向右拖动加宽，向左收窄；实时写入 store（setStylePanelWidth 内部限制范围）。
  // 用 Pointer Events + 指针捕获：拖拽中鼠标滑入预览 iframe 时事件不丢失，
  // 松开必定触发 pointerup；再以 buttons 检查兜底窗口外松开的极端情况，避免监听残留。
  const startResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      setDragging(true)
      const startX = e.clientX
      const startWidth = useEditorStore.getState().stylePanelWidth
      const onMove = (ev: PointerEvent) => {
        if (ev.buttons === 0) {
          onUp()
          return
        }
        // 面板锚定在右侧：抓住左缘往左拖（dx<0）应加宽，往右拖应收窄，故用「减」。
        setStylePanelWidth(startWidth - (ev.clientX - startX))
      }
      const onUp = () => {
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
        document.removeEventListener('pointercancel', onUp)
        setDragging(false)
      }
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
      document.addEventListener('pointercancel', onUp)
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
          className="absolute left-0 top-0 bottom-0 w-1 bg-surface-200 hover:bg-primary-400 cursor-col-resize transition-colors touch-none"
          onPointerDown={startResize}
          title={t('resizeHandleTitle')}
        />

        {/* 滚动容器右缘留 4px（mr-1）：滚动条整体离开面板右缘，避免阻碍窗口大小调节。
            与简历预览页 PreviewPanel 的滚动容器同一方案。 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3 mr-1">
          <div className="text-xs font-semibold text-surface-700 px-1 pt-0.5">{t('layoutStyle')}</div>

          <PanelCard title={t('pageMargin')} icon={<ChevronsLeftRight className="w-3 h-3" />} summary={`${marginY}×${marginX}px`}>
            <SliderRow
              label={t('marginVertical')}
              value={marginY}
              min={MARGIN_PX_MIN}
              max={MARGIN_PX_MAX}
              onChange={(v) => setMargins({ pageMarginY: v })}
            />
            <SliderRow
              label={t('marginHorizontal')}
              value={marginX}
              min={MARGIN_PX_MIN}
              max={MARGIN_PX_MAX}
              onChange={(v) => setMargins({ pageMarginX: v })}
            />
            <p className="text-[10px] text-surface-400 mt-2 leading-relaxed">{t('pageMarginHint')}</p>
          </PanelCard>

          <PanelCard
            title={t('contentSpacing')}
            icon={<Rows3 className="w-3 h-3" />}
            summary={`${spacingSection}·${spacingItem}·${spacingDetail}px`}
          >
            <SliderRow
              label={t('spacingSection')}
              value={spacingSection}
              min={SPACING_PX_MIN}
              max={SPACING_PX_MAX}
              onChange={(v) => updateCustomCss({ spacingSection: v })}
            />
            <SliderRow
              label={t('spacingItem')}
              value={spacingItem}
              min={SPACING_PX_MIN}
              max={SPACING_PX_MAX}
              onChange={(v) => updateCustomCss({ spacingItem: v })}
            />
            <SliderRow
              label={t('spacingDetail')}
              value={spacingDetail}
              min={SPACING_PX_MIN}
              max={DETIAL_SPACING_PX_MAX}
              onChange={(v) => updateCustomCss({ spacingDetail: v })}
            />
            <p className="text-[10px] text-surface-400 mt-2 leading-relaxed">
              {t('contentSpacingHint')}
            </p>
          </PanelCard>

          <PanelCard
            title={t('fontSection')}
            icon={<Type className="w-3 h-3" />}
            summary={style.fontKey ? (findFontOption(style.fontKey)?.label ?? t('followTemplate')) : t('followTemplate')}
          >
            <CustomSelect
              value={style.fontKey ?? ''}
              onChange={(v) => updateCustomCss({ fontKey: v ? v : null })}
              options={fontOptions}
              placeholder={t('followTemplate')}
            />
            <p className="text-[10px] text-surface-400 mt-2 leading-relaxed">
              {t('fontHint')}
            </p>
          </PanelCard>

          <PanelCard title={t('fontSizeSection')} icon={<Type className="w-3 h-3" />}>
            <FontSizeRow
              label={t('fontSizeName')}
              value={style.fontSizeName}
              options={NAME_SIZE_OPTIONS}
              onChange={(v) => updateCustomCss({ fontSizeName: v })}
            />
            <FontSizeRow
              label={t('fontSizeTitle')}
              value={style.fontSizeTitle}
              options={TITLE_SIZE_OPTIONS}
              onChange={(v) => updateCustomCss({ fontSizeTitle: v })}
            />
            <FontSizeRow
              label={t('fontSizeBody')}
              value={style.fontSizeBody}
              options={BODY_SIZE_OPTIONS}
              onChange={(v) => updateCustomCss({ fontSizeBody: v })}
            />
            <FontSizeRow
              label={t('fontSizeDetail')}
              value={style.fontSizeDetail}
              options={DETAIL_SIZE_OPTIONS}
              onChange={(v) => updateCustomCss({ fontSizeDetail: v })}
            />
            <p className="text-[10px] text-surface-400 mt-2 leading-relaxed">
              {t('fontSizeHint')}
            </p>
          </PanelCard>

          <div className="flex items-center justify-between px-1 pt-1">
            <span className="text-[10px] text-surface-400 flex items-center gap-1.5">
              <AlignVerticalJustifyStart className="w-3 h-3" />
              {t('resizePanelHint').replace('{min}', String(STYLE_PANEL_MIN_WIDTH)).replace('{max}', String(STYLE_PANEL_MAX_WIDTH))}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
