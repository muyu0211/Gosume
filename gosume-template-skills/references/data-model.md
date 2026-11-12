# 数据模型与渲染契约

本文档说明简历数据模型，以及统一 HTML（`templates/template.html`）如何把数据渲染成固定 DOM 结构。模板制作者**不写 HTML**，但需要据此写对 CSS 选择器。

> 权威源：`templates/template.html`（DOM/函数）、`frontend/src/lib/sectionOrder.ts`（板块顺序）、`frontend/src/lib/paginationCore.ts`（分页）、`templates/resume-global.css`（全局样式）。

## 1. 渲染顺序：默认固定，但用户可调

统一 HTML 的**默认**渲染顺序：**教育 → 实习 → 工作 → 项目 → 奖项 → 技能 → 总结 → 自定义**（见 `BUILTIN_SECTIONS`）。自定义模块每个独立占位（`custom:<id>`），默认排在内置板块之后。

编辑器提供「板块顺序」（`resume.section_order`），由 `reorderSectionsHtml` 在渲染后重排 DOM；自定义模块可与内置板块任意穿插。顺序表缺省/含非法项时按默认顺序补齐，旧数据零迁移。

> **模板 CSS 不得依赖固定顺序**：禁用 `:first-child` / `:nth-child()` / 相邻兄弟选择器，也不要给「第一个 `.section-title`」写特殊样式。所有板块标题用同一套类名样式。

`template.json` 的 `sections.layout` 只控制**前端编辑器**里的展示顺序，不影响渲染顺序。

## 2. 顶层 DOM 契约

```
<body>                                 ← 中性，不承载页面样式
  <div class="resume-page">            ← 单页单元：210mm × 297mm + 页边距 + 白底
    <div class="resume-container">     ← 分页算法的内容包裹层
      <header class="r-header">        ← 个人信息区（四子块，排布由 CSS 决定）
        ├─ .r-header-text              ← 姓名/英文名/职位/年限
        ├─ .r-avatar                   ← 头像（仅有数据时渲染）
        ├─ .r-contact                  ← 联系方式（条目按语义分三组）
        └─ .r-langs                    ← 语言（仅有数据时渲染）
      <main class="r-main">            ← 章节区（标题与条目为扁平兄弟）
    </div>
  </div>
</body>
```

每个板块由 `{{if .Section}}` 包裹——数据为空时整个板块（含标题）不渲染，模板 CSS 无需处理「空标题」。

**数据属性**：条目节点带 `data-id`（条目 id）+ `data-section`（板块 key），板块标题带 `data-section`；自定义板块标题另有 `data-section-id`。这些供分页与「点击跳转编辑器」使用，模板 CSS **不要依赖它们做布局或选择器**。

## 3. 个人信息（`.r-header`）

四子块均为 grid/flex 子项，排布由 CSS 控制（单栏 = 顶部块，双栏 = 侧栏）。

| 子块 | 类名 | 内部结构 |
|------|------|----------|
| 姓名区 | `.r-header-text` | `.r-name`(h1) → `.r-ename` → `.r-jobtitle` → `.r-yoe`（后三者均可选） |
| 头像 | `.r-avatar` | 仅 `avatar` 有值时渲染，内含 `<img src="{{safeURL ...}}">` |
| 联系方式 | `.r-contact` | `.r-subtitle` + 3 个 `.r-contact-group` > 若干 `.r-contact-item`（`.r-contact-label` + `.r-contact-value`） |
| 语言 | `.r-langs` | 仅有语言数据时渲染；`.r-subtitle` + 若干 `.r-lang`（带 `data-id`） |

### 联系方式分组（重要）

`.r-contact` 内的条目按语义包在三个 `.r-contact-group[data-group]` 中：

