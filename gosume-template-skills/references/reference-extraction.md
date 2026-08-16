# 从参考素材生成模板

当用户传入简历图片、PDF 或其他格式的简历模板作为参考时，按本文档提取风格特征并映射到 Gosume 的统一 HTML DOM 契约。

## 输入类型与处理方式

| 输入类型 | 处理方式 |
|----------|----------|
| 图片（jpg/png/gif/webp） | 用 `read_file` 工具读取，AI 直接视觉分析 |
| PDF | 先用 `pdf` skill 提取文本和布局信息；若有截图/预览图则一并视觉分析 |
| HTML 文件 | 用 `read_file` 读取，分析结构和样式 |
| Word/其他格式 | 请求用户转成 PDF 或截图 |

> 关键原则：**参考素材只是风格参考，最终模板必须对齐统一 HTML 的 DOM 契约**。用户传入的简历字段名、区块结构可能与 Gosume 不同，只复刻**结构和样式**，不搬运具体简历内容——模板是给空简历用的。

## 风格提取清单

分析参考素材时，提取以下要素。建议向用户复述确认后再动手写 CSS。

### 1. 整体布局

判断属于哪种布局模式，映射到统一 HTML 的 CSS 实现：

| 布局 | 特征 | CSS 实现 |
|------|------|----------|
| 单栏 | 所有内容纵向排列 | `.resume-container { display: block; }`，`.r-header` 顶部块 |
| 双栏（左侧栏） | 左侧窄栏放联系方式/技能，右侧宽栏放经历 | `.resume-container` 为 grid，`.r-header` 即左侧栏（`grid-template-areas: "header main"`） |
| 双栏（右侧栏） | 右侧窄栏 | 同上，但 `grid-template-columns: 1fr <侧栏宽>`，`grid-template-areas: "main header"` |
| 头部+主体 | 头部横跨全宽，下方单栏或分栏 | 单栏 + `.r-header` 底部加分隔线 |
| 三栏/网格 | 复杂网格布局 | 简化为双栏或单栏，Gosume 不适合过于复杂的网格 |

> 若参考素材是三栏或复杂网格，主动告诉用户会简化为双栏，因为 A4 打印宽度有限，栏数过多会导致内容拥挤。

### 2. 配色方案

提取主色、辅色、文字色、背景色、强调色，落到 `template.json` 的 `colors` 与 CSS 变量。

**必填 5 色**（对应 `template.json` 的 `colors`）：

| 字段 | 用途 | 提取要点 |
|------|------|----------|
| `primary` | 主色（标题、强调） | 参考素材中标题、章节标题的颜色 |
| `secondary` | 辅色 | 次级标题、分隔线颜色 |
| `text` | 正文颜色 | 主体文字颜色，通常深灰 |
| `background` | 背景色 | 页面背景，通常白色 |
| `accent` | 强调色（浅色块） | 侧边栏背景、卡片背景等浅色区域 |

- 所有颜色必须为 6 位 HEX `#RRGGBB`
- 正文色与背景色对比度需达标（WCAG AA：正文 ≥ 4.5:1）
- 黑白纯色简历的 `primary`/`secondary` 用深灰阶

### 3. 字体特征

Gosume 只能用系统字体。根据参考素材的字体感觉选择：

| 参考字体感觉 | 推荐字体栈 |
|--------------|-----------|
| 现代无衬线 | `'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif` |
| 正式衬线 | `'Noto Serif SC', 'SimSun', 'PingFang SC', serif` |
| 极客等宽 | `'JetBrains Mono', 'Consolas', 'Microsoft YaHei', monospace` |

> 特殊字体（手写体、艺术字）无法完全还原，改为最接近的系统字体并告知用户。

### 4. 章节标题样式

| 样式 | CSS 实现 |
|------|----------|
| 大写字母 + 字间距 | `.section-title { text-transform: uppercase; letter-spacing: 1.5pt; }` |
| 底部细线 | `.section-title { border-bottom: 0.75pt solid var(--border-color); }` |
| 左侧色块 | `.section-title { border-left: 3pt solid var(--primary-color); padding-left: 8pt; }` |
| 背景色块 | `.section-title { background: var(--accent-bg); padding: 4pt 8pt; }` |
| 居中加粗 | `.section-title { text-align: center; font-weight: 700; }` |

### 5. 经历条目布局

观察工作经历、项目经历等条目的排版，映射到统一 HTML 的 `.experience-item` 内部结构：

| 要素 | 观察点 | 对应类名 |
|------|--------|----------|
| 标题行 | 公司名和职位是否同行？日期右对齐还是另起行？ | `.exp-header`（`.company` + `.title` + `.date`） |
| 地点 | 是否显示工作地点 | `.exp-location` |
| 描述 | 概述用段落还是列表？ | `.exp-summary` / `.highlights` |
| 项目符号 | 圆点、横线、自定义符号？ | `.highlights li::before` |

