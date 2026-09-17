import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useT } from '../../lib/i18n'

interface Props {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

/**
 * 通用分页器（首页简历网格与模板网格共用）。
 * 从 `routes/WelcomePage` 提取，外观与交互保持不变。
 */
export function Pagination({ currentPage, totalPages, onPageChange }: Props) {
  const t = useT()
  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="size-ctl-md rounded-lg flex items-center justify-center text-surface-400 hover:text-surface-600 hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label={t('prevPage')}
      >
        <ChevronLeft className="size-icon-md" />
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
        <button
          key={page}
          onClick={() => onPageChange(page)}
          className={`size-ctl-md rounded-full text-sm font-medium transition-colors ${page === currentPage
            ? 'bg-primary-600 text-white shadow-sm'
            : 'text-surface-500 hover:text-surface-700 hover:bg-surface-100'
            }`}
        >
          {page}
        </button>
      ))}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="size-ctl-md rounded-lg flex items-center justify-center text-surface-400 hover:text-surface-600 hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label={t('nextPage')}
      >
        <ChevronRight className="size-icon-md" />
      </button>
    </div>
  )
}