| `data-group` | 包含字段 |
|--------------|----------|
| `contact` | 邮箱 / 手机 / 微信 / QQ |
| `basic` | 城市 / 籍贯 / 民族 / 出生日期 / 年龄 / 政治面貌 / 婚姻状况 / 入党时间 / 户口所在地 / 现居住地 / 职称职级 / 自定义 Extras |
| `links` | 网站 / GitHub / LinkedIn |

- `templates/resume-global.css` 提供 `.r-contact-group { display: contents; }` 兜底：**双栏侧栏竖排模板无需改动**，条目仍作为 `.r-contact` 直接子项参与原有 flex/grid 排布
- **单栏横排模板**（内置 20 套）在各模板 CSS 里把 `.r-contact` 覆盖为连续无缝 4 列栅格，组内标签不定宽、条目内用固定 `gap` 统一标签-值间距
- 长值自适应跨列：统一 HTML 尾部脚本测量每个 `.r-contact-item` 所需宽度，超出单格时设 `grid-column: span 2/3/4`；预览/导出 iframe 禁脚本，由前端 `contactFit.ts` 的 `applyContactFit(doc)` 在分页/截图前执行。两处逻辑一致且幂等
- 模板只需保证 `.r-contact-item` 有 `min-width: 0` + `overflow-wrap: anywhere`，不要写死宽度、`white-space: nowrap` 或固定列数以外的栅格

> 单栏模板如不需要 `.r-subtitle`（"个人信息"/"语言"），用 `.r-subtitle { display: none; }` 隐藏；双栏侧栏通常保留。

## 4. 区块渲染契约

### 教育背景（`.education-item`）

`.edu-header`（`.edu-school` = 学校 · 学位 · 专业 · GPA；`.date`）→ `.edu-detail`（辅修）→ `.edu-courses`（主修课程）→ `.highlights > li`（亮点，`mdInline`）。

### 实习 / 工作 / 项目（`.experience-item`）

三者共用结构，字段略有差异：

| 元素 | 类名 | 实习/工作 | 项目 |
|------|------|-----------|------|
| 头部 | `.exp-header` | `.company`（公司）+ `.title`（职位）+ `.date` | `.company`（项目名）+ `.title`（角色）+ `.date` |
| 地点 | `.exp-location` | 有 | 无 |
| 概述 | `.exp-summary` | 有（`md`，块级） | 有（`md`，块级） |
| 亮点 | `.highlights > li` | 有（`mdInline`） | 有（`mdInline`） |
| 扩展字段 | `.extra-row`（`.extra-label` + `.extra-value`） | 无 | 有（`.extra-value` 用 `mdInline`） |

### 奖项（`.award-item`）

`.award-header`（`.award-title` + `.date`）→ `.award-issuer` → `.exp-summary`（`md`）。

### 技能（`.skills-grid`）

`.skills-grid` > `.skill-category` > `h4` + `.skill-item`（技能名 + `.skill-dots` > `skillLevel` 输出的 `.skill-dot` / `.skill-dot.filled`）。等级为 0 时不渲染 `.skill-dots`。

### 总结（`.summary`）

`.section-title` + `.summary`，内容用 `{{md ...}}` 渲染，容器内可能出现 `<p>` / `<ul>` / `<ol>`。

### 自定义区块

每个自定义模块一个 `.section-title`（带 `data-section-id`），其下多个 `.custom-item`：`h4`（`mdInline`）→ `.subtitle`（副标题 · 日期）→ `.exp-summary`（`md`）→ `.highlights`（`mdInline`）。

## 5. 富文本（Markdown）

长文本字段在编辑器里是所见即所得富文本（`RichTextField.tsx`），底层以 Markdown 源码存储，双向转换见 `frontend/src/lib/markdown.ts`。统一 HTML 用两类函数渲染：

| 函数 | 用途 | 输出容器 |
|------|------|----------|
| `md`（block） | 段落 + 行内加粗/斜体/链接 + 无序/有序列表，单换行转 `<br>` | `.exp-summary`、`.summary`、`.custom-item .exp-summary`、`.award-item .exp-summary` |
| `mdInline`（inline） | 行内加粗/斜体/链接 | `.highlights li`、`.extra-value`、`.custom-item h4`、部分 `.r-contact-value` |

