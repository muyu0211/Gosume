# AGENTS.md

## 模板系统概述

每个模板是一个独立的子目录，包含**两个文件**：`template.json`（元数据）+ `styles.css`（样式）。简历的**数据形态**由应用内置的**统一 HTML**（`templates/template.html`）承载，模板包不再携带 HTML——这是 Gosume 一期改造的核心约定。

模板分内置模板（`templates/` 目录下，编译时嵌入）和用户模板（存储在 SQLite 中，通过导入或创建产生）。

## 模板目录结构

```
templates/
├── template.html            # 统一 HTML（应用内置，全模板共享，不随模板包分发）
├── <dir-name>/             # 人类可读的目录名（如 modern、classic），与 id 无关
│   ├── template.json       # 模板元数据
│   └── styles.css          # 打印 CSS 样式表
```

## template.json — 元数据规范

所有字段均为必需字段（带 `?` 标记的 `omitempty` 字段除外）。

```json
{
    "id":             "UUID v4（36 字符，格式 8-4-4-4-12），全局唯一标识",
    "name":           "中文名称",
    "name_en":        "英文名称",
    "version":        "语义化版本号（如 1.0.0）",
    "author": {
        "name":       "作者名称",
        "email":      "作者邮箱",
        "url":        "作者网站（选填）"
    },
    "description":     "中文描述，一句话说明适用场景和目标用户",
    "description_en":  "英文描述",
    "category":        "分类：tech / business / creative / academic / general",
    "tags":            ["标签数组，中英文均可，用于前端筛选和搜索"],
    "target_language": ["zh-CN", "en-US"],
    "page_count": {
        "min":         1,
        "max":         5,
        "default":     1
    },
    "paper_size":      "纸张尺寸：A4 / Letter",
    "orientations":    ["portrait"],
    "colors": {
        "primary":     "#主色",
        "secondary":   "#辅色",
        "text":        "#正文颜色",
        "background":  "#背景颜色",
        "accent":      "#强调色（浅色底色块）"
    },
    "features": {
        "avatar":          true,    // 是否支持头像（元数据，渲染不消费）
        "skill_bars":      false,   // 是否显示技能进度条（元数据，暂不消费）
        "qr_code":         false,   // 是否支持二维码（元数据，暂不渲染）
        "links_clickable": true     // 导出 PDF 时链接是否可点击
    },
    "uses_unified_html": true,      // 一期改造迁移标记：true 时渲染使用应用内置 template.html
    "sections": {
        "required":  ["personal", "jobs", "education"],
        "optional":  ["projects", "skills", "languages", "awards", "custom"],
        "layout":    ["personal", "jobs", "education", "skills", "projects", "languages", "awards", "custom"]
    },
    "data_schema": {},       // 各区块的字段级校验规则（选填）
    "css_variables": {}      // 模板特有的 CSS 变量覆盖（选填，key-value 对）
}
```

### 字段规范

| 字段                  | 规范                                                                     |
| ------------------- | ---------------------------------------------------------------------- |
| `id`                | UUID v4 格式（`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`），数据库主键，全局唯一。目录名与之无关。 |
| `version`           | 严格遵循 SemVer，格式 `MAJOR.MINOR.PATCH`                                     |
| `category`          | 必须是以下枚举之一：`tech` `business` `creative` `academic` `general`            |
| `tags`              | 至少包含 3 个标签，中英文混合，纯英文标签使用小写                                             |
| `page_count.min`    | 最小为 1，不得大于 max                                                         |
| `colors`            | 所有颜色值必须为 6 位 HEX（`#RRGGBB`），需保证与白色背景的对比度达标                             |
| `sections.required` | 必须至少包含 `personal`；`jobs` 和 `education` 强烈建议放在 required 中               |
| `sections.layout`   | 指定区块在**前端编辑器**中的展示顺序，**不影响渲染顺序**（渲染顺序由统一 HTML 固定）                      |
| `uses_unified_html` | 一期改造迁移标记。内置模板全部为 `true`；用户模板默认按"无自带 HTML"处理，始终使用统一 HTML                |

