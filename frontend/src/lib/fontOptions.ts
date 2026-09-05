/**
 * 可选简历字体清单（商用安全）。
 *
 * - system：系统自带字体。用其渲染/导出个人文档（简历 PDF 内嵌子集）属正常使用，
 *   许可证限制的是「再分发字体文件本身」，不影响文档产出。字体未安装时回退到栈中后续字体。
 * - ofl：开源免费字体（SIL OFL / Apache 2.0 等），可商用、可嵌入、可再分发；
 *   需系统已安装，未安装时回退到栈内系统字体。
 *
 * 每个选项给出完整 font-family 栈：首字体为用户选择，其余为降级回退。
 * 渲染与导出（rod 无头浏览器）共用本机系统字体，无需随简历打包字体文件。
 */
export interface FontOption {
  key: string
  label: string
  /** CSS font-family 栈。 */
  stack: string
  category: 'system' | 'ofl'
}

export const FONT_OPTIONS: FontOption[] = [
  // ── 系统内置 ──────────────────────────────────────────────
  {
    key: 'yahei',
    label: '微软雅黑',
    category: 'system',
    stack: '"Microsoft YaHei", "微软雅黑", "PingFang SC", sans-serif',
  },
  {
    key: 'simsun',
    label: '宋体',
    category: 'system',
    stack: '"SimSun", "宋体", "Noto Serif SC", serif',
  },
  {
    key: 'simhei',
    label: '黑体',
    category: 'system',
    stack: '"SimHei", "黑体", "Noto Sans SC", sans-serif',
  },
  {
    key: 'kaiti',
    label: '楷体',
    category: 'system',
    stack: '"KaiTi", "楷体", "STKaiti", "LXGW WenKai", serif',
  },
  {
    key: 'fangsong',
    label: '仿宋',
    category: 'system',
    stack: '"FangSong", "仿宋", "STFangsong", serif',
  },
  {
    key: 'dengxian',
    label: '等线',
    category: 'system',
    stack: '"DengXian", "等线", "Microsoft YaHei", sans-serif',
  },
  {
    key: 'pingfang',
    label: '苹方',
    category: 'system',
    stack: '"PingFang SC", "苹方", "Microsoft YaHei", sans-serif',
  },
  {
    key: 'arial',
    label: 'Arial',
    category: 'system',
    stack: 'Arial, "Helvetica Neue", "Microsoft YaHei", sans-serif',
  },
  {
    key: 'times',
    label: 'Times New Roman',
    category: 'system',
    stack: '"Times New Roman", Times, "SimSun", serif',
  },
  {
    key: 'georgia',
    label: 'Georgia',
    category: 'system',
    stack: 'Georgia, "Times New Roman", serif',
  },
  // ── 开源免费可商用 ─────────────────────────────────────────
  {
    key: 'noto-sans-sc',
    label: '思源黑体',
    category: 'ofl',
    stack: '"Noto Sans SC", "Source Han Sans SC", "思源黑体", "Microsoft YaHei", sans-serif',
  },
  {
    key: 'noto-serif-sc',
    label: '思源宋体',
    category: 'ofl',
    stack: '"Noto Serif SC", "Source Han Serif SC", "思源宋体", "SimSun", serif',
  },
  {
    key: 'lxgw-wenkai',
    label: '霞鹜文楷',
    category: 'ofl',
    stack: '"LXGW WenKai", "霞鹜文楷", "KaiTi", serif',
  },
  {
    key: 'alibaba-puhuiti',
    label: '阿里巴巴普惠体',
    category: 'ofl',
    stack: '"Alibaba PuHuiTi", "阿里巴巴普惠体", "Microsoft YaHei", sans-serif',
  },
  {
    key: 'smiley-sans',
    label: '得意黑',
    category: 'ofl',
    stack: '"Smiley Sans", "得意黑", sans-serif',
  },
  {
    key: 'inter',
    label: 'Inter',
    category: 'ofl',
    stack: 'Inter, "Helvetica Neue", Arial, sans-serif',
  },
  {
    key: 'roboto',
    label: 'Roboto',
    category: 'ofl',
    stack: 'Roboto, "Helvetica Neue", Arial, sans-serif',
  },
]

/** 按 key 查找字体选项。 */
export function findFontOption(key: string | null | undefined): FontOption | undefined {
  return FONT_OPTIONS.find((o) => o.key === key)
}
