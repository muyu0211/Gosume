import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../../lib/i18n'
import { Modal, type ModalHandle } from '../ui/Modal'
import { CustomSelect } from '../ui/CustomSelect'
import { Combobox } from '../ui/Combobox'
import { LiquidSegmented } from '../ui/LiquidSegmented'
import { DateTimePicker } from '../ui/DateTimePicker'
import { Checkbox } from '../ui/Checkbox'
import { useRecruitStore } from '../../stores/recruitStore'
import { optionsOf, STAGE_LIST, STAGE_KEYS } from '../../lib/recruit/options'
import { composeRFC3339, toDateInput, toTimeInput } from '../../lib/recruit/time'
import { normalizeCompany } from '../../lib/recruit/normalize'
import { companyOptions } from '../../lib/recruit/stats'
import type {
  DuplicateCandidate,
  JobKind,
  JobProcess,
  JobProcessDraft,
  JobSource,
  JobStage,
  ParseResult,
} from '../../types/recruit'

interface Props {
  onClose: () => void
  /** 传入即编辑模式，否则为新建 */
  initial?: JobProcess
  /** 命中去重指纹时交给父级弹「更新 / 新建 / 取消」 */
  onDuplicate?: (draft: JobProcessDraft, candidate: DuplicateCandidate) => void
}

type EntryTab = 'manual' | 'paste'

/** 表单内部状态：时间拆成 date/time 两个字符串，保存前再合成 RFC3339。
 *  类型不再单独存状态：`stage === 'apply'` 即投递，其余环节均为通知（保存时派生）。 */
interface FormState {
  company: string
  position: string
  stage: JobStage
  round_no: number
  eventDate: string
  eventTime: string
  deadlineDate: string
  deadlineTime: string
  all_day: boolean
  link: string
  location: string
  online: boolean
  source: JobSource
  note: string
  parent_id: string | null
}

function emptyForm(): FormState {
  return {
    company: '',
    position: '',
    stage: 'interview',
    round_no: 0,
    eventDate: '',
    eventTime: '',
    deadlineDate: '',
    deadlineTime: '',
    all_day: false,
    link: '',
    location: '',
    online: false,
    source: 'manual',
    note: '',
    parent_id: null,
  }
}

function formOf(job: JobProcess): FormState {
  return {
    company: job.company,
    position: job.position,
    stage: job.stage,
    round_no: job.round_no,
    eventDate: toDateInput(job.event_time),
    eventTime: toTimeInput(job.event_time),
    deadlineDate: toDateInput(job.deadline),
    deadlineTime: toTimeInput(job.deadline),
    all_day: job.all_day,
    link: job.link,
    location: job.location,
    online: job.online,
    source: job.source,
    note: job.note,
    parent_id: job.parent_id,
  }
}

/**
 * 录入 / 编辑弹层。
 *
 * - 手动页签：完整字段；公司为必填（空则保存按钮禁用）。
 * - 粘贴页签：防抖 300ms 调后端 `Parse`，结果回填表单；**低置信度字段只标黄提示，
 *   不自动改用户已填的值**。
 * - 保存若命中去重指纹，后端返回 `duplicate`，这里把「更新/新建/取消」交给父级处理。
 *
 * 控件一律走项目已封装的 UI 组件，不用原生控件：
 * `CustomSelect`（下拉）/ `DateTimePicker`（日期+时刻）/ `Checkbox`（全天、线上）。
 * 原生 `<input type="date|time">` 在各内核下外观不一致、无法与玻璃风统一；
 * 原生 `checkbox` 的方框/勾形/聚焦环同样不统一，故统一替换。
 */