## 统一 HTML（template.html）— 布局无关骨架

`templates/template.html` 是唯一的简历 HTML（Go html/template 语法），包含全部数据区块
（personal / education / internships / jobs / projects / awards / skills / languages / summary / custom），
渲染顺序**固定**。

> **隐藏（Hidden）由数据层负责**：统一 HTML 不写 `{{if not .Hidden}}` 守卫。前端渲染前由
> `templateEngine.ts` 的 `toGoShape` 过滤隐藏条目。模板 CSS 无需关心隐藏逻辑。

它输出**稳定的 DOM 契约**（与分页子系统 `paginationCore.ts` 对齐，修改必须同步更新）：

```
<body>                                 ← 中性，不承载任何页面样式（预览外壳可自由重绘 body）
  <div class="resume-page">            ← 单页单元：210mm × 297mm + 页边距 + 白底
    <div class="resume-container">     ← 分页算法的内容包裹层
      <header class="r-header">        ← 个人信息区（本质同类的四子块，排布由 CSS 决定）
        ├─ .r-header-text             ← 姓名/英文名/职位/年限
        ├─ .r-avatar                  ← 头像（仅在简历含头像数据时渲染）
        ├─ .r-contact                 ← 联系方式（含小节标题 .r-subtitle）
        └─ .r-langs                   ← 语言（仅在含语言数据时渲染，含 .r-subtitle）
      <main   class="r-main">          ← 各章节（section-title 与条目为兄弟节点）
    </div>
  </div>
</body>
```

> **分页产物契约（M1 组件级 + M2 行级分页）**：分页核心（`frontend/src/lib/paginationCore.ts`）把放不下当前页剩余空间的条目按内部组件拆分跨页。拆分产物为「头部部分克隆（保留 `data-id`，留在当前页）」+「续接部分克隆（去掉 `data-id`、改打 `data-cont-of="<原data-id>"`，位于续页）」；两类克隆**均复用条目原有类名与** **`data-section`**，模板 CSS 的间距/字体注入规则自动生效，模板无需感知拆分。分页核心对组件的拆分/保留判定采用**通用结构规则**：叶子文本块（无块级子元素）按行断页、含块级子元素的容器按子组件拆分；仅少数「语义整体」组件（`.section-title`、`.exp-header`、`.edu-header`、`.skill-item`、`.skill-dots`）在引擎内登记为整体保留。新增模板组件沿用统一 HTML 的类名契约即可自动接入分页，无需改引擎（除非是「含块级子元素的一行式语义单元」，才需在 `KEEP_WHOLE` 中追加）。

### 模板 CSS 的职责（关键约定）

1. **单栏/双栏完全由 CSS 决定**（分页核心按 `.resume-container` 的 computed `display` 区分）：

   * 双栏：`.resume-container { display: grid; grid-template-columns: <侧栏宽> 1fr; grid-template-areas: "header main"; grid-template-rows: 1fr; }`，
     `.r-header{grid-area:header}`（即侧栏，通高，左/右皆可）、`.r-main{grid-area:main}`。
     侧栏内部用 `grid-template-areas` 竖向排布：头像在上 → 姓名 → 联系方式 → 语言。

   * 单栏：`.resume-container { display: block; }`，`.r-header` 顶部块 → `.r-main` 章节。
     `.r-header` 内部用 `grid-template-areas` 排布四子块——头像位置由 CSS 决定，三选一：

     * **头像右置**：`grid-template-columns: 1fr auto; grid-template-areas: "text avatar" "contact avatar" "langs avatar";`
       （头像独占右侧一列、跨 text/contact/langs 三行；文字/联系方式/语言全部排左列，头像调大不会挤压下方内容）

     * **头像居中**：`grid-template-columns: 1fr; grid-template-areas: "avatar" "text" "contact" "langs"; justify-items: center; text-align: center;`

     * **头像左置**：与右置对称，`grid-template-areas: "avatar text" "avatar contact" "avatar langs";` 即可。
