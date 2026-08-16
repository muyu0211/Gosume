# 数据模型与渲染契约

本文档说明简历数据模型，以及统一 HTML（`templates/unified.html`）如何把这些数据渲染成固定 DOM 结构。模板制作者**不写 HTML**，但需要据此理解：每个区块会渲染出什么元素和类名，才能写对 CSS。

## 渲染顺序（固定）

统一 HTML 的区块渲染顺序固定：**教育 → 实习 → 工作 → 项目 → 奖项 → 技能 → 总结 → 自定义**。若需调序只能用 CSS `order`（不建议依赖）。

## 区块渲染契约（DOM 结构 + 类名）

每个区块由统一 HTML 的 `{{if .Section}}` 包裹——该区块数据为空时，整个区块（含标题）不渲染。因此模板 CSS 无需处理"空标题"。

### 个人信息（始终渲染，位于 `.r-header`）

`.r-header` 含 4 个子块，均为 grid/flex 子项，排布由 CSS 控制（双栏 = 侧栏，单栏 = 顶部块）：

| 子块 | 类名 | 内部结构 |
|------|------|----------|
| 头像 | `.r-avatar` | 仅简历含头像数据（`avatar` 字段）时渲染，内含 `<img>` |
| 姓名区 | `.r-header-text` | `.r-name`（h1，姓名）→ `.r-ename`（英文名，可选）→ `.r-jobtitle`（职位，可选）→ `.r-yoe`（工作年限，可选） |
| 联系方式 | `.r-contact` | `.r-subtitle`（小节标题）+ 多个 `.r-contact-item`（每个含 `.r-contact-label` + `.r-contact-value`） |
| 语言 | `.r-langs` | 仅含语言数据时渲染；`.r-subtitle` + 多个 `.r-lang` |

> 联系方式各项（邮箱/手机/微信/QQ/城市/网站/GitHub/LinkedIn）均为可选，有值才渲染对应 `.r-contact-item`。单栏横向信息带如不需要 `.r-subtitle`，用 `.r-subtitle { display: none; }` 隐藏。

### 教育背景（`.education-item`）

| 元素 | 类名 | 字段 |
|------|------|------|
| 头部 | `.edu-header` | `.edu-school`（学校 · 学位 · 专业 · GPA）+ `.date`（日期范围） |
| 辅修 | `.edu-detail` | `minor` |
| 主修课程 | `.edu-courses` | `courses` |
| 亮点 | `.highlights` > li | `highlights[]` |

### 实习 / 工作 / 项目（`.experience-item`）

三者共用 `.experience-item` 结构，字段略有差异：

| 元素 | 类名 | 实习/工作 | 项目 |
|------|------|-----------|------|
| 头部 | `.exp-header` | `.company`（公司）+ `.title`（职位）+ `.date` | `.company`（项目名）+ `.title`（角色）+ `.date` |
| 地点 | `.exp-location` | 有 | 无 |
| 概述 | `.exp-summary` | 有 | 有 |
| 亮点 | `.highlights` > li | 有 | 有 |
| 扩展字段 | `.extra-row`（`.extra-label` + `.extra-value`） | 无 | 有 |

### 奖项（`.award-item`）

`.award-header`（`.award-title` + `.date`）→ `.award-issuer`（颁发机构）→ `.exp-summary`（说明）。

### 技能（`.skills-grid`）

`.skills-grid` > `.skill-category`（分组）> `h4`（分组名）+ `.skill-item`（单个技能）。`.skill-item` 内含技能名 + `.skill-dots`（`skillLevel` 输出的等级点 `.skill-dot` / `.skill-dot.filled`）。

### 总结（`.summary`）

`.section-title`（"个人总结"）+ `.summary`（多行文本，已 `nl2br` 转 `<br>`）。

### 自定义区块（`.section-title` + `.custom-item`）

每个自定义区块一个 `.section-title`（区块标题），其下多个 `.custom-item`：`h4`（条目标题）+ `.subtitle`（副标题 · 日期）+ `.exp-summary`（描述）+ `.highlights`（亮点）。

## 字段清单

字段用于理解"什么条件下某元素会出现"，模板 CSS 据此决定显隐样式。

### Personal（个人信息）

| 字段 | 类型 | 说明 |
|------|------|------|
| `full_name` | string | 姓名 |
| `english_name` | string | 英文名 |
| `email` / `phone` / `wechat` / `qq` | string | 联系方式 |
| `location` / `website` / `linkedin` / `github` | string | 更多联系方式 |
| `avatar` | string | 头像（Base64 data URI 或文件路径），决定 `.r-avatar` 是否渲染 |
| `job_title` | string | 求职意向/职位 |
| `years_of_exp` | int | 工作年限 |

### Job / Internship（工作/实习，字段相同）

| 字段 | 类型 | 说明 |
|------|------|------|
| `company` | string | 公司名 |
| `title` | string | 职位 |
| `location` | string | 工作地点 |
| `start_date` / `end_date` | string | 起止日期 |
| `is_current` | bool | 是否在职（影响日期显示"至今"） |
| `summary` | string | 概述 |
| `highlights` | []string | 亮点列表 |

### Project（项目）

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 项目名 |
| `role` | string | 担任角色 |
| `url` | string | 项目链接 |
| `start_date` / `end_date` | string | 项目时间 |
| `summary` | string | 项目描述 |
| `highlights` | []string | 亮点 |
| `extras` | []{label, value} | 自定义键值对（`.extra-row`） |

### Education（教育）

| 字段 | 类型 | 说明 |
|------|------|------|
| `school` | string | 学校 |
| `degree` | string | 学位 |
| `major` / `minor` | string | 专业 / 辅修 |
| `start_date` / `end_date` | string | 起止日期 |
| `gpa` | string | GPA |
| `courses` | string | 主修课程 |
| `highlights` | []string | 亮点 |

### SkillGroup / Skill（技能）

| 字段 | 类型 | 说明 |
|------|------|------|
| `category`（分组） | string | 分组名（如"编程语言"） |
| `items[].name` | string | 技能名 |
| `items[].level` | int | 等级 0-5（`skillLevel` 输出等级点） |

### Language（语言）

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 语言名（如"英语"） |
| `level` / `proficiency` | string | 熟练程度 / 补充说明 |

### Award（奖项）

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 奖项名 |
| `date` | string | 获奖日期 |
| `issuer` | string | 颁发机构 |
| `summary` | string | 说明 |

### CustomSection / CustomItem（自定义区块）

| 字段 | 类型 | 说明 |
|------|------|------|
| `title`（区块） | string | 区块标题 |
| `items[].title` | string | 条目标题 |
| `items[].subtitle` | string | 副标题 |
| `items[].date` | string | 日期 |
| `items[].description` | string | 描述（多行） |
| `items[].highlights` | []string | 亮点 |

## 隐藏（Hidden）字段

所有条目类型都有可选的 `Hidden` 字段。**统一 HTML 不渲染 Hidden 守卫，隐藏由数据层统一过滤**（前端 `toGoShape` + 后端 `WithoutHidden`）：

- 被隐藏的条目在渲染前就从数组移除，模板 CSS 完全无感知。
- 区块内所有条目隐藏时，`{{if .Section}}` 使整个区块（含标题）不渲染。
- 个人总结的 `summary_hidden` 同样在数据层处理（隐藏时 `summary` 字段被清空）。
- **模板 CSS 无需、也不应写任何隐藏相关逻辑。**
