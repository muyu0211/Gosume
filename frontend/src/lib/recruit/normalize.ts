/**
 * 公司名归一化（去重与分组的唯一依据）。
 *
 * 规则与后端 Go 侧**必须保持一致**，否则前端分组会与后端去重指纹对不上：
 *   1. 全角空格/普通空格去除
 *   2. 去掉「（中国）」「(北京)」等地域后缀与公司后缀词
 *   3. 英文统一小写
 */
const SUFFIXES = [
  '股份有限公司',
  '有限责任公司',
  '有限公司',
  '集团公司',
  '集团',
  '科技',
  '技术',
  '网络',
  '信息',
]

/** 归一化公司名。 */
export function normalizeCompany(raw: string): string {
  if (!raw) return ''
  let s = raw
    .replace(/[\s\u3000]+/g, '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .toLowerCase()
  for (const suf of SUFFIXES) {
    if (s.length > suf.length && s.endsWith(suf)) {
      s = s.slice(0, -suf.length)
      break
    }
  }
  return s
}