2. **头像**：统一 HTML 仅在简历含头像数据时渲染 `.r-avatar`；**位置完全由 CSS 决定**
   （双栏放侧栏、单栏可右置/居中/左置），不固定。是否显示同样由模板 CSS 决定。
   `features.avatar` 仅为元数据，不参与渲染。
3. **小节标题**：`.r-subtitle`（"个人信息"/"语言"）默认渲染；单栏横向信息带如不需要，
   用 `.r-subtitle { display: none; }` 隐藏（双栏侧栏通常保留）。
4. **章节类名沿用约定**：`.section-title`、`.experience-item`、`.exp-header`、`.exp-location`、
   `.exp-summary`、`.education-item`、`.edu-header`、`.edu-detail`、`.edu-courses`、`.award-item`、
   `.award-header`、`.award-title`、`.award-issuer`、`.skill-category`、`.skill-item`、`.skill-dots`、
   `.skill-dot`、`.skill-dot.filled`、`.highlights`、`.custom-item`、`.subtitle`、`.extra-row`、
   `.extra-label`、`.extra-value`、`.summary`——以继续接入"内容间距档位"注入规则（见下文）。
5. **渲染顺序固定**：教育 → 实习 → 工作 → 项目 → 奖项 → 技能 → 总结 → 自定义。
   如需调序，只能通过 CSS 重排（如 flex/grid `order`），不建议依赖。

### 统一 HTML 支持的模板语法（两侧引擎通用）

`{{.Field}}` 简单路径、`{{if}}`/`{{range}}` + `not/and/or/eq/ne` 条件，
以及辅助函数 `dateRange`、`skillLevel`、`i18n`、`nl2br`、`md`、`mdInline`、`safeHTML`、`safeURL`、`defaultVal`。
模板 CSS 不得依赖任何只在单套 HTML 中出现过的类名/结构。

> `md`（block）与 `mdInline`（inline）为受限子集 Markdown 渲染（段落 + 行内加粗/斜体/
> 链接，block 另含无序/有序列表；单换行转 `<br>`，空行分段），输出已消毒。
> 长文本字段（概述/亮点/总结等）在编辑器内为所见即所得富文本，底层以 Markdown 源码存储，
> 模板统一用 `{{md .Field}}` / `{{mdInline .Field}}` 渲染。编辑器组件见 `frontend/src/components/ui/RichTextField.tsx`，
> 双向转换见 `frontend/src/lib/markdown.ts`。

## styles.css — CSS 样式规范

### 必须遵守

1. **页面尺寸**：`.resume-page` 必须设置 `width: 210mm; min-height: 297mm;`（A4）或对应 Letter 尺寸
2. **CSS 变量**：使用 `:root {}` 定义颜色和字体变量，命名为 `--primary-color`、`--text-color` 等
3. **字体栈**：使用系统安全字体栈，不得引用外部字体

   ```css
   --font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
   ```
4. **打印样式**：必须包含 `@media print` 和 `@page { size: A4; margin: 0; }`
5. **分页支持**：提供 `.page-break { page-break-after: always; break-after: page; }` 工具类
6. **字号单位**：统一使用 `pt`（打印友好），不使用 `px` 作为主要字号单位
7. **颜色值**：CSS 变量中的颜色应与 `template.json` 的 `colors` 字段一致
8. **页边距消费**：`.resume-page`（或双栏模板的内部分区）的 padding 必须通过 CSS 变量消费，
   并带上模板自己的默认值作 fallback：

   ```css
   /* 单栏模板 */
   .resume-page { padding: var(--resume-padding, 14mm 18mm); }
   /* 双栏模板的分栏（header 即侧栏 / main） */
   .r-header { padding: var(--resume-padding-y, 12mm) var(--resume-padding-x, 14mm); }
   ```

   前端按全局布局（页边距 px→mm）注入这些变量（见下方"全局布局"），模板自身不得硬编码页边距。

   > ⚠️ **单栏模板的页边距必须落在** **`.resume-page`** **的 padding 上，不得落在** **`.r-header`/`.r-main`
   > 等内容区自身的 padding 上**。分页与导出管线（`paginationCore.ts` + 导出器）只把 `.resume-page` 的 padding
   > 当作"页边距"来消费/折叠：若页边距分散在内容区，会导致续页无顶边距、PDF 生硬截断、PNG 页间/页尾空白。
   > 需要"全出血"头部时，也不得用负 margin 把头部拉出页面（同样会破坏分页测量与 PNG 连续渲染），
   > 应退化为页面内的一块色块/卡片。
