# 从参考素材生成模板

当用户传入简历图片、PDF 或其他格式的简历模板作为参考时，按本文档提取风格特征并映射到 Gosume 的统一 HTML DOM 契约。

> 关键原则：**参考素材只是风格参考，最终模板必须对齐统一 HTML 的 DOM 契约**。参考稿的字段名、区块结构可能与 Gosume 不同，只复刻**结构和样式**，不搬运具体简历内容——模板是给空简历用的。

## 输入类型与处理方式

| 输入类型 | 处理方式 |
|----------|----------|
| 图片（jpg/png/gif/webp） | 视觉分析（布局、配色、字号层级、装饰） |
| PDF | 先用 `pdf` skill 提取文本和布局信息；有截图/预览图则一并视觉分析 |
| HTML 文件 | 读取分析结构和样式 |
| Word/其他格式 | 请求用户转成 PDF 或截图 |

## 风格提取清单

分析参考素材时提取以下要素，建议向用户复述确认后再写 CSS。

### 1. 整体布局

| 布局 | 特征 | CSS 实现 |
|------|------|----------|
| 单栏 | 所有内容纵向排列 | `.resume-container { display: block; }`，`.r-header` 顶部块 |
| 双栏（左侧栏） | 左窄栏放联系方式/技能，右宽栏放经历 | `.resume-container` 为 grid，`.r-header` 即左侧栏（`grid-template-areas: "header main"`） |
| 双栏（右侧栏） | 右窄栏 | 同上，但 `grid-template-columns: 1fr <侧栏宽>`，`grid-template-areas: "main header"` |
| 头部+主体 | 头部横跨全宽，下方单栏或分栏 | 单栏 + `.r-header` 底部加分隔线 |
| 三栏/网格 | 复杂网格 | 简化为双栏或单栏，A4 打印宽度有限 |

> 双栏侧栏在**续页会被分页核心重复渲染为空壳**，参考稿若有通栏彩色侧边，要确认「只剩背景色、无内容」时依然好看。

若参考稿是三栏或复杂网格，主动告诉用户会简化为双栏。

### 2. 配色方案

**必填 5 色**（对应 `template.json` 的 `colors`，CSS 变量与之保持一致）：

| 字段 | 用途 | 提取要点 |
|------|------|----------|
| `primary` | 主色（标题、强调） | 章节标题、强调线的颜色 |
| `secondary` | 辅色 | 次级标题、分隔线 |
| `text` | 正文颜色 | 主体文字，通常深灰 |
| `background` | 背景色 | 页面背景，通常白色 |
| `accent` | 强调色（浅色块） | 侧栏背景、卡片背景 |

- 所有颜色 6 位 HEX `#RRGGBB`；正文色与背景对比度 ≥ 4.5:1
- 黑白纯色简历的 `primary`/`secondary` 用深灰阶
- 大面积深色背景要同时考虑导出的 PDF/PNG 与缩略图效果

### 3. 字体特征

Gosume 只能用系统字体，且**必须经 CSS 变量消费**（运行时会覆盖 `:root` 的字体变量）：

| 参考字体感觉 | 推荐变量值 |
|--------------|-----------|
| 现代无衬线 | `--font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif` |
| 正式衬线 | `--font-family: 'Noto Serif SC', 'SimSun', 'PingFang SC', serif` |
| 极客等宽 | `--mono-font: 'JetBrains Mono', 'Consolas', monospace` |

标题专用字体放 `--font-family-heading`，等宽放 `--mono-font`；所有 `font-family` 声明用 `var(...)`。特殊字体（手写体、艺术字）无法还原，改为最接近的系统字体并告知用户。

### 4. 章节标题样式

| 样式 | CSS 实现 |
|------|----------|
| 大写字母 + 字间距 | `.section-title { text-transform: uppercase; letter-spacing: 1.5pt; }` |
| 底部细线 | `.section-title { border-bottom: 0.75pt solid var(--border-color); }` |
| 左侧色块 | `.section-title { border-left: 3pt solid var(--primary-color); padding-left: 8pt; }` |
| 背景色块 | `.section-title { background: var(--accent-bg); padding: 4pt 8pt; }` |
| 居中加粗 | `.section-title { text-align: center; font-weight: 700; }` |

