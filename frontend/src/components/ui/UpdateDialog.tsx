import { useEffect, useRef, useState } from 'react'
import { Events } from '@wailsio/runtime'
import { AlertCircle, ArrowRight, ArrowUpCircle, CheckCircle2, Download, RotateCw } from 'lucide-react'
import { Modal, type ModalHandle } from './Modal'
import { callService, isWails } from '../../services/backend'
import { useResumeStore } from '../../stores/resumeStore'
import { extractErrorMessage } from '../../lib/errorUtils'

/**
 * 检查更新返回的版本信息（与后端 UpdateInfo 对齐，见《在线更新开发方案》§5/§6.3）。
 */
export interface UpdateInfo {
  /** 是否存在新版本 */
  has_update: boolean
  /** 当前版本号 */
  current_version?: string
  /** 最新版本号 */
  latest_version?: string
  /** 对应最新版本的更新包已下载就绪，可直接安装（复用之前下载未安装的包） */
  update_ready?: boolean
  /** 发布日期（如 2026-09-01） */
  release_date?: string
  /** 更新说明（\n 分隔的多行文本） */
  release_notes?: string
  /** 更新包下载地址 */
  download_url?: string
  /** 更新包 SHA-256 */
  sha256?: string
  /** 更新包形态（nsis-installer / app-zip / appimage，替换阶段按此分派） */
  artifact_type?: string
  /** 更新时的提示（区别于ReleaseNotes） */
  tips?: string
}

/** 对话框阶段状态机：available → downloading → ready（失败 → error 可重试）。 */
type Stage = 'available' | 'downloading' | 'ready' | 'error'

interface UpdateDialogProps {
  /** 检查更新返回的版本信息（has_update 为 true 时才应渲染本组件）。 */
  info: UpdateInfo
  /** 退场动画结束后的关闭回调（由父组件卸载本组件）。 */
  onClose: () => void
}

/**
 * 在线更新对话框（在线更新 P1）。
 *
 * 检查到新版本时弹出，内部完成整个更新流程：
 * 1. available：版本对比 + 更新日志，「立即下载」；
 * 2. downloading：进度条（监听 update:progress 事件），「取消」；
 * 3. ready：「安装并重启」——调 ApplyUpdate 启动 Helper 后触发窗口关闭，
 *    走既有未保存确认流程退出，Helper 接管完成静默替换并重启新版本；
 * 4. error：错误信息 + 「重试下载」。
 */
