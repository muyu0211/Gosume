# 样式规范

本文档定义 `styles.css` 的编写规范和命名约定。

## 必选样式元素

### 1. A4 页面尺寸与页边距变量

```css
/* 单栏模板：.resume-page 直接消费页边距变量 */
.resume-page {
    width: 210mm;
    min-height: 297mm;
    padding: var(--resume-padding, 14mm 18mm);
    background: #fff;
}
```

- 宽度 210mm、最小高度 297mm（A4）
- **padding 必须通过 `var(--resume-padding, 默认值)` 消费**：应用运行时按用户的"页边距档位"（紧凑/较窄/标准/较宽/宽松）注入该变量，fallback 值是模板自己的默认边距。硬编码 padding 会导致用户的页边距调整在此模板上失效
- 背景白色

**双栏模板**：`.resume-page` 不设 padding，由内部分栏容器分别消费变量：

```css
.resume-page { width: 210mm; min-height: 297mm; display: flex; }
.resume-sidebar { padding: var(--resume-padding-y, 14mm) var(--resume-padding-x, 12mm); }
.resume-main    { padding: var(--resume-padding-y, 14mm) var(--resume-padding-x, 16mm); }
```

| CSS 变量 | 注入内容 | 消费者 |
|----------|----------|--------|
| `--resume-padding` | 完整 `上下 左右` 简写 | 单栏模板的 `.resume-page` |
| `--resume-padding-y` / `--resume-padding-x` | 纵向 / 横向分量 | 双栏模板的内部分栏容器 |

### 2. 垂直间距方向（margin-bottom 规范）

模块内条目与条目内部细节行的**节奏间距一律使用 `margin-bottom`**，禁止用 `margin-top` 表达垂直节奏：

- 应用按用户的"内容间距档位"注入 `margin-bottom !important` 覆盖规则，方向不一致的模板在档位调整时行为错乱（旧 margin-top 残留 + 新 margin-bottom 叠加 = 双重间隙）
- 仅两类例外允许 `margin-top`：
  - **装饰性元素**：时间轴线（`.timeline-line`）、强调线（`.exp-accent`）、伪元素分隔符等非内容流组件
  - **文档流末尾的收尾组件**：如 `.footer`（其后无兄弟元素，间距只能向上申请）

正确示例：

```css
.experience-item { margin-bottom: 12pt; }   /* ✓ 条目间距 */
.exp-header      { margin-bottom: 3pt; }    /* ✓ 细节间距 */
.edu-detail      { margin-bottom: 2pt; }    /* ✓ 细节间距 */
.extra-row       { margin-bottom: 3pt; }    /* ✓ 细节间距 */
```

### 3. 内容间距档位的自动接入

用户可在应用中调整"内容间距"档位（紧凑/较窄/标准/较宽/宽松），运行时对以下三层选择器注入 `margin-bottom !important` 覆盖。**模板只要沿用标准类名，即自动参与间距调整**：

| 层级 | 覆盖选择器 |
|------|-----------|
| 模块 ↔ 模块 | `* + .section-title`（margin-top） |
| 条目 ↔ 条目 | `.experience-item` `.education-item` `.award-item` `.custom-item` `.skill-category` `.skill-item` `.sidebar-item`，以及 `.section-title` 自身的 margin-bottom |
| 细节 ↔ 细节 | `.exp-header` `.exp-location` `.exp-summary` `.highlights li` `.edu-detail` `.edu-courses` `.extra-row` |

- "标准"档不注入任何规则，保留模板原生节奏——即 CSS 里写的 margin-bottom 值就是模板的默认视觉效果
- 使用非标准类名的组件不参与档位调整（仍显示模板自己的间距）

### 4. 个人总结的换行处理

`.summary`（个人总结区块）必须包含长词换行规则，否则长英文串/URL 会撑破版面：

```css
.summary {
    margin-bottom: 18pt;
    overflow-wrap: break-word;
    word-break: break-word;
}
```

### 5. CSS 变量定义

在 `:root` 中定义模板的主色调和字体变量：

