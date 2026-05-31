export type ExportFormat = 'pdf' | 'docx' | 'png'

export interface ExportOptions {
  format: ExportFormat
  scale: number
  page_range: string
}

export const FORMAT_LABELS: Record<ExportFormat, string> = {
  pdf: 'PDF 文档',
  docx: 'Word 文档',
  png: 'PNG 图片',
}

export const FORMAT_ICONS: Record<ExportFormat, string> = {
  pdf: 'FileText',
  docx: 'FileEdit',
  png: 'Image',
}
