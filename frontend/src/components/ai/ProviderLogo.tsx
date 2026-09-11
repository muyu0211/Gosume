import { Server } from 'lucide-react'
import deepseekRaw from '../../assets/providers/deepseek.svg?raw'
import kimiRaw from '../../assets/providers/kimi.svg?raw'
import qwenRaw from '../../assets/providers/qwen.svg?raw'
import zhipuRaw from '../../assets/providers/zhipu.svg?raw'
import openaiRaw from '../../assets/providers/openai.svg?raw'
import geminiRaw from '../../assets/providers/gemini.svg?raw'
import doubaoRaw from '../../assets/providers/doubao.svg?raw'
import hunyuanRaw from '../../assets/providers/hunyuan.svg?raw'

/** 厂商官方 logo 的 SVG 源码（?raw 内联，规避独立 svg 文件 XML 解析对空 xmlns 不兼容的问题）。 */
const RAW: Record<string, string> = {
  deepseek: deepseekRaw,
  kimi: kimiRaw,
  qwen: qwenRaw,
  zhipu: zhipuRaw,
  openai: openaiRaw,
  gemini: geminiRaw,
  doubao: doubaoRaw,
  hunyuan: hunyuanRaw,
}

interface ProviderLogoProps {
  /** provider 标识（openai/deepseek/qwen/kimi/zhipu/custom/其他）。 */
  provider: string
  /** 徽章尺寸（px），默认 24。 */
  size?: number
  /** 追加类名（如圆角、mr 对齐）。 */
  className?: string
}

/** 配置 logo：已知厂商内联官方品牌 SVG，未知 / 自定义显示通用图标。 */
export function ProviderLogo({ provider, size = 24, className = '' }: ProviderLogoProps) {
  const raw = RAW[provider]
  if (!raw) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded bg-surface-100 text-primary-500 shrink-0 ${className}`}
        style={{ width: size, height: size }}
      >
        <Server style={{ width: size * 0.6, height: size * 0.6 }} />
      </span>
    )
  }
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 [&>svg]:w-full [&>svg]:h-full [&>svg]:block ${className}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: raw }}
    />
  )
}