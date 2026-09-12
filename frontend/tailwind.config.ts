import type { Config } from 'tailwindcss'

/**
 * Tailwind 配置 —— 苹果风（Apple HIG）
 * ============================================================================
 * 规范：docs/Gosume苹果风主题/苹果风落地规范.md 第 2.3 / 3 / 4 / 6 节
 *
 * 设计原则：**第一优先手段是改令牌与配置，而不是逐个改类名**。
 * 这里把色板、圆角、阴影、字体族、控件尺寸全部指向 CSS 变量或苹果尺度，
 * 使既有 className（rounded-lg / shadow-sm / h-8 …）自动获得苹果风。
 *
 * 不得覆盖 `spacing`：Tailwind 默认间距已是 4px 基数、与间距阶梯兼容；
 * 覆盖它会把 p-4 之类的既有用法一起改掉。间距纪律靠扫描规则 R009/R010 保证。
 */
export default {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        // ----- 主题色板（既有，键名与 <alpha-value> 写法必须保留）-----
        // 强调色板：由 CSS 变量驱动，随主题（classic/wheat/obsidian）切换。
        primary: {
          50: 'rgb(var(--primary-50) / <alpha-value>)',
          100: 'rgb(var(--primary-100) / <alpha-value>)',
          200: 'rgb(var(--primary-200) / <alpha-value>)',
          300: 'rgb(var(--primary-300) / <alpha-value>)',
          400: 'rgb(var(--primary-400) / <alpha-value>)',
          500: 'rgb(var(--primary-500) / <alpha-value>)',
          600: 'rgb(var(--primary-600) / <alpha-value>)',
          700: 'rgb(var(--primary-700) / <alpha-value>)',
          800: 'rgb(var(--primary-800) / <alpha-value>)',
          900: 'rgb(var(--primary-900) / <alpha-value>)',
        },
        // 中性面/文字色板：由 CSS 变量驱动，随主题切换。
        surface: {
          50: 'rgb(var(--surface-50) / <alpha-value>)',
          100: 'rgb(var(--surface-100) / <alpha-value>)',
          200: 'rgb(var(--surface-200) / <alpha-value>)',
          300: 'rgb(var(--surface-300) / <alpha-value>)',
          400: 'rgb(var(--surface-400) / <alpha-value>)',
          500: 'rgb(var(--surface-500) / <alpha-value>)',
          600: 'rgb(var(--surface-600) / <alpha-value>)',
          700: 'rgb(var(--surface-700) / <alpha-value>)',
          800: 'rgb(var(--surface-800) / <alpha-value>)',
          900: 'rgb(var(--surface-900) / <alpha-value>)',
        },
        // 层级背景（≈ 原 bg-white 用法）：卡片/表单/弹窗等，深色主题下变深。
        elev: 'rgb(var(--elev) / <alpha-value>)',

        // ----- 语义色（苹果风新增）-----
        // 替代 Tailwind 原始色板表达状态：
        //   text-red-500 → text-danger-600    bg-emerald-50 → bg-success-50
        //   text-amber-700 → text-warning-700 bg-blue-50 → bg-info-50
        // 用法分档：图形/填充用 -500，正文文字用 -600，浅底用 -50/-100，描边用 -200。
        danger: {
          50: 'rgb(var(--danger-50) / <alpha-value>)',
          100: 'rgb(var(--danger-100) / <alpha-value>)',
          200: 'rgb(var(--danger-200) / <alpha-value>)',
          300: 'rgb(var(--danger-300) / <alpha-value>)',
          400: 'rgb(var(--danger-400) / <alpha-value>)',
          500: 'rgb(var(--danger-500) / <alpha-value>)',
          600: 'rgb(var(--danger-600) / <alpha-value>)',
          700: 'rgb(var(--danger-700) / <alpha-value>)',
        },
        success: {
          50: 'rgb(var(--success-50) / <alpha-value>)',
          100: 'rgb(var(--success-100) / <alpha-value>)',
          200: 'rgb(var(--success-200) / <alpha-value>)',
          300: 'rgb(var(--success-300) / <alpha-value>)',
          400: 'rgb(var(--success-400) / <alpha-value>)',
          500: 'rgb(var(--success-500) / <alpha-value>)',
          600: 'rgb(var(--success-600) / <alpha-value>)',
          700: 'rgb(var(--success-700) / <alpha-value>)',
        },
        warning: {
          50: 'rgb(var(--warning-50) / <alpha-value>)',
          100: 'rgb(var(--warning-100) / <alpha-value>)',
          200: 'rgb(var(--warning-200) / <alpha-value>)',
          300: 'rgb(var(--warning-300) / <alpha-value>)',
          400: 'rgb(var(--warning-400) / <alpha-value>)',
          500: 'rgb(var(--warning-500) / <alpha-value>)',
          600: 'rgb(var(--warning-600) / <alpha-value>)',
          700: 'rgb(var(--warning-700) / <alpha-value>)',
        },
        info: {
          50: 'rgb(var(--info-50) / <alpha-value>)',
          100: 'rgb(var(--info-100) / <alpha-value>)',
          200: 'rgb(var(--info-200) / <alpha-value>)',
          300: 'rgb(var(--info-300) / <alpha-value>)',
          400: 'rgb(var(--info-400) / <alpha-value>)',
          500: 'rgb(var(--info-500) / <alpha-value>)',
          600: 'rgb(var(--info-600) / <alpha-value>)',
          700: 'rgb(var(--info-700) / <alpha-value>)',
        },
      },

      // ----- 苹果风圆角尺度 -----
      // radius ≈ min(height / 4, 12px)：控件 7/9、卡片 12、模态 16。
      // 覆盖后既有 rounded-md/lg/xl/2xl 自动换成苹果尺度，无需逐文件改类名。
      borderRadius: {
        none: '0px',
        DEFAULT: '6px',
        xs: '5px',
        sm: '7px',
        md: '9px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        '3xl': '26px',
        full: '9999px',
        // 液态玻璃容器档（docs/Gosume液态玻璃/液态玻璃落地规范.md 第 2.2 节）
        'glass-card': 'var(--radius-glass-card)',
        'glass-modal': 'var(--radius-glass-modal)',
      },

      // ----- 层级阴影（指向 CSS 变量 → 随主题切换）-----
      // 深色主题下阴影几乎不可见，层级靠「向上提亮 + hairline」表达，
      // 因此阴影值按主题分别定义，不能写死。
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
        '2xl': 'var(--shadow-2xl)',
        none: 'none',
      },

      // ----- 字体族（SF 优先的系统栈）-----
      fontFamily: {
        sans: ['var(--font-sans)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
      },

      // ----- 动效（时长与曲线指向令牌）-----
      // 用法：transition-colors duration-hover ease-apple
      // 约束：出现用 ease-apple-out，消失用 ease-in；hover 不用 spring。
      // 阶段 1 只定义了变量，这里补上 Tailwind 映射，组件类与 TSX 才能消费。
      transitionDuration: {
        instant: 'var(--dur-instant)',
        hover: 'var(--dur-hover)',
        fast: 'var(--dur-fast)',
        enter: 'var(--dur-enter)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
        DEFAULT: 'var(--dur-fast)',
      },
      transitionTimingFunction: {
        apple: 'var(--ease-apple)',
        'apple-out': 'var(--ease-apple-out)',
        'apple-spring': 'var(--ease-apple-spring)',
      },

      // ----- 描边宽度（只用这四档）-----
      borderWidth: {
        DEFAULT: 'var(--border-thin)',
        hairline: 'var(--border-hairline)',
        thin: 'var(--border-thin)',
        medium: 'var(--border-medium)',
        thick: 'var(--border-thick)',
      },

      // ----- 控件高度与图标尺寸令牌 -----
      // 用法：h-ctl-lg（输入框/按钮基准 36）· size-ctl-md（方形图标按钮 32）·
      //      size-icon-md（图标 16）· min-h-ctl-lg。
      // 规则：同排/同分组控件必须同高；图标尺寸只取档位，不写 w-4 h-4。
      height: {
        'ctl-xs': 'var(--ctl-xs)',
        'ctl-sm': 'var(--ctl-sm)',
        'ctl-md': 'var(--ctl-md)',
        'ctl-lg': 'var(--ctl-lg)',
        'ctl-xl': 'var(--ctl-xl)',
        'icon-xs': 'var(--icon-xs)',
        'icon-sm': 'var(--icon-sm)',
        'icon-md': 'var(--icon-md)',
        'icon-lg': 'var(--icon-lg)',
        'icon-xl': 'var(--icon-xl)',
        'icon-2xl': 'var(--icon-2xl)',
      },
      minHeight: {
        'ctl-xs': 'var(--ctl-xs)',
        'ctl-sm': 'var(--ctl-sm)',
        'ctl-md': 'var(--ctl-md)',
        'ctl-lg': 'var(--ctl-lg)',
        'ctl-xl': 'var(--ctl-xl)',
      },
      width: {
        'ctl-xs': 'var(--ctl-xs)',
        'ctl-sm': 'var(--ctl-sm)',
        'ctl-md': 'var(--ctl-md)',
        'ctl-lg': 'var(--ctl-lg)',
        'ctl-xl': 'var(--ctl-xl)',
        'icon-xs': 'var(--icon-xs)',
        'icon-sm': 'var(--icon-sm)',
        'icon-md': 'var(--icon-md)',
        'icon-lg': 'var(--icon-lg)',
        'icon-xl': 'var(--icon-xl)',
        'icon-2xl': 'var(--icon-2xl)',
      },
      size: {
        'ctl-xs': 'var(--ctl-xs)',
        'ctl-sm': 'var(--ctl-sm)',
        'ctl-md': 'var(--ctl-md)',
        'ctl-lg': 'var(--ctl-lg)',
        'ctl-xl': 'var(--ctl-xl)',
        'icon-xs': 'var(--icon-xs)',
        'icon-sm': 'var(--icon-sm)',
        'icon-md': 'var(--icon-md)',
        'icon-lg': 'var(--icon-lg)',
        'icon-xl': 'var(--icon-xl)',
        'icon-2xl': 'var(--icon-2xl)',
      },
    },
  },
  plugins: [],
} satisfies Config