```css
:root {
    --font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
    --font-size-base: 10pt;
    --line-height: 1.6;
    --primary-color: #1F2937;
    --heading-color: #111827;
    --text-color: #1F2937;
    --muted-color: #6B7280;
    --border-color: #E5E7EB;
    --accent-color: #374151;
    --accent-bg: #F9FAFB;
}
```

**颜色变量必须与 `template.json` 的 `colors` 字段保持一致**：

| CSS 变量 | 对应 JSON 字段 |
|----------|----------------|
| `--primary-color` | `colors.primary` |
| `--accent-color` | `colors.secondary` |
| `--text-color` | `colors.text` |
| `--accent-bg` | `colors.accent` |

### 6. 打印样式

```css
@media print {
    .resume-page {
        width: 100%;
        margin: 0;
        padding: var(--resume-padding, 14mm 18mm);
    }
    @page {
        size: A4;
        margin: 0;
    }
}
```

### 7. 分页控制

```css
.page-break {
    page-break-after: always;
    break-after: page;
}
```

### 8. 技能等级点（若启用技能点）

```css
.skill-dot {
    display: inline-block;
    width: 6pt;
    height: 6pt;
    border-radius: 50%;
    background: #D1D5DB;
    margin: 0 0.5pt;
    vertical-align: middle;
}

.skill-dot.filled {
    background: var(--primary-color);
}
```

`skillLevel` 函数输出的 HTML 依赖这两个类。`background: #D1D5DB` 是未填充点的颜色，可改；`.filled` 的 `background` 一般用主色。

## 命名约定

推荐使用 BEM-like 命名，保持模板间一致性。

### 容器层级

| 类名 | 用途 |
|------|------|
| `.resume-page` | 页面容器（设置 A4 尺寸） |
| `.resume-container` | 内容容器（max-width: 100%） |

### 头部

| 类名 | 用途 |
|------|------|
| `.header` | 头部容器 |
| `.header-left` / `.header-right` | 头部分栏 |
| `.header-avatar` | 头像容器 |
| `.english-name` | 英文名 |
| `.job-title` | 职位 |
| `.contact-line` | 联系信息行 |
| `.contact-item` | 单个联系项 |

### 章节

| 类名 | 用途 |
|------|------|
| `.section-title` | 章节标题 |

### 经历条目

| 类名 | 用途 |
|------|------|
| `.experience-item` | 经历条目容器 |
| `.exp-header` | 经历头部（公司+日期） |
| `.exp-header .company` / `.employer` | 公司名 |
| `.exp-header .title` / `.role` | 职位 |
| `.exp-header .date` | 日期 |
| `.exp-location` | 地点 |
| `.exp-summary` | 概述 |
| `.exp-role` | 角色（项目用） |

### 教育条目

| 类名 | 用途 |
|------|------|
| `.education-item` | 教育条目容器 |
| `.edu-header` | 教育头部 |
| `.edu-header .school` | 学校 |
| `.edu-header .date` | 日期 |
| `.edu-detail` | 教育详情（GPA、课程等） |

### 技能

| 类名 | 用途 |
|------|------|
| `.skill-category` | 技能分组容器 |
| `.skill-category h4` | 分组标题 |
| `.skill-list` / `.skills-grid` | 技能列表 |
| `.skill-item` | 单个技能项 |
| `.skill-name` | 技能名 |
| `.skill-level` | 技能等级容器 |
| `.skill-dot` | 等级点 |
| `.skill-dot.filled` | 已填充等级点 |

### 列表

| 类名 | 用途 |
|------|------|
| `.highlights` | 亮点列表 |
| `.highlights li` | 亮点条目 |
| `.inline-list` | 行内列表（语言、技能等） |
| `.inline-list .label` | 行内列表标签 |

### 奖项

| 类名 | 用途 |
|------|------|
| `.award-item` / `.custom-item` | 奖项条目 |
| `.award-header` | 奖项头部 |
| `.award-title` | 奖项名 |
| `.award-issuer` | 颁发机构 |

### 自定义区块

| 类名 | 用途 |
|------|------|
| `.custom-item` | 自定义条目 |
| `.custom-subtitle` | 副标题 |

### 项目扩展字段