⚠️ **所有板块标题必须用同一套样式**：编辑器允许用户在「板块顺序」里重排板块，模板 CSS 不得依赖标题出现的位置（禁 `:first-child` / `:nth-child()` / 相邻兄弟选择器）。

### 5. 经历条目布局

| 要素 | 观察点 | 对应类名 |
|------|--------|----------|
| 标题行 | 公司名和职位是否同行？日期右对齐还是另起行？ | `.exp-header`（`.company` + `.title` + `.date`） |
| 地点 | 是否显示工作地点 | `.exp-location` |
| 描述 | 概述用段落还是列表？ | `.exp-summary` / `.highlights` |
| 项目符号 | 圆点、横线、自定义符号？ | `.highlights li::before` |

> `.exp-summary` / `.summary` 里的内容是**富文本 Markdown**（`md` 渲染），可能含 `<p>` / `<ul>` / `<ol>`；列表 marker 由 `templates/resume-global.css` 全局收敛，模板不要重复定义列表样式。参考稿里的项目符号请只落在 `.highlights li::before` 上。

### 6. 头像处理

统一 HTML 仅在简历含头像数据时渲染 `.r-avatar`；位置与显隐**完全由模板 CSS 决定**，`features.avatar` 只是元数据，不参与渲染。

| 情况 | 处理 |
|------|------|
| 无头像 | `features.avatar: false`；用单栏 `grid-template-areas` 排布时不要给 avatar 留独立列，或用 `display: none` 让 `.r-avatar` 不占位 |
| 圆形头像在左上角（单栏） | `.r-header` 用 `grid-template-areas` 排布，`.r-avatar img { border-radius: 50%; }` |
| 方形头像在头部 | `.r-avatar img { border-radius: 4pt; }` |
| 头像在侧栏顶部（双栏） | `.r-avatar` 放侧栏 grid 首行 |

必须写 `width` + `height` + `object-fit: cover`；`avatar-left/right` 布局下补 `align-self: start`（见 `style-guide.md` 第 6 节）。

### 7. 联系方式布局

统一 HTML 把联系方式按语义包进 3 个 `.r-contact-group`（contact / basic / links）。参考稿常见两种形态：

| 参考稿形态 | 映射 |
|------------|------|
| 顶部横向信息带（单栏） | `.r-contact` 覆盖为连续 4 列栅格 + `.r-contact-group { display: contents; }`，组内标签不定宽，长链接由前端自适应跨列 |
| 侧栏竖排（双栏） | 保留竖排 flex/grid，靠全局 `display: contents` 兜底即可，无需为分组改写 |

若参考稿用了「图标 + 联系方式」，见下方特殊元素处理。

### 8. 技能展示

| 展示方式 | 对应实现 | `features.skill_bars` |
|----------|----------|----------------------|
| 进度点（5 格） | 统一 HTML 已用 `skillLevel` 输出 `.skill-dot`，CSS 只需定义 `.skill-dot`/`.skill-dot.filled` | `true` |
| 标签云 | 纯文字罗列，CSS 隐藏 `.skill-dots` | `false` |
| 分类列表 | 按分组罗列技能名 | `false` |

> `features.*` 全部只是元数据，不参与渲染；是否显示等级点由模板 CSS 决定。参考稿用进度条的，建议改为进度点并告知用户。

## 字段映射规则

参考素材的简历内容**不需要原样搬运**，但要理解各区块对应 Gosume 的哪些字段，才能确定 CSS 重点。

### 区块映射

| 参考素材常见标题 | Gosume 区块 | 渲染容器 |
|------------------|------------|----------|
| 个人信息/联系方式/基本信息 | personal | `.r-header`（联系方式在 `.r-contact`） |
| 个人简介/自我评价/总结 | summary | `.summary` |
| 工作经历/工作经验 | jobs | `.experience-item` |
| 实习经历/实习经验 | internships | `.experience-item` |
| 项目经历/项目经验 | projects | `.experience-item` |
| 教育背景/教育经历 | education | `.education-item` |
| 专业技能/技术栈 | skills | `.skills-grid` / `.skill-category` |
| 语言能力 | languages | `.r-langs`（头部区，不是主栏） |
| 奖项/荣誉 | awards | `.award-item` |
| 兴趣爱好/证书/其他 | custom | `.custom-item` |