输出已消毒。Markdown 列表的 marker 由 `templates/resume-global.css` 全局收敛（含 `data-marker` 变体），**模板不要重复定义** `.exp-summary ul` / `.summary ol` 的 `list-style` 或 `li::before`。模板应使用全局 reset 收掉 `<p>` 自带 margin，需要间距时只用 `margin-bottom`。

## 6. 字段清单

用于判断「什么条件下某元素会出现」，模板 CSS 据此决定显隐样式。

### Personal

| 字段 | 说明 |
|------|------|
| `full_name` / `english_name` | 姓名 / 英文名 |
| `job_title` / `years_of_exp` | 求职意向 / 工作年限 |
| `avatar` | 头像（Base64 data URI 或路径），决定 `.r-avatar` 是否渲染 |
| `email` / `phone` / `wechat` / `qq` | `contact` 组 |
| `location` / `native_place` / `ethnicity` / `birthday` / `age` / `political_status` / `marital_status` / `party_join_date` / `household_registration` / `current_residence` / `title_rank` / `extras[]` | `basic` 组（`extras` 为 `{label, value}`，值走 `mdInline`） |
| `website` / `github` / `linkedin` | `links` 组（长值，触发自适应跨列） |

> 所有联系方式项均为可选，有值才渲染对应 `.r-contact-item`。

### Job / Internship

`company`、`title`、`location`、`start_date` / `end_date`、`is_current`（影响"至今"）、`summary`、`highlights[]`。

### Project

`name`、`role`、`url`、`start_date` / `end_date`、`summary`、`highlights[]`、`extras[]{label, value}`。

### Education

`school`、`degree`、`major` / `minor`、`start_date` / `end_date`、`gpa`、`courses`、`highlights[]`。

### SkillGroup / Skill

`category`（分组名）、`items[].name`、`items[].level`（0–5，`skillLevel` 输出等级点）。

### Language / Award / CustomSection

- Language：`name`、`level`、`proficiency`
- Award：`title`、`date`、`issuer`、`summary`
- CustomItem：`title`、`subtitle`、`date`、`description`、`highlights[]`

## 7. 分页契约

`paginationCore.ts` 做组件级 + 行级分页：放不下当前页的条目按内部组件拆分跨页。

- 拆分产物 = **头部部分克隆**（保留 `data-id`，留当前页）+ **续接部分克隆**（去掉 `data-id`、改打 `data-cont-of="<原id>"`，位于续页）
- 两类克隆**均复用条目原有类名与 `data-section`**，模板 CSS 自动生效，无需感知拆分
- 引擎按通用结构规则判定：无块级子元素的叶子文本块按行断页、含块级子元素的容器按子组件拆分；仅 5 类语义整体登记为 `KEEP_WHOLE`：`.section-title`、`.exp-header`、`.edu-header`、`.skill-item`、`.skill-dots`
- 双栏模式下 `.r-header` 是持久侧栏（续页重复空壳），单栏模式下为页 1 前置块

**对模板的约束**：禁用 `:first-child` / `:last-child` / `:nth-child()` / `+` 相邻兄弟等随拆分变化的结构选择器；不要给条目设固定 `height` 或 `overflow: hidden`。

## 8. 隐藏（Hidden）字段

所有条目类型都有可选 `Hidden` 字段。**统一 HTML 不渲染 Hidden 守卫**，隐藏由前端 `toGoShape` 在渲染前统一过滤：

- 被隐藏条目在渲染前就从数组移除，模板 CSS 完全无感知
- 区块内所有条目隐藏时 `{{if .Section}}` 使整个区块（含标题）不渲染
- 个人总结的 `summary_hidden` 同样在数据层处理（隐藏时清空 `summary`）
- **模板 CSS 无需、也不应写任何隐藏逻辑**