9. **垂直间距方向**：模块内条目与条目内部细节行的节奏间距**一律使用** **`margin-bottom`**，禁止用
   `margin-top` 表达垂直节奏。应用运行时会按"内容间距"档位注入 `margin-bottom` 覆盖规则（带
   `!important`），方向不一致的模板会导致档位调整时组件行为不统一。仅有两类例外允许 `margin-top`：

   * 装饰性元素（时间轴线 `.timeline-line`、强调线 `.exp-accent`、伪元素分隔符等非内容流组件）

   * 文档流末尾的收尾组件（如 `.footer`，其后无兄弟元素，间距只能向上申请）

### 命名约定

| 层级      | 命名方式                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------- |
| 页面容器    | `.resume-page`（内层单页）、`.resume-container`（内容包裹层）                                                         |
| 语义区     | `.r-header`（个人信息区）、`.r-main`（章节区）                                                                       |
| 头部      | `.r-header-text`、`.r-name`、`.r-ename`、`.r-jobtitle`、`.r-yoe`、`.r-avatar`（头像，位置由 CSS 定）                  |
| 联系方式/语言 | `.r-contact`、`.r-contact-item`、`.r-contact-label`、`.r-contact-value`、`.r-langs`、`.r-lang`、`.r-subtitle` |
| 章节标题    | `.section-title`                                                                                        |
| 经历条目    | `.experience-item`、`.exp-header`、`.exp-summary`                                                         |
| 教育条目    | `.education-item`、`.edu-header`、`.edu-detail`                                                           |
| 技能      | `.skills-grid`、`.skill-category`、`.skill-item`、`.skill-dots`、`.skill-dot`、`.skill-dot.filled`           |
| 亮点列表    | `.highlights`、`.highlights li`                                                                          |
| 自定义区块   | `.custom-item`                                                                                          |

### 必选样式元素

* `.skill-dot` 和 `.skill-dot.filled`：技能等级指示点（`skillLevel` 函数依赖这两个类）

* `.page-break`：分页控制

* 链接样式：导出的 PDF 中链接应有明显的颜色区分

### 全局布局（页边距与内容间距）

样式定制以 **per-resume custom\_css**（`resume.custom_css`）承载，px 数值由前端生成器 `buildCustomCss` 生成，
渲染时前端按 `25.4/96` 换算为 mm 注入（页边距为 `--resume-padding[-y/-x]`，内容间距/头像尺寸的 `!important` 覆盖规则由前端 customCss.buildCustomCss 在数值存在时动态注入 `<style id="resume-custom">`）。
**`templates/resume-global.css`** **是对所有模板生效的静态全局样式**（Markdown 列表收敛，且为内容间距选择器契约的唯一文档源）——Gosume 三期改造。

> 数值型 `!important` 覆盖规则不放进静态全局 CSS：写成 `var(--sp-item)` 且变量未注入时，按 CSS 规范会计算为属性初始值（margin-bottom:0 / 头像 auto）而非被丢弃，导致缩略图与 normal/nil 档位间距塌陷、默认头像失控；故改由运行时 gated 注入。

> **页边距消费的单栏 / 双栏差异**：单栏页边距落在 `.resume-page` 的 `padding: var(--resume-padding, …)`；双栏 `.resume-page` 无 padding，页边距由 `.r-header`（侧栏，通高出血）与 `.r-main` 各自的 `padding: var(--resume-padding-y) var(--resume-padding-x, …)` 分栏消费。全局 CSS 只承担两条路径都要的公共逻辑，**不接管** `.r-header`/`.r-main` 的 padding（模板私有）。