### 字段映射（帮助理解渲染内容）

- Personal：姓名→`full_name`、英文名→`english_name`、邮箱/电话→`email`/`phone`、所在地→`location`、职位→`job_title`、年限→`years_of_exp`；此外还有籍贯/民族/生日/年龄/政治面貌/婚姻/入党时间/户口/现居地/职称/自定义 `extras`（都在 `basic` 组）、网站/GitHub/LinkedIn（`links` 组，长值）
- Job/Internship：公司→`company`、职位→`title`、时间→`start_date`/`end_date`、职责→`summary`、成果→`highlights`
- Project：项目名→`name`、角色→`role`、技术栈→`extras`（键值对）或 `highlights`
- Education：学校→`school`、学位→`degree`、专业→`major`、GPA→`gpa`、课程→`courses`

> 完整字段清单见 `data-model.md`。**联系方式项很多**（最多 20+ 项），要确认模板在信息密集时仍不溢出。

## 处理参考素材中的特殊元素

### 图标

参考稿可能在联系方式前加图标。Gosume 不能引用外部图标库：省略（推荐）、用 Unicode 符号、或用 CSS 伪元素绘制简单图形。注意伪元素不能挡住 `contactFit.ts` 对 `.r-contact-item` 宽度的测量。

### 二维码

`features.qr_code` 只是元数据，模板本身不生成二维码。建议省略并告知用户。

### 装饰性图形

简单色块、线条可用 CSS 实现；复杂图形无法还原，省略并告知；不得引用外部图片资源。不得用负 margin 把头部色块拉出 `.resume-page` 做全出血（会破坏分页测量）。

### 多页设计

Gosume 模板是**单页设计 + 自动分页**：内容超出时分页核心按组件/行拆分到续页，并把条目克隆成「头部部分 + 续接部分」。不要硬编码"第二页"结构，也不要写 `:first-child` 等依赖 DOM 位置的选择器。`page_count` 只描述支持的页数范围。

### 板块顺序

参考稿的板块顺序与 Gosume 默认顺序（教育 → 实习 → 工作 → 项目 → 奖项 → 技能 → 总结 → 自定义）不同时，**不要靠 CSS `order` 硬调**：告诉用户可在编辑器的「板块顺序」里自行重排，模板只需保证任意顺序下都成立。

## 与用户确认的要点

分析完参考素材后，向用户复述以下理解，确认后再写 CSS：

1. 布局判断："这是单栏/双栏布局，侧栏放 X，主体放 Y"
2. 配色提取："主色 #XXXXXX，辅色 #XXXXXX，对吗？"
3. 字体感觉："整体偏现代/正式/极客风格，会落到 `--font-family` 变量"
4. 板块顺序："Gosume 默认顺序是教育→实习→工作→项目→奖项→技能→总结→自定义，用户可在编辑器里自行调整，模板不锁死顺序"
5. 特殊处理："图标/二维码/装饰图无法完全还原，会简化为 X"
6. 参考稿差异较大的地方（三栏布局、大量图标、特殊字体、联系方式横排 vs 竖排）

## 常见参考素材类型应对

### 学术简历（CV）

特征：正式、衬线字体、publication 列表。映射：publication 放自定义（`custom`）区块，每条作为 CustomItem；衬线字体放 `--font-family-heading`。

### 设计师简历

特征：彩色、图形化、作品集链接。映射：作品集链接放 Projects 的 `url` 或 Personal 的 `website`（后者会触发联系方式自适应跨列，注意留白）；彩色配置保留但确保打印友好。

### 技术简历

特征：技能突出、项目详细、技术栈明确。映射：技术栈用 Projects 的 `extras` 键值对展示；GitHub/LinkedIn 长链接按第 7 节处理。

### 应届生简历

特征：教育靠前、实习经历、课程项目。映射：`sections.layout` 把 education 放前面（仅影响编辑器展示）；实习用 Internships；课程项目用 Projects。渲染顺序由用户或默认顺序决定。
