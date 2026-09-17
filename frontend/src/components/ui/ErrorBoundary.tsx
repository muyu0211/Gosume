import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'
import { useT } from '../../lib/i18n'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * 路由级错误边界。
 *
 * React 18 下渲染期 / 生命周期里抛出的未捕获异常会卸载整棵根组件树，
 * #root 变空 → 整个窗口白屏，用户完全无法操作。这里兜住子树异常，
 * 降级成可恢复的提示界面（重试 / 返回首页），保证「出错也不白屏」。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] render error:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <ErrorFallback
          message={this.state.error.message}
          onRetry={() => this.setState({ error: null })}
        />
      )
    }
    return this.props.children
  }
}

function ErrorFallback({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useT()

  const goHome = () => {
    location.hash = '#/'
    onRetry()
  }

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="glass-plate max-w-md w-full p-6 flex flex-col items-center text-center">
        <div className="size-ctl-xl rounded-xl bg-danger-50 flex items-center justify-center mb-3">
          <AlertTriangle className="size-icon-lg text-danger-500" />
        </div>
        <h2 className="text-base font-semibold text-surface-800">{t('errorBoundaryTitle')}</h2>
        <p className="text-xs text-surface-400 mt-1.5">{t('errorBoundaryDesc')}</p>
        {message && (
          <p className="mt-3 w-full px-3 py-2 rounded-lg bg-surface-600/[0.06] text-[11px] text-surface-500 break-all text-left">
            {message}
          </p>
        )}
        <div className="flex items-center gap-2 mt-5">
          <button onClick={onRetry} className="btn-primary btn-sm h-ctl-lg">
            <RotateCcw className="size-icon-md shrink-0" />
            <span className="truncate">{t('errorBoundaryRetry')}</span>
          </button>
          <button onClick={goHome} className="btn-secondary btn-sm h-ctl-lg">
            <Home className="size-icon-md shrink-0" />
            <span className="truncate">{t('errorBoundaryHome')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