export function JobEntryDialog({ onClose, initial, onDuplicate }: Props) {
  const t = useT()
  const modalRef = useRef<ModalHandle>(null)
  const create = useRecruitStore((s) => s.create)
  const update = useRecruitStore((s) => s.update)
  const parse = useRecruitStore((s) => s.parse)
  const jobs = useRecruitStore((s) => s.jobs)
  const settings = useRecruitStore((s) => s.settings)

  const [tab, setTab] = useState<EntryTab>('manual')
  const [form, setForm] = useState<FormState>(() => (initial ? formOf(initial) : emptyForm()))
  const [raw, setRaw] = useState('')
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }))

  // 类型由环节值派生（合并控件）：环节选「投递」即投递记录，其余环节均为通知。
  // 存储契约层的 kind 字段保持不变，仅表单内部不再单独维护状态。
  const kind: JobKind = form.stage === 'apply' ? 'apply' : 'notice'

  // 公司组合输入候选：已有记录的公司（companyOptions 按 norm 去重 + 排序，展示名唯一）。
  // 无记录时为空数组 → 面板不展开，纯手动输入，不报错。
  const companyList = useMemo(
    () => companyOptions(jobs).map((c) => ({ value: c.name, label: c.name })),
    [jobs],
  )

  // 关联投递候选项：同公司归一化名下的 apply 记录
  const parentOptions = useMemo(() => {
    const norm = normalizeCompany(form.company)
    const list = jobs.filter((j) => j.stage === 'apply' && (!norm || j.company_norm === norm))
    return [
      { value: '', label: t('parentNone') },
      ...list.map((j) => ({
        value: j.id,
        label: `${j.company}${j.position ? ` · ${j.position}` : ''}`,
      })),
    ]
  }, [jobs, form.company, t])

  // 关联投递自动预选（仅新建模式）：同公司 apply 唯一 → 自动选中；多个 → 取时间最新的。
  // 用户手动改过关联后（parentTouched）不再自动覆盖；编辑模式保持既有数据不动。
  const parentTouched = useRef(false)
  useEffect(() => {
    if (initial || form.stage === 'apply' || form.parent_id || parentTouched.current) return
    const norm = normalizeCompany(form.company)
    if (!norm) return
    const candidates = jobs.filter((j) => j.stage === 'apply' && j.company_norm === norm)
    if (candidates.length === 0) return
    const pick =
      candidates.length === 1
        ? candidates[0]
        : [...candidates].sort((a, b) =>
            (b.event_time ?? b.deadline ?? '').localeCompare(a.event_time ?? a.deadline ?? ''),
          )[0]
    patch({ parent_id: pick.id })
  }, [initial, form.stage, form.company, form.parent_id, jobs])

  // 粘贴解析：防抖 300ms（后端解析本身很快，防抖只为避免逐字符请求）
  useEffect(() => {
    if (tab !== 'paste') return
    const text = raw.trim()
    if (!text) {
      setParsed(null)
      return
    }
    const id = window.setTimeout(() => {
      parse(text, new Date().toISOString())
        .then((res) => setParsed(res))
        .catch(() => setParsed(null))
    }, 300)
    return () => window.clearTimeout(id)
  }, [raw, tab, parse])

  // 解析结果回填：只填**当前为空**的字段，且不覆盖用户手改过的值
  useEffect(() => {
    if (!parsed) return
    const f = parsed.fields
    setForm((prev) => {
      const next = { ...prev }
      if (f.company && !next.company) next.company = f.company
      if (f.position && !next.position) next.position = f.position
      if (f.stage && !next.stage) next.stage = f.stage
      if (typeof f.round_no === 'number' && !next.round_no) next.round_no = f.round_no
      if (f.event_time) {
        if (!next.eventDate) {
          next.eventDate = toDateInput(f.event_time)
          next.eventTime = toTimeInput(f.event_time)
        }
      }
      if (f.deadline && !next.deadlineDate) {
        next.deadlineDate = toDateInput(f.deadline)
        next.deadlineTime = toTimeInput(f.deadline)
      }
      if (f.link && !next.link) next.link = f.link
      if (f.location && !next.location) next.location = f.location
      if (f.source && next.source === 'manual') next.source = f.source
      if (typeof f.online === 'boolean') next.online = f.online
      return next
    })
  }, [parsed])

  /** 低置信度字段：标签右侧挂「请确认」chip + 输入描边转 warning。 */
  const lowConfidence = (field: keyof ParseResult['confidence']): boolean => {
    const c = parsed?.confidence?.[field]
    return !!c && (c === 'low' || c === 'unknown')
  }

  /**
   * 输入控件样式：与 `CustomSelect` 触发器同语言（`bg-elev` + 细描边 + 圆角），
   * 保证同一行里原生输入与自绘下拉看起来是一套东西。
   * 低置信度字段描边转 warning，只提示不阻断。
   *
   * 圆角对齐项目既有规范（globals.css）：
   *  · 单行输入 → `rounded-full` 胶囊，同 `.form-input`（= h/2）；
   *  · 多行文本域 → `rounded-glass-card`(18px)，同 `.form-textarea`。
   * 两者都**写在基类上、不带状态前缀**，所以 hover / focus / disabled / 低置信度
   * 描边变色时圆角恒定，不会变形或丢角。
   */
  const inputClass = (field: keyof ParseResult['confidence']) =>
    `w-full min-w-0 h-ctl-lg px-3 rounded-full bg-elev text-sm text-surface-800 placeholder:text-surface-400 border transition-colors duration-fast focus:outline-none focus:border-primary-500 focus:shadow-focus ${
      lowConfidence(field) ? 'border-warning-500' : 'border-hairline border-surface-200 hover:border-surface-300'
    }`

  /**
   * 多行文本域样式：在 `inputClass` 基础上换成文本域圆角 + 解除固定高度。
   * `!h-auto` 覆盖 `h-ctl-lg`（否则会被压成单行高度）。
   */
  const textareaClass = (field: keyof ParseResult['confidence']) =>
    `${inputClass(field)} !h-auto rounded-glass-card py-2 resize-none`

  const canSave = form.company.trim().length > 0 && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError('')
    const draft: JobProcessDraft = {
      company: form.company.trim(),
      company_norm: normalizeCompany(form.company),
      position: form.position.trim(),
      stage: form.stage,
      round_no: kind === 'apply' ? 0 : form.round_no,
      event_time: composeRFC3339(form.eventDate, form.eventTime || undefined, form.all_day),
      event_end: null,
      deadline: composeRFC3339(form.deadlineDate, form.deadlineTime || undefined, false),
      all_day: form.all_day,
      time_basis: null,
      link: form.link.trim(),
      location: form.location.trim(),
      online: form.online,
      source: form.source,
      status: initial?.status ?? 'pending',
      note: form.note.trim(),
      // 原文只在开关打开时提交（PRD Q2：默认不保存）
      raw_text: settings.saveRawText ? raw.trim() || null : null,
      confidence: parsed?.confidence ?? {},
      company_id: initial?.company_id ?? null,
      parent_id: kind === 'notice' ? form.parent_id || null : null,
    }
    try {
      if (initial) {
        await update({ ...initial, ...draft })
        modalRef.current?.close()
        return
      }
      const res = await create(draft)
      modalRef.current?.close()
      // 命中指纹：交给父级弹窗，由用户决定更新还是仍然新建
      if (res.duplicate) onDuplicate?.(draft, res.duplicate)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <Modal ref={modalRef} onClose={onClose} width="w-[640px]" cardClassName="flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-3">
        <h2 className="text-base font-semibold text-surface-800">
          {initial ? t('jobEdit') : t('jobAdd')}
        </h2>
        <div className="mt-3">
          <LiquidSegmented<EntryTab>
            value={tab}
            onChange={setTab}
            ariaLabel={t('jobAdd')}
            items={[
              { value: 'manual', label: t('entryTabManual') },
              { value: 'paste', label: t('entryTabPaste') },
            ]}
          />
        </div>
      </div>

      {/* 滚动体挂 gosume-modal-scroll：拉伸过渡中间帧由 useLayoutTransition 统一压住滚动条 */}
      <div className="gosume-modal-scroll flex-1 overflow-auto px-6 pb-2">
        {/*
          ⚠ 粘贴区显隐**不再**用 Expandable 包裹（2026-09-19 解耦）：
          卡片尺寸拉伸已由 Modal 的 useLayoutTransition 统一观察（任何原因的尺寸
          变化都自动播放），业务分支里再包一层会双重动画。原文内容在 `raw` state，
          条件卸载不丢值。
        */}
        {tab === 'paste' && (
          <div className="mb-4">
            <p className="text-xs text-surface-400 mb-2">{t('parsePasteHint')}</p>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={5}
              className={textareaClass('company')}
              placeholder={t('parsePasteHint')}
            />
            {parsed?.warnings.map((w) => (
              <p key={w} className="mt-2 text-xs text-warning-700">
                {t(w)}
              </p>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('fieldCompany')} hint={lowConfidence('company') ? t('parseConfirmHint') : ''}>
            <Combobox
              value={form.company}
              onChange={(v) => patch({ company: v })}
              options={companyList}
              placeholder={t('fieldCompany')}
              inputClassName={inputClass('company')}
              ariaLabel={t('fieldCompany')}
            />
          </Field>

          <Field label={t('fieldPosition')} hint={lowConfidence('position') ? t('parseConfirmHint') : ''}>
            <input
              value={form.position}
              onChange={(e) => patch({ position: e.target.value })}
              className={inputClass('position')}
              placeholder={t('fieldPosition')}
            />
          </Field>

          {/* 环节下拉兼任类型切换（合并控件）：选「投递」= 投递记录，其余环节 = 通知。
              不再锁定 disabled——「改环节 = 改类型」正是合并后的预期语义。 */}
          <Field label={t('fieldStage')}>
            <CustomSelect
              value={form.stage}
              onChange={(v) => patch({ stage: v as JobStage })}
              options={optionsOf(t, STAGE_LIST, STAGE_KEYS)}
            />
          </Field>

          <Field label={t('fieldEventTime')} hint={lowConfidence('event_time') ? t('parseConfirmHint') : ''}>
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex-1 min-w-0">
                <DateTimePicker
                  date={form.eventDate}
                  time={form.eventTime}
                  onDateChange={(v) => patch({ eventDate: v })}
                  onTimeChange={(v) => patch({ eventTime: v })}
                  allDay={form.all_day}
                />
              </div>
              <Checkbox checked={form.all_day} onChange={(v) => patch({ all_day: v })} label={t('allDay')} />
            </div>
          </Field>

          <Field label={t('fieldDeadline')}>
            <DateTimePicker
              date={form.deadlineDate}
              time={form.deadlineTime}
              onDateChange={(v) => patch({ deadlineDate: v })}
              onTimeChange={(v) => patch({ deadlineTime: v })}
            />
          </Field>

          <Field label={t('fieldLink')}>
            <input
              value={form.link}
              onChange={(e) => patch({ link: e.target.value })}
              className={inputClass('link')}
              placeholder="https://"
            />
          </Field>

          <Field label={t('fieldLocation')}>
            <div className="flex items-center gap-2 min-w-0">
              <input
                value={form.location}
                onChange={(e) => patch({ location: e.target.value })}
                className={inputClass('location')}
                placeholder={t('fieldLocation')}
              />
              <Checkbox checked={form.online} onChange={(v) => patch({ online: v })} label={t('online')} />
            </div>
          </Field>

          {kind === 'notice' && (
            <Field label={t('fieldRound')}>
              <input
                type="number"
                min={0}
                max={20}
                value={form.round_no || ''}
                onChange={(e) => patch({ round_no: Number.parseInt(e.target.value, 10) || 0 })}
                className={inputClass('round_no')}
                placeholder="0"
              />
            </Field>
          )}

          {kind === 'notice' && (form.parent_id || parentOptions.length > 1) && (
            <Field label={t('fieldParent')}>
              <CustomSelect
                value={form.parent_id ?? ''}
                onChange={(v) => {
                  parentTouched.current = true
                  patch({ parent_id: v || null })
                }}
                options={parentOptions}
              />
            </Field>
          )}

          <div className="col-span-2">
            <Field label={t('fieldNote')}>
              <textarea
                value={form.note}
                onChange={(e) => patch({ note: e.target.value })}
                rows={2}
                className={textareaClass('company')}
                placeholder={t('fieldNote')}
              />
            </Field>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-danger-600">{error}</p>}
      </div>

      <div className="px-6 py-4 flex items-center justify-end gap-2">
        <button type="button" onClick={() => modalRef.current?.close()} className="btn btn-secondary">
          {t('cancel')}
        </button>
        <button type="button" onClick={handleSave} disabled={!canSave} className="btn btn-primary">
          {t('save')}
        </button>
      </div>
    </Modal>
  )
}

/** 表单行：标签 + 可选「请确认」提示。 */
function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block min-w-0">
      <span className="flex items-center gap-1.5 text-xs text-surface-500 mb-1">
        {label}
        {hint && <span className="text-warning-700">{hint}</span>}
      </span>
      {children}
    </label>
  )
}