export function UpdateDialog({ info, onClose }: UpdateDialogProps) {
  const modalRef = useRef<ModalHandle>(null)
  const [stage, setStage] = useState<Stage>(info.update_ready ? 'ready' : 'available')
  const [progress, setProgress] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [applying, setApplying] = useState(false)

  // 更新说明按行拆分为列表（appcast 的 notes 以 \n 分隔）
  const notes = (info.tips ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  // 动态内容区：各 stage 的内容并排叠放为 grid 行，active 行展开为 1fr、
  // 其余折叠为 0fr，从而让卡片高度随 stage 切换平滑过渡（200ms，与设置页
  // 关于组件的展开/收起动画一致）。节点始终挂载，仅行高控制可见性，否则
  // 卸载瞬间会跳过过渡。
  const rows: { key: string; show: boolean; node: React.ReactNode }[] = [
    {
      key: 'notes',
      show: notes.length > 0,
      node: (
        <div>
          <p className="text-xs font-medium text-surface-500 mb-1.5">更新内容</p>
          <ul className="space-y-1">
            {notes.map((line, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-surface-600">
                <span className="w-1 h-1 rounded-full bg-surface-300 mt-[7px] shrink-0" />
                <span className="min-w-0">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      ),
    },
    {
      key: 'progress',
      show: stage === 'downloading',
      node: (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-surface-500">
            <span>正在下载更新包…</span>
            <span className="font-mono">{formatProgress(progress)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary-500 transition-all duration-200"
              style={{ width: `${progressPercent(progress)}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'ready',
      show: stage === 'ready',
      node: (
        <div className="flex items-center gap-2 text-sm text-surface-600">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          更新包已就绪，重启后自动完成安装。
        </div>
      ),
    },
    {
      key: 'safety',
      // 数据安全提示全阶段常驻，不随 stage 切换折叠
      show: true,
      node: <p className="text-xs text-surface-400">更新不会影响你的简历、模板与设置数据。</p>,
    },
    {
      key: 'error',
      // 错误提示置于内容最下方，避免在更新说明中间突兀出现
      show: stage === 'error',
      node: (
        <div className="flex items-start gap-2 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="min-w-0">{errorMsg}</span>
        </div>
      ),
    },
  ]

  // 订阅后端下载进度（与 ResumeListDrawer 监听 export:progress 同款写法）。
  // 载荷契约：Content-Length 已知时为 0-100 百分比，未知时为已下载字节数。
  useEffect(() => {
    if (!isWails()) return
    const off = Events.On('update:progress', (ev) => {
      const p = typeof ev.data === 'number' ? ev.data : Number(ev.data)
      if (Number.isFinite(p)) setProgress(p)
    })
    return off
  }, [])

  // 订阅后台下载完成/失败事件：后端在独立 goroutine 下载，本对话框可能已
  // 关闭/重开，统一由该事件把 stage 收敛到 ready 或 error（而不是依赖
  // DownloadUpdate 的同步返回）。
  useEffect(() => {
    if (!isWails()) return
    const off = Events.On('update:result', (ev) => {
      const s = String(ev.data)
      if (s === 'ok') {
        setProgress(100)
        setStage('ready')
      } else {
        setErrorMsg(s.startsWith('error:') ? s.slice('error:'.length) : s)
        setStage('error')
      }
    })
    return off
  }, [])

  // 挂载时查询后端是否有进行中的下载任务：用户关闭对话框（X）后下载不会停止，
  // 从其它入口再次打开本对话框时，据此续显“下载中 + 当前进度”，而非回到 available。
  // 后端返回 -1 表示空闲；0~100 为下载中进度（0 表示刚开始下载）。
  useEffect(() => {
    if (!isWails()) return
    callService<number>('UpdateService', 'GetDownloadProgress')
      .then((p) => {
        if (typeof p === 'number' && p >= 0) {
          setStage('downloading')
          setProgress(p)
        }
      })
      .catch(() => { /* 查询失败保持默认阶段 */ })
  }, [])

  const handleClose = () => modalRef.current?.close()

  /** 立即下载 / 重试下载。 */
  const handleDownload = async () => {
    if (!info.download_url || !info.sha256) {
      setStage('error')
      setErrorMsg('更新信息不完整，请重新检查更新')
      return
    }
    setStage('downloading')
    setProgress(0)
    setErrorMsg('')
    try {
      // 后端为异步后台下载：方法立即返回（同步校验失败才在此报错），
      // 完成/失败改由 update:result 事件驱动，切页/关窗都不中断下载。
      await callService('UpdateService', 'DownloadUpdate', info.download_url, info.sha256)
    } catch (err) {
      setStage('error')
      setErrorMsg(extractErrorMessage(err, '下载更新包失败，请稍后重试'))
    }
  }

  /** 下载中取消。 */
  const handleCancelDownload = () => {
    callService('UpdateService', 'CancelUpdate').catch(() => { /* 忽略 */ })
    modalRef.current?.close()
  }

  /** 安装并重启：启动 Helper → 未保存二确 → QuitApp 终止进程 → Helper 替换并重启。 */
  const handleInstall = async () => {
    setApplying(true)
    try {
      await callService('UpdateService', 'ApplyUpdate')
      // 复用既有未保存守卫：有改动先弹二确，确认（保存/不保存）后调 QuitApp。
      // 不依赖 CloseWindow 的「关窗口→进程退出」翻译（macOS 下已禁用该行为，
      // Windows 下也要走异步事件往返），QuitApp 直接终止进程，Helper 才能
      // 等到主进程退出后接管替换并重启。
      useResumeStore.getState().requestLeave(() => {
        callService('SystemService', 'QuitApp').catch(() => { /* 忽略 */ })
      })
      // 用户取消未保存确认时应用继续运行；关闭本对话框，可稍后从设置页重新触发。
      modalRef.current?.close()
    } catch (err) {
      setApplying(false)
      setErrorMsg(extractErrorMessage(err, '启动更新失败'))
      setStage('error')
    }
  }

  return (
    <Modal
      ref={modalRef}
      onClose={onClose}
      width="w-[480px]"
      cardClassName="flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-6 py-3 border-b border-surface-100 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
          <ArrowUpCircle className="w-4 h-4 text-primary-600" />
        </div>
        <h2 className="text-base font-semibold text-surface-800">发现新版本</h2>
      </div>

      {/* Body */}
      <div className="px-6 py-4">
        {/* 版本对比 + 发布日期（固定块，不参与折叠） */}
        <div className="flex items-center gap-2 flex-wrap pb-4">
          <span className="px-2 py-0.5 rounded-md bg-surface-100 text-surface-500 font-mono text-sm">
            v{info.current_version ?? '—'}
          </span>
          <ArrowRight className="w-4 h-4 text-surface-400" />
          <span className="px-2 py-0.5 rounded-md bg-primary-50 text-primary-700 font-mono text-sm font-medium">
            v{info.latest_version ?? ''}
          </span>
          {info.release_date && (
            <span className="text-xs text-surface-400">{info.release_date}</span>
          )}
        </div>

        {/* 动态内容区：grid 行 0fr↔1fr + 淡入淡出，stage 切换高度平滑过渡 */}
        <div
          className="grid transition-all duration-200 ease-out"
          style={{ gridTemplateRows: rows.map((r) => (r.show ? '1fr' : '0fr')).join(' ') }}
        >
          {rows.map((r) => (
            <div key={r.key} className="overflow-hidden" aria-hidden={!r.show}>
              <div className={r.show ? 'pt-4 opacity-100' : 'pt-4 opacity-0'}>{r.node}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer：按阶段切换按钮 */}
      <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-surface-100 flex-shrink-0">
        {stage === 'available' && (
          <>
            <button onClick={handleClose} className="btn-secondary btn-sm">
              稍后提醒
            </button>
            <button onClick={handleDownload} className="btn-primary btn-sm inline-flex items-center gap-1.5">
              <Download className="w-4 h-4" /> 立即下载
            </button>
          </>
        )}
        {stage === 'downloading' && (
          <button onClick={handleCancelDownload} className="btn-secondary btn-sm">
            取消
          </button>
        )}
        {stage === 'ready' && (
          <>
            <button onClick={handleClose} className="btn-secondary btn-sm">
              稍后安装
            </button>
            <button
              onClick={handleInstall}
              disabled={applying}
              className="btn-primary btn-sm inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              <Download className="w-4 h-4" /> {applying ? '正在准备…' : '重启并安装'}
            </button>
          </>
        )}
        {stage === 'error' && (
          <>
            <button onClick={handleClose} className="btn-secondary btn-sm">
              关闭
            </button>
            <button onClick={handleDownload} className="btn-primary btn-sm inline-flex items-center gap-1.5">
              <RotateCw className="w-4 h-4" /> 重试下载
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}

/**
 * 进度值展示：百分比模式（0-100）显示 xx%；字节数模式（>100）显示已下载 MB。
 */
function formatProgress(progress: number | null): string {
  if (progress === null) return '0%'
  if (progress <= 100) return `${Math.round(progress)}%`
  return `${(progress / 1024 / 1024).toFixed(1)} MB`
}

/** 进度条宽度：百分比模式直接取值，字节数模式按 50MB 估算封顶。 */
function progressPercent(progress: number | null): number {
  if (progress === null) return 0
  if (progress <= 100) return Math.max(0, Math.min(100, progress))
  return Math.min(100, (progress / (50 * 1024 * 1024)) * 100)
}