**内容间距的三层注入规则**（选择器契约见 `templates/resume-global.css`，数值由前端 customCss.buildCustomCss 在存在时注入）：

| 层级      | 覆盖选择器                                                                                                             | 说明                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 模块 ↔ 模块 | `* + .section-title`（`margin-top`）                                                                                | 各板块标题与上一板块的间距                                   |
| 条目 ↔ 条目 | `.experience-item` `.education-item` `.award-item` `.custom-item` `.skill-category` `.skill-item` `.sidebar-item` | 模块内条目间距，以及 `.section-title` 自身的 `margin-bottom` |
| 细节 ↔ 细节 | `.exp-header` `.exp-location` `.exp-summary` `.highlights li` `.edu-detail` `.edu-courses` `.extra-row`           | 条目内部各行的间距                                       |

模板设计要点：

* 新模板只要沿用上述类名，即自动接入内容间距；使用其他类名的组件不参与调整

* 条目/细节类组件的原始 `margin-bottom` 值是模板作者设计的默认节奏，应与相邻组件视觉协调

* 模块末尾条目的 `margin-bottom` 会被运行时归零（`*:has(+ .section-title)`），模块间距由 `* + .section-title` 的 `margin-top` 单独控制，不会叠加

## 模板包格式（.zip）

用于用户间分享模板的 ZIP 打包格式。

### 文件结构

```
<template-name>.zip
├── template.json                 # 即 template.json 的内容
└── styles.css
```

> 历史模板包若仍含 `template.html`：导入时**宽松忽略**该文件，只取 css+json
> （Gosume 一期改造：统一 HTML 由应用内置，用户无法再通过 HTML 干预数据形态）。

### 打包规范

* 文件名必须以`.zip` 结尾

* 压缩包总大小 ≤ 10MB

* 单个文件 ≤ 2MB

* 仅包含根目录下的文件，不含子目录

* 文件名必须精确匹配 `template.json` / `styles.css`

* `template.json` 中的 `id` 必须与已有模板不冲突

### 创建模板包

```bash
# 将模板的两个文件打包为zip压缩包
zip my-template.zip template.json styles.css
```

## 新建模板清单

创建新模板时，按以下步骤执行：

1. 在 `templates/` 下创建 `templates/<dir-name>/` 目录（目录名使用 kebab-case 即可，如 `modern-pro`）
2. 编写 `template.json`：填写完整元数据，`id` 字段使用 UUID v4（与目录名无关），
   `uses_unified_html` 置 `true`（使用应用内置统一 HTML）
3. 编写 `styles.css`：适配统一 HTML 骨架（`r-header`/`r-main`），定义 A4 页面尺寸、
   CSS 变量、单栏/双栏 Grid（头像位置用 `grid-template-areas` 控制）、打印样式、技能点样式
4. 验证：在应用中通过编辑器实时预览检查各区块显示效果（预览与导出均走统一 HTML + 本模板 CSS）
5. 验证导出：导出 PDF 检查打印效果、分页、链接可点击性
6. 打包分发（可选）：`zip <template-name>.zip template.json styles.css`

## 禁止事项

* 不得在模板包中携带 `template.html`（统一 HTML 由应用内置，用户模板的 HTML 一律被忽略）

* 不得在 CSS 中引用外部资源（CDN 字体、外部图片等）

* 不得使用 `@import` 引入外部样式表

* 不得依赖统一 HTML 之外的类名/结构（如旧版 `.sidebar`、`.header-left`、`.contact-info` 等仅存在于单套 HTML 中的类）

* 不得省略 `data_schema` 中的验证规则（如果模板对某些字段有特殊要求）

* 不得使用非 `pt`/`mm` 单位作为核心字号和间距单位（`px` 仅限细微调整）

* 不得修改其他模板的文件