| 类名 | 用途 |
|------|------|
| `.extra-row` | 扩展字段行 |
| `.extra-label` | 标签 |
| `.extra-value` | 值 |

## 单位规范

| 用途 | 单位 | 说明 |
|------|------|------|
| 字号 | `pt` | 打印友好，10-12pt 为正文常规 |
| 间距（页边距、区块间距） | `mm` 或 `pt` | 打印友好 |
| 细微调整（边框、小间距） | `pt` | 如 `0.5pt`、`1pt` |
| 尺寸（头像、图标） | `pt` | 如 `64pt x 80pt` |

**避免用 `px`** 作为主要单位。`px` 是屏幕单位，打印时换算不稳定。仅在极细微的调整（如 1px 边框）时可用。

## 字体栈

**必须使用系统字体**，不得引用外部字体（CDN、web font）。原因：

1. 导出 PDF 时不执行 JS，无法加载 web font
2. 外部资源引用会被模板规范禁止
3. 系统字体在打印时稳定可靠

推荐字体栈：

```css
/* 中文优先 */
--font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;

/* 衬线（正式风格） */
--font-family: 'Noto Serif SC', 'SimSun', 'PingFang SC', serif;

/* 等宽（极客风格） */
--font-family: 'JetBrains Mono', 'Consolas', 'Microsoft YaHei', monospace;
```

## 颜色规范

- 所有颜色用 6 位 HEX（`#RRGGBB`），不用 3 位缩写、rgb()、hsl()
- 正文颜色保持深灰（`#1F2937`、`#334155`）以保证可读性
- 主色用于标题、强调，避免大面积使用
- 背景保持白色或极浅灰（`#F9FAFB`、`#F1F5F9`）
- 确保文字与背景对比度达标（WCAG AA：正文 ≥ 4.5:1，大字 ≥ 3:1）

## 布局模式

### 单栏布局（默认）

所有区块纵向排列，适合大多数场景。

### 双栏布局（侧边栏）

`.resume-page` 不设 padding，由分栏容器消费页边距变量（见第 1 节）：

```css
.resume-page {
    width: 210mm;
    min-height: 297mm;
    display: flex;
}
.sidebar {
    width: 32%;
    padding: var(--resume-padding-y, 14mm) var(--resume-padding-x, 12mm);
    border-right: 0.5pt solid var(--border-color);
}
.main {
    flex: 1;
    padding: var(--resume-padding-y, 14mm) var(--resume-padding-x, 16mm);
}
```

侧边栏放：头像、联系方式、技能、语言
主体放：工作经历、项目、教育、奖项

注意：双栏在打印时需保证内容不溢出 A4 宽度（210mm - 36mm 边距 = 174mm 可用）。

### 头部+主体布局

头部横跨全宽，下方分栏或单栏。

```css
.header {
    border-bottom: 1.5pt solid var(--primary-color);
    padding-bottom: 12pt;
    margin-bottom: 16pt;
}
```

## 常见样式问题

| 问题 | 原因 | 修复 |
|------|------|------|
| 打印时内容被截断 | 缺 `@page { size: A4; margin: 0; }` | 添加打印样式 |
| 字体显示不一致 | 用了外部字体 | 改用系统字体栈 |
| 技能点不显示 | 缺 `.skill-dot` 样式 | 添加技能点 CSS |
| 分页位置错误 | 缺 `.page-break` 类 | 在需要分页处加 `<div class="page-break"></div>` |
| 颜色与元数据不符 | CSS 变量与 template.json colors 不一致 | 对齐两者 |
| 双栏溢出 | 总宽度超过 A4 可用宽度 | 减小 gap 或侧边栏宽度 |
| 用户调页边距无效果 | padding 硬编码，未消费 `--resume-padding` 变量 | 改为 `padding: var(--resume-padding, 默认值)` |
| 调内容间距时间距叠加/错乱 | 条目或细节间距用了 `margin-top` | 改为 `margin-bottom` |
| 长英文串/URL 撑破版面 | `.summary` 缺换行规则 | 加 `overflow-wrap: break-word; word-break: break-word;` |
| 隐藏单条目后仍渲染 | range 内缺 `{{if not .Hidden}}` 守卫 | 条目 range 内加守卫 |