### 6. 头像处理

判断参考素材是否有头像，位置由 CSS 控制（统一 HTML 仅在含头像数据时渲染 `.r-avatar`）：

| 情况 | 处理 |
|------|------|
| 无头像 | `features.avatar: false`，模板 CSS 不展示头像 |
| 圆形头像在左上角（单栏） | `.r-header` 用 grid-template-areas 排布，`.r-avatar img { border-radius: 50% }` |
| 方形头像在头部 | `.r-avatar img { border-radius: 4pt }` |
| 头像在侧边栏顶部（双栏） | `.r-avatar` 放侧栏 grid 首行 |

### 7. 技能展示

| 展示方式 | 对应实现 | `features.skill_bars` |
|----------|----------|----------------------|
| 进度点（5 格） | 统一 HTML 已用 `skillLevel` 输出 `.skill-dot`，CSS 只需定义 `.skill-dot`/`.skill-dot.filled` | `true` |
| 标签云 | 纯文字罗列，不显示等级（CSS 隐藏 `.skill-dots`） | `false` |
| 分类列表 | 按分组罗列技能名 | `false` |

> 参考素材用进度条的，建议改为进度点（Gosume 内置支持）并告知用户。

## 字段映射规则

参考素材的简历内容**不需要原样搬运**，只参考结构和风格。但需要理解参考素材各区块对应 Gosume 的哪些区块/字段，才能确定 CSS 重点。

### 区块映射

| 参考素材常见标题 | Gosume 区块 | 渲染容器 |
|------------------|------------|----------|
| 个人信息/联系方式/基本信息 | personal | `.r-header` |
| 个人简介/自我评价/总结 | summary | `.summary` |
| 工作经历/工作经验 | jobs | `.experience-item` |
| 实习经历/实习经验 | internships | `.experience-item` |
| 项目经历/项目经验 | projects | `.experience-item` |
| 教育背景/教育经历 | education | `.education-item` |
| 专业技能/技术栈 | skills | `.skills-grid` / `.skill-category` |
| 语言能力 | languages | `.r-langs`（头部区） |
| 奖项/荣誉 | awards | `.award-item` |
| 兴趣爱好/证书/其他 | custom | `.custom-item` |

### 字段映射（帮助理解渲染内容）

- Personal：姓名→`full_name`、英文名→`english_name`、邮箱/电话→`email`/`phone`、所在地→`location`、职位→`job_title`、年限→`years_of_exp`
- Job/Internship：公司→`company`、职位→`title`、时间→`start_date`/`end_date`、职责→`summary`、成果→`highlights`
- Project：项目名→`name`、角色→`role`、技术栈→`extras`（键值对）或 `highlights`
- Education：学校→`school`、学位→`degree`、专业→`major`、GPA→`gpa`、课程→`courses`

> 完整字段清单见 `data-model.md`。

## 处理参考素材中的特殊元素

### 图标

参考素材可能在联系方式前加图标。Gosume 不能引用外部图标库，处理方式：省略图标（推荐）、用 Unicode 符号、或用 CSS 伪元素绘制简单图形。

### 二维码

`features.qr_code` 可标记，但模板本身不生成二维码。建议省略并告知用户。

### 装饰性图形

简单色块、线条可用 CSS 实现；复杂图形无法还原，省略并告知；不得引用外部图片资源。

### 多页设计

Gosume 模板是单页设计，内容超出自动分页。不要试图硬编码"第二页"结构；`page_count` 字段描述支持的页数范围。

## 与用户确认的要点

分析完参考素材后，向用户复述以下理解，确认后再写 CSS：

1. 布局判断："这是单栏/双栏布局，侧边栏放 X，主体放 Y"
2. 配色提取："主色 #XXXXXX，辅色 #XXXXXX，对吗？"
3. 字体感觉："整体偏现代/正式/极客风格"
4. 章节顺序（渲染顺序固定，仅告知）："Gosume 渲染顺序固定为教育→实习→工作→项目→奖项→技能→总结→自定义"
5. 特殊处理："图标/二维码/装饰图无法完全还原，会简化为 X"

如果参考素材与 Gosume 模型差异较大（三栏布局、大量图标、特殊字体），主动告知哪些能还原、哪些需简化。

## 常见参考素材类型应对

### 学术简历（CV）
特征：正式、衬线字体、publication 列表。映射：publication 放 `.Custom` 区块，每条作为 CustomItem。

### 设计师简历
特征：彩色、图形化、作品集链接。映射：作品集链接放 Projects 的 `url`；彩色配置保留但确保打印友好。

### 技术简历
特征：技能突出、项目详细、技术栈明确。映射：技术栈用 Projects 的 `extras` 键值对展示。

### 应届生简历
特征：教育靠前、实习经历、课程项目。映射：`sections.layout` 把 education 放前面；实习用 Internships；课程项目用 Projects。
