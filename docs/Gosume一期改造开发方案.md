# Gosume 一期改造 · 开发方案

> 配套 PRD：`docs/Gosume一期改造PRD.md`
> 状态：**已按本方案实施完成（M1–M4 全部落地）**，见 §9 实施记录。


## 1. 目标与范围

**目标**：移除每个模板包独立维护的 `template.html`，在应用内使用**一个统一 HTML 文件**承载所有简历的数据形态与数据逻辑；模板制作者只需提供 `template.json` + `styles.css`。单栏/双栏、头像有无等差异，**全部由 CSS 控制**，用户无法通过 HTML 干预数据形态。

**本期范围（来自 PRD）**：
- 改造简历模板（内置 16 套 + 用户模板）的数据/逻辑承载方式。
- 改造导入时的校验逻辑（预期会**简化**）。
- 模板生成 SKILL（`gosume-template-skills/`）**不在本期**，等本期完成后再用另外的 PRD 改造。

**不在本期**：QR 码渲染、技能条/点切换逻辑、`features` 标志的语义化消费（见 §6 风险与假设）。

---

## 2. 现状分析（关键结论）

### 2.1 当前模板结构
每个内置模板是一个目录，含三件套：`template.json` / `template.html` / `styles.css`。`template.html` 是 Go `html/template`，负责"有什么数据、数据怎么显隐"（`{{if}}`/`{{range}}` + 辅助函数）。16 套模板的 HTML 结构彼此不同：
- 单栏（如 `modern`/`classic`）：`.header`(姓名+联系方式+头像) + 各 `.section-title` 顺序堆叠。
- 双栏（如 `split`）：`.sidebar`(头像/姓名/职位/联系方式/语言) + `.main-content`(各章节)。
- 章节集合是**超集一致**的：所有模板都覆盖 `Personal / Education / Internships / Jobs / Projects / Awards / Skills / Languages / Summary / Custom`，且都只用受支持的模板语法（`dateRange`、`skillLevel`、`i18n`、`nl2br`、`safeURL`、`safeHTML`、`defaultVal`、`{{if}}`/`{{range}}` 简单条件）。→ 统一 HTML 是"各模板 HTML 的并集"，语法上兼容现有两套引擎。

### 2.2 两条渲染链路（都必须改造）
| 链路 | 入口 | 用途 | 当前取 HTML 来源 |
|------|------|------|------------------|
| 前端引擎 | `frontend/src/lib/templateEngine.ts` → `renderTemplate()` | 实时预览、导出分页、缩略图 | `loadTemplateContent()` 返回每模板的 `template.html` |
| 后端渲染器 | `pkg/render/html.go` → `HTMLRenderer.Render()`，被 `ResumeService.Render` 调用 | 后端渲染简历 | `Template.HTML`（每模板各自的 HTML） |

两条链路都通过 `{{template "styles.css" .}}` 内联 CSS，且都只支持同一组模板函数/表达式。**统一 HTML 必须同时被这两条链路消费**，否则预览与导出/后端渲染会出现不一致。

### 2.3 导入与校验
- `pkg/template/package_importer.go`：`LoadPackageFromZip` 要求 zip 内**必须含** `template.json`/`template.html`/`styles.css`；`ValidatePackage` 执行 `validateTemplateExecution`（用样本数据实际跑一遍 HTML）+ `validatePreviewCompatibleSyntax`（限制前端引擎支持的语法）。
- `pkg/store/template_store.go`：`templates` 表有 `html TEXT` 列；`syncBuiltins` 把每个内置模板的 html 读入并做 hash 同步；`Create/Update` 写入 html。
- PRD 明确要求"导入校验逻辑应简化"——去掉 HTML 执行/语法校验正是简化点。

### 2.4 `features` 标志现状（重要）
`template.json` 的 `features.avatar / skill_bars / qr_code / links_clickable` 当前**仅作为元数据透传**（前端 `GetTemplateMeta.Features`），渲染器从不据此改变输出：
- 没有任何模板真正渲染 QR 码（`qr_code` 全为 `false`，仅 `split` 为 `true` 但未实现）。
- 技能点（`skillLevel`）始终渲染圆点，`skill_bars` 未被消费。
- 头像由 `{{if .Personal.Avatar}}` 控制，**不读** `features.avatar`。
→ 结论：统一 HTML 是否要"尊重 `features` 标志"是一个**待确认的设计点**（见 §5 与文末提问）。

### 2.6 `features` 标志现状核对（2026-08-15 补充）

> 本节为代码核对结果，并落实产品指令："保留 `features` 字段，但现有/新增逻辑都不得依赖它；若现有模板依赖 `features`，则列入本期改造"。

**核对结论**：
- 字段定义保留在 `pkg/template/loader.go::TemplateFeatures`（`avatar`/`skill_bars`/`qr_code`/`links_clickable`）与 `frontend/src/types/template.ts::features`；仅作为**元数据透传**（经 `TemplateService.GetTemplateMeta.Features` 暴露给前端），**无任何渲染逻辑消费**（已 grep `pkg/render/*.go` 与全部 `templates/*.html`：0 命中 `.Features` / `features.` / `qr_code` / `skill_bars` / `links_clickable`）。
- 全部 16 套内置模板 JSON 均声明了 `features`；头像由 `{{if .Personal.Avatar}}` 控制（不读 `features.avatar`），技能点恒由 `skillLevel` 渲染圆点（不读 `skill_bars`），QR 码从未渲染（即便 `split` 声明 `qr_code:true` 也实际不渲染），链接不加 `clickable` 行为（不读 `links_clickable`）。
- **现有模板 HTML 不依赖 `features`**（无代码读取该字段）。但存在"声明与真实渲染语义错位"的隐患：`split` 声明 `qr_code:true` 却从不渲染；各模板 `skill_bars` 有 true/false 之分但渲染表现无差异。这些声明在统一 HTML（仅 json+css 两件套）后会变成**无对应行为的死元数据**，可能误导模板制作者以为"设了 `qr_code` 就会出现二维码"。

**处理原则（已采纳）**：
1. **保留** `features` 字段定义（Go 模型与前端类型均不删除）。
2. **冻结依赖**：本期及统一 HTML 后，任何渲染/预览/导出逻辑**不得**读取 `features.*` 来决定输出（延续现状）。
3. **本期改造项**：将 16 套内置模板 JSON 的 `features` 声明**对齐到真实渲染语义**（或统一收敛为占位默认值），消除"声明≠行为"的误导；统一 HTML 草案不引入任何 `features` 分支。详见 §4.6 与 §7 步骤 M1。

### 2.5 已实现功能盘点（模块隐藏）—— ⚠️ 与本文原假设的差异

> 本节为代码核对后的纠正项。本文早期版本（及部分规划讨论）将"模块隐藏（Hidden）"列为本期需新增的能力；经核对当前代码，**该能力已完整实现，无需在本期重复开发**。

**后端模型**：`pkg/model/` 下 `Education`、`Job`、`Internship`、`Project`、`SkillGroup`、`Skill`、`Language`、`Award`、`CustomSection`、`CustomItem` 均已带 `Hidden *bool`（omitempty）；`Resume` 顶层带 `SummaryHidden *bool`。语义为"true 时从渲染中省略该条目"。

**模板守卫**：全部 16 套内置 `template.html` 已普遍使用 `{{if not .Hidden}}…{{end}}`（已抽查 `modern`、`split` 确认），且支持 `{{if and .Summary (not .SummaryHidden)}}` 这类组合条件。

**前端**：6 个 Section 组件已提供"在简历中显示"复选框（隐藏时灰化 + 删除线 + "已隐藏"标签）；`frontend/src/lib/templateEngine.ts` 的 `toGoShape()` 在数据层**已经 drop 掉 `Hidden:true` 的条目**（注释原文：`The per-item {{if not .Hidden}} guards in the templates become redundant but remain harmless`）。

**结论与对本期的影响**：
1. **模块隐藏不是本期工作项**，应从本期改造清单剔除，避免重复劳动与重复 UI。
2. **模板守卫冗余**：因前端 `toGoShape` 已丢弃隐藏条目，模板内的 `{{if not .Hidden}}` 实际恒为 true。→ 在 §3 统一 HTML 时建议**明确不再写 Hidden 守卫**，隐藏完全由数据层（前端 `toGoShape` + 后端渲染对应过滤）处理，使骨架更干净（见 §3.4 与 R5）。
3. **后端渲染链路需对齐**：前端引擎已做数据层 drop；后端 `pkg/render/html.go` 的 `toTemplateData` 当前**未**做同等 drop，导出/后端渲染依赖模板 `{{if not .Hidden}}` 守卫。统一 HTML 后守卫移除，必须确认后端渲染也走数据层过滤，否则隐藏条目会在导出时出现（对拍测试 R3 需覆盖此场景）。

---

## 3. 核心设计：统一 HTML（草案）

### 3.1 单一数据源
新增 **`templates/template.html`**（一个 Go 模板，同时被前端引擎与后端渲染器消费）。所有模板**不再各自持有 HTML**；`template.json` + `styles.css` 决定"长什么样"，`template.html` 决定"有什么数据、怎么显隐"。

### 3.2 布局无关骨架（**已确认：CSS Grid 命名区域**）

> 与产品确认采用此方案：统一 HTML 只输出语义块，单栏/双栏完全由每套模板的 CSS 经 `grid-template-areas` 决定。
统一 HTML 只输出**语义块**，不决定单栏/双栏。用 CSS Grid 命名区域让每套模板的 CSS 自行决定排布：

```html
<!DOCTYPE html>
<html lang="{{.Meta.Language}}">
<head>
  <meta charset="UTF-8">
  <title>{{.Personal.FullName}} - 简历</title>
  <style>{{template "styles.css" .}}</style>
</head>
<body class="resume-page">
  <!-- 头部：姓名/英文名/职位/工作年限 -->
  <header class="r-header">
    <h1>{{.Personal.FullName}}</h1>
    {{if .Personal.EnglishName}}<div class="r-ename">{{.Personal.EnglishName}}</div>{{end}}
    {{if .Personal.JobTitle}}<div class="r-jobtitle">{{.Personal.JobTitle}}</div>{{end}}
    {{if .Personal.YearsOfExp}}<div class="r-yoe">{{.Personal.YearsOfExp}} 年经验</div>{{end}}
  </header>

  <!-- 侧栏候选区：头像 / 联系方式 / 语言（双栏模板用作 sidebar；单栏模板由 CSS 横向铺开） -->
  <aside class="r-aside">
    {{if .Personal.Avatar}}<div class="r-avatar"><img src="{{safeURL .Personal.Avatar}}" alt="头像" /></div>{{end}}
    <div class="r-contact">
      {{if .Personal.Email}}<span class="r-contact-item">邮箱：{{.Personal.Email}}</span>{{end}}
      {{if .Personal.Phone}}<span class="r-contact-item">手机：{{.Personal.Phone}}</span>{{end}}
      {{if .Personal.Wechat}}<span class="r-contact-item">微信：{{.Personal.Wechat}}</span>{{end}}
      {{if .Personal.QQ}}<span class="r-contact-item">QQ：{{.Personal.QQ}}</span>{{end}}
      {{if .Personal.Location}}<span class="r-contact-item">城市：{{.Personal.Location}}</span>{{end}}
      {{if .Personal.Website}}<span class="r-contact-item">网站：{{.Personal.Website}}</span>{{end}}
      {{if .Personal.GitHub}}<span class="r-contact-item">GitHub：{{.Personal.GitHub}}</span>{{end}}
      {{if .Personal.LinkedIn}}<span class="r-contact-item">LinkedIn：{{.Personal.LinkedIn}}</span>{{end}}
    </div>
    {{if .Languages}}
    <div class="r-langs">
      {{range .Languages}}{{if not .Hidden}}
      <span class="r-lang">{{.Name}}{{if .Level}} · {{.Level}}{{end}}</span>
      {{end}}{{end}}
    </div>
    {{end}}
  </aside>

  <!-- 主区：章节（固定顺序；顺序调整见 §6 假设） -->
  <main class="r-main">
    {{if .Education}}{{/* ... 教育：school/degree/major/gpa/minor/courses/highlights ... */}}{{end}}
    {{if .Internships}}{{/* ... 实习 ... */}}{{end}}
    {{if .Jobs}}{{/* ... 工作 ... */}}{{end}}
    {{if .Projects}}{{/* ... 项目（含 Extras） ... */}}{{end}}
    {{if .Awards}}{{/* ... 奖项 ... */}}{{end}}
    {{if .Skills}}{{/* ... 技能（skillLevel 圆点） ... */}}{{end}}
    {{if and .Summary (not .SummaryHidden)}}<div class="section-title">个人总结</div><div class="summary">{{nl2br .Summary}}</div>{{end}}
    {{if .Custom}}{{/* ... 自定义区块 ... */}}{{end}}
  </main>
</body>
</html>
```

**单栏 CSS 示例**：`body.resume-page{display:block}` → `r-header`、`r-aside`(横向 flex 铺开)、`r-main` 顺序堆叠。
**双栏 CSS 示例**：`body.resume-page{display:grid; grid-template-columns:1fr 2fr; grid-template-areas:"aside header" "aside main";}` 并将 `.r-aside{grid-area:aside}`、`.r-header{grid-area:header}`、`.r-main{grid-area:main}`。

> 该骨架为**推荐草案**，是否采纳 / 是否采用 Flex+order 替代 Grid 命名区域，需确认（见文末提问 Q1）。

### 3.3 文本与类名归一（需注意的副作用）
- 原各模板联系方式文案不一致（有的带"邮箱："前缀，有的不带）。统一 HTML 必须固定一套文案/类名，原模板的差异化文案将消失（属预期内的"形态统一"）。
- 章节标题沿用既有约定类名（`.section-title`、`.experience-item`、`.education-item`、`.skill-dot` 等），以继续接入"内容间距档位"注入规则（`templates/AGENTS.md` 布局档位小节）。
- 统一 HTML 仅使用现有受支持语法；不引入 `{{define}}`/`{{block}}`/管道等前端引擎不支持的写法。

### 3.4 Hidden 守卫去留（基于 §2.5 结论）

既定方案：**统一 HTML 不再写任何 `{{if not .Hidden}}` / `{{if and .Summary (not .SummaryHidden)}}` 守卫**，模块显隐完全由数据层过滤负责。理由：

- 前端引擎 `templateEngine.ts::toGoShape` 已经 drop `Hidden:true` 的条目，模板守卫恒为 true，属冗余（§2.5 已确认）。
- 移除守卫后骨架更简洁，且避免"前端靠数据层、后端靠模板守卫"的双轨不一致。

**必须同步（否则导出回归）**：
- 后端 `pkg/render/html.go::toTemplateData` 当前未做 Hidden drop，依赖模板守卫。统一 HTML 移除守卫后，需在 `toTemplateData` 中补齐与前端 `toGoShape` 等价的 Hidden 过滤（含 `SkillGroup.Items` 过滤、整组全隐时组级 Hidden、顶层 `SummaryHidden` drop `summary`）。
- 该过滤逻辑建议抽成单一共享函数（前端/后端各实现一份但语义一致），并由 §6 R3 对拍测试覆盖"隐藏条目在预览与导出中均不出现"。

---

## 4. 改造清单（文件级）

### 4.1 新增
- `templates/template.html`：统一 HTML 模板（单一数据源）。
- （可选）`frontend/src/lib/unifiedTemplate.ts`：dev 模式下导出统一 HTML 字符串（见 4.3）。

### 4.2 删除
- 16 个内置模板目录下的 `template.html`：`academic/bold/classic/compact/creative/executive/gradient/ink/leaf/minimal/modern/split/swiss/terminal/timeline/zen`。

### 4.3 前端
- `frontend/src/services/templateService.ts`：
  - dev 兜底 `import.meta.glob('../../templates/*/template.html')` 改为加载**单一** `template.html`（如 `import unifiedHtml from '../../templates/template.html?raw'`）。
  - `loadTemplateContent(id)` 返回 `{ html: unifiedHtml, css: entry.css }`（不再按模板取不同 HTML）。
- `frontend/src/lib/templateEngine.ts`：若统一 HTML 仅用受支持语法，则**无需改**；按 Q2/A5/A6 `features` 不消费，**不注入任何 body class**，本条无需实施。
- `frontend/src/hooks/usePreview.ts`、`thumbnailService.ts`、`lib/exportHtml.ts`：按 Q2/A5/A6 `features` 不消费，**不注入 body class**，本条无需实施。

### 4.4 后端（Go）
- `pkg/render/html.go`：`HTMLRenderer` 不再读 `tmpl.HTML`，改为使用**统一 HTML 常量**（应用启动时加载 `template.html`）＋ 按模板注入 `styles.css`。
- `pkg/service/template_service.go`：
  - `GetTemplateContent` 返回 `{ html: unifiedHTML, css: t.CSS }`。
  - `CreateTemplate/UpdateTemplate/CloneTemplate` 去掉 `html` 参数（模板不再含 HTML）。
  - `importTemplatePackageFromPath` 改为从包中取 css+json，不再取 html。
- `pkg/store/template_store.go`：
  - `Create/Update/syncBuiltins` 不再写入每模板 html（表 `html` 列保留以兼容历史 SQL，但统一写统一 HTML 常量或留空并被渲染器忽略）。
  - `hashContent` 的 hash 输入去掉 html（改 html+css+meta → css+meta），避免每次升级统一 HTML 导致全部内置模板被重刷（可选：仅当 css/json 变化才视为变更）。
- `pkg/template/package_importer.go`（§5 重点）：移除 `template.html` 必填与 `validateTemplateExecution`/`validatePreviewCompatibleSyntax` 对 HTML 的校验。
- `pkg/template/loader.go`：`Template.HTML` 字段语义改为"统一 HTML（由渲染器注入）"，或保留但渲染器统一覆盖。
- `main.go`：通过 `//go:embed` 把 `template.html` 提供给 `TemplateService`/`HTMLRenderer`（可放在 `builtinTemplates` FS 的 `templates/template.html` 路径下读取）。

### 4.5 测试与文档
- `pkg/template/package_importer_test.go`：移除/改写依赖 `template.html` 的用例（如"含 `{{safeURL .Personal.Avatar}}` 的 HTML 被拒"等），改为"仅 css+json 的包可通过"。
- `templates/AGENTS.md`：模板规范改为"两件套（json+css）+ 统一 HTML 由应用内置"；补充"布局无关 / 单双栏靠 CSS"编写约定。
- 本方案文档随 PRD 归档于 `docs/`。

### 4.6 `features` 字段处理（基于 §2.6 / A6 / R9）

**原则**：保留 `features` 字段定义（Go 模型 `TemplateFeatures`、前端 `types/template.ts`、导入校验枚举均不动）；本期及统一 HTML 后**任何逻辑不得读取 `features.*`** 决定输出。

**本期改造项（列入 M1）**：
- 16 套内置模板 JSON 的 `features` 声明**对齐真实渲染语义**，消除"声明≠行为"误导，统一收敛为占位默认值，建议规则：
  - `avatar`：按模板是否实际渲染头像（统一 HTML 仅 `{{if .Personal.Avatar}}`，与 CSS 是否显隐无关）→ 统一为 `true`（所有模板都"支持"头像，显隐由 CSS）。
  - `skill_bars`：真实渲染恒为圆点（`skillLevel`），无条形 → 统一为 `false`（或保留但文档注明"当前恒为圆点"）。
  - `qr_code`：真实从不渲染 → 全部收敛为 `false`（重点修正 `split` 误标的 `true`）。
  - `links_clickable`：真实无 `href`/点击行为 → 统一为 `false`。
- `templates/AGENTS.md` 模板规范补充："`features` 为元数据占位，本期不参与渲染；模板制作者不应据此假设特殊行为。"
- 在 `package_importer.go` 的 `validateMeta` 中**不**对 `features` 取值做渲染侧校验（保持纯结构校验），并注释说明 `features` 当前为透传字段。
- 如后续需让某 `features` 真正生效，单独开 PRD，不在本期。

---

## 5. 导入校验逻辑简化（PRD 重点）

`LoadPackageFromZip` 改造后：
1. 必含文件由 `template.json` + `template.html` + `styles.css` 改为 **`template.json` + `styles.css`**。
2. 若 zip 内**额外**含 `template.html`：**忽略**，只取 css+json（已确认采用宽松策略，见文末决策记录）。
3. `ValidatePackage` 简化为：
   - `validateMeta`（json 结构/枚举/ID 格式）——保留。
   - `styles.css` 非空 + 基础 CSS 合法性（如包含 `@page`/页面尺寸，或仅做非空与大小检查）——保留并弱化。
   - **删除** `validateTemplateExecution`（不再有用户 HTML 可跑）与 `validatePreviewCompatibleSyntax`（HTML 已统一、不可被用户破坏）。
4. 包体大小/单文件大小限制保留。

> 简化收益：用户导入失败率显著下降（PRD 背景所述"用户自制模板导致导入/渲染失败"的根因被消除，因为 HTML 不再来自用户）。

---

## 6. 风险、假设与待确认点

### 假设（如不同意请指出）
- **A1**：统一 HTML 用**固定章节渲染顺序**（教育→实习→工作→项目→奖项→技能→总结→自定义）。`sections.layout` 仅用于编辑器展示顺序，不影响渲染——与现状一致，安全。
- **A2**：`qr_code` 不渲染（现状即如此），本期不新增 QR 码能力。
- **A3**：技能点始终渲染圆点（`skill_bars` 不消费），本期不改。
- **A4**：已存在的用户模板（DB 中带旧 html）自动忽略其 html，改用统一 HTML + 其 css；视觉以统一骨架为准（可能有细微变化）。
- **A5**（已确认）：头像控制采用"**仅数据存在 + CSS**"——统一 HTML 仅在简历含头像时渲染，是否显示完全由模板 CSS 决定；`features.avatar` 维持元数据，渲染器不消费。
- **A6**（已确认）：`features` 字段**保留定义但冻结依赖**——Go 模型与前端类型保留 `features`；本期及统一 HTML 后任何逻辑都不得读取 `features.*` 决定输出；现有 16 套模板 JSON 的 `features` 声明需对齐真实渲染语义（消除"声明≠行为"误导），列入本期改造（见 §2.6、§4.6）。

### 风险
- **R1（最大工作量）**：16 套内置 `styles.css` 需改写为"布局无关"，即按 §3.2 骨架的语义类名重写单栏/双栏排布。这是本期主要人力，且需要逐套视觉回归（预览 + 导出 PDF）。
- **R2**：统一 HTML 固定了联系方式文案/类名，部分模板观感会变（属 PRD 预期的"形态统一"，但需产品确认可接受）。
- **R3**：前端引擎与后端渲染器对统一 HTML 的解析必须**严格一致**，否则预览与导出/后端渲染错位。需补充"同一简历 + 同一模板"在两条链路输出对拍的测试；**特别要覆盖模块隐藏场景**（见 §2.5 / §3.4：前端靠 `toGoShape` drop，后端靠 `toTemplateData` 过滤，两处语义必须等价）。
- **R4**（已消解）：头像控制已确认"仅数据存在 + CSS"，`features.*` 标志本期不消费，统一 HTML 与两套渲染器无需注入 body class，复杂度可控。
- **R5（新增·回归风险，最高优先级）**：统一 HTML 是 16 套模板的"并集重写"，任一模板视觉结果不可变。当前仅"能编译/能渲染"的校验不足，必须建立**渲染快照回归（golden HTML / 像素 diff）**：对每套内置模板用代表性简历数据在两条链路各渲染一次，与改造前输出做结构+视觉 diff。建议作为 M1 验收门槛，否则回归只能靠人工肉眼，风险极高。
- **R6（新增·双栏结构差异被低估）**：原 `split` 等双栏模板把"语言/联系方式"塞进 `.sidebar`，而 `modern` 等单栏模板把语言放在正文 inline-list。这是**结构差异而非纯 CSS 差异**。§3.2 草案用统一 `r-aside` 语义块承载头像/联系方式/语言，要求双栏与单栏都接受"语言在 aside"的固有布局；若某单栏模板原本语言在正文，统一后其观感受骨架约束（属预期内的形态统一，但需在 M1 样板阶段用 real 双栏/单栏模板验证，确认 `r-aside` 在单栏 CSS 下能横向铺开且不破坏原排版）。
- **R7（新增·Go 模型字段命名统一前置）**：现有模板/数据存在字段命名不一致（如 `GitHub` vs `Github`、`Location` 等），统一 HTML 前必须先**冻结并统一 Go 模型字段名**（breaking change，影响所有旧 resume 数据）。需先写字段统一清单 + 数据迁移，再写统一 HTML，否则 16 套 CSS 与统一 HTML 会反复返工。
- **R8（新增·旧用户模板包兼容）**：历史导入的用户模板存于 SQLite（带旧结构 html）。A4 假设其 html 被忽略、改用统一 HTML + 其 css；但因 R7 字段改名，旧包的 css 可能引用被改名的字段选择器/文案，需在 M2 导入改造时评估并提供兼容/迁移策略，避免老用户模板渲染错位。
- **R9（新增·`features` 语义对齐）**：16 套内置模板 JSON 的 `features` 声明与真实渲染存在错位（`split` 标 `qr_code:true` 却不渲染、`skill_bars` true/false 无差异等），统一 HTML 后会成为误导性的死元数据。本期需在 M1 样板阶段统一收敛为与真实渲染一致的占位声明（如全部 `qr_code:false`、`skill_bars` 按实际圆点表现统一标注），并在导入校验/文档中明确"本期 `features` 仅供元数据展示、不参与渲染"，防止模板制作者误判。

---

## 7. 实施步骤（建议节奏）

> 顺序原则：**先做前置（字段统一 + 回归基线），再动统一 HTML；统一 HTML 与导入/存储改造解耦为两条独立线**，避免回归风险与接口改动互相纠缠（见 §6 R5/R7）。

0. **前置·字段统一（里程碑 M0，独立且优先）**：盘点 Go 模型字段命名不一致清单（如 `GitHub`/`Github`、`Location` 等），冻结统一命名；写数据迁移脚本（旧 resume 数据字段重映射）。完成后方可进入 M1。——对应 R7。
0. **前置·回归基线（里程碑 M0b）**：在改动任何模板前，对 16 套内置模板用代表性简历数据，在**两条链路**（前端引擎 + 后端渲染器）各渲染一次，固化"改造前 golden 输出"（HTML 结构快照 + 关键模板 PDF 截图）。作为 R5 的对比基准。
1. **骨架与样板（里程碑 M1）**：写 `template.html`（按 §3.4 不写 Hidden 守卫；按 §4.6 不引入任何 `features` 分支）；选 1 套单栏（如 `modern`）+ 1 套双栏（如 `split`）改写 `styles.css` 适配 §3.2 骨架；**对齐 16 套内置模板 JSON 的 `features` 声明至真实渲染语义（§4.6）**；打通前端引擎 + 后端渲染器读取统一 HTML；补两条链路对拍测试（含隐藏场景 R3）；**M1 验收门槛 = 样板模板渲染 diff 不超出预期**（R5/R6/R9）。
2. **导入/存储改造（M2，可与 M1 并行）**：改 `package_importer.go` 简化校验（§5）；改 `template_service.go`/`template_store.go` 去 html；改 dev glob；评估旧用户模板包兼容（R8）。
3. **全量内置模板迁移（M3）**：其余 14 套 `styles.css` 逐一改写 + 预览/导出回归（按 3~4 套一批），每批与 M0b 基线 diff。
4. **清理与文档（M4）**：删 16 个 `template.html`；更新 `AGENTS.md`、测试用例；收尾。

> 已确认采用"先样板验证再分批"节奏（M1→M3）；新增 M0/M0b 前置里程碑（字段统一 + 回归基线）为本次文档更新补充，因 R5/R7 风险而必要。

---

## 7.1 本期已排除项（避免重复开发）

- **模块隐藏（Hidden）**：见 §2.5，已由现有代码完整实现，**不列入本期改造清单**，亦不新增 UI/模型。
- 统一 HTML 内的 Hidden 守卫按 §3.4 移除（属已有逻辑的清理，不是新功能）。

---

## 8. 决策记录（已与产品确认）

| 编号 | 决策点 | 结论 |
|------|--------|------|
| Q1 | 统一 HTML 布局骨架 | **CSS Grid 命名区域**：统一 HTML 只输出 header/aside/main 语义块，单栏/双栏完全由每套模板 CSS 经 `grid-template-areas` 决定。 |
| Q2 | 头像显示控制 | **仅数据存在 + CSS**：统一 HTML 仅在简历含头像时渲染；是否显示由模板 CSS 决定；`features.avatar` 维持元数据，渲染器不消费。 |
| Q3 | 导入包向后兼容 | **宽松**：zip 内若仍含 `template.html` 则忽略，只取 css+json；老用户包仍可导入。 |
| Q4 | 改造节奏 | **先样板验证再分批**：先写 `template.html` 并改造 modern/split 两套样板打通双链路回归，再分批迁移其余 14 套。 |
| Q5 | 模块隐藏是否本期新增 | **否**：经代码核对（§2.5）该能力已实现，本期不重复开发、不新增 UI/模型。 |
| Q6 | 统一 HTML 的 Hidden 守卫 | **移除**：统一 HTML 不写 `{{if not .Hidden}}` 类守卫，隐藏完全由数据层（前端 `toGoShape` + 后端 `toTemplateData` 过滤）负责；后端渲染需补齐等价过滤。 |
| Q7 | 实施前置里程碑 | **新增 M0（字段命名统一）+ M0b（回归基线）**：先冻结并统一 Go 模型字段名 + 写数据迁移，先固化改造前 golden 渲染；再进入 M1 统一 HTML。 |
| Q8 | 双栏结构差异 | **接受骨架约束**：统一 HTML 用 `r-aside` 语义块承载头像/联系方式/语言，双栏与单栏均按此布局；单栏模板原"语言在正文"的排版让位于骨架（属预期形态统一），M1 样板阶段验证 `r-aside` 单栏横向铺开可行。 |
| Q9 | `features` 标志处理 | **保留字段、冻结依赖、本期对齐声明**：`features` 定义保留（Go 模型/前端类型/导入校验均不动）；本期及统一 HTML 后任何逻辑不读取 `features.*` 决定输出；现有 16 套模板 JSON 的 `features` 声明需对齐真实渲染语义（消除"声明≠行为"误导，如 `split` 的 `qr_code` 误标），列入 M1 改造（见 §2.6 / §4.6 / R9）。 |

> 以上八点已确认，方案其余部分（§1–§7.1）按此结论执行。未启动开发。

---

## 9. 实施记录（一期改造已完成）

> 本次会话按本方案执行了 M1–M4 核心改造，全部落地并通过验证。以下记录实际实现、验证结果与对方案的偏差。

### 9.1 已完成

| 里程碑 | 内容 | 状态 |
|--------|------|------|
| M1 骨架与样板 | 新增 `templates/template.html`（header/aside/main Grid 语义块 + 全章节超集）；重写 `modern`（单栏）、`split`（双栏）`styles.css`；后端 `templateAdapter`/`TemplateService` 按 `uses_unified_html` 注入统一 HTML；前端 dev 兜底改读统一 HTML | ✅ |
| M2 导入/存储 | `package_importer.go` 去掉 `template.html` 必填与执行/语法校验（删 `validateTemplateExecution`/`validatePreviewCompatibleSyntax` 及预览函数）；`template_store.go` 写路径去 html、hash 改 css+meta；`template_service.go` Create/Update/Clone/Import 去 html | ✅ |
| M3 全量迁移 | 16 套内置 `styles.css` 全部改写为统一骨架（保留各自视觉），`template.json` 全部置 `uses_unified_html: true` | ✅ |
| M4 清理与文档 | 删除 16 个 `template.html`；重写 `templates/AGENTS.md`（两件套规范 + 布局无关约定 + 统一 HTML 契约） | ✅ |

### 9.2 关键实现细节（与方案 §4 的偏差/补充）

1. **`uses_unified_html` 迁移标志**（方案未提，实施新增）：`template.json` 增加可选字段，Go `Meta`/前端 `TemplateMeta`/`GetTemplateMeta` 三处同步。`effectiveHTML()`（app.go adapter + TemplateService）规则：`uses_unified_html=true 或模板 HTML 为空 → 用 template.html`。16 套内置模板全部置 true。
2. **后端渲染器不改 `pkg/render/html.go`**（方案 §4.4 曾列此项）：改为在 `pkg/app/app.go` 的 `templateAdapter` 注入统一 HTML，渲染器代码零改动，风险更小。
3. **`syncBuiltins` 不再读/存每模板 html**，`hashContent` 改为 css+meta（避免统一 HTML 升级触发全量重刷）。DB `html` 列保留但不再写入/读取。
4. **导入宽松策略落地**：zip 内含 `template.html` 直接忽略（不读取内容），仅要求 `template.json` + `styles.css`。
5. **回归测试**：新增 `pkg/render/unified_template_test.go`（统一 HTML 渲染 + 空数据隐藏 + Hidden 数据层过滤 + **16 套全模板 × 统一 HTML 渲染冒烟**）；`package_importer_test.go`/`starter_check_test.go` 改写为新格式。
6. **Hidden 数据层过滤（文档 §3.4/Q6 落地）**：新增 `pkg/model/hidden.go` 的 `Resume.WithoutHidden()`，`pkg/render/html.go` 渲染前调用；统一 HTML 不写 Hidden 守卫。

### 9.3 验证结果

- `go build ./...`（pkg + main）通过；`go test ./pkg/...` 全绿。
- `pkg/render` 测试：统一 HTML 渲染、空章节隐藏、16 套内置模板与统一 HTML 配对渲染全部 PASS。
- 前端改动经 `vite build` 产物验证；`tsc` 全量检查存在仓库既有配置告警（baseUrl 弃用/项目引用），与本次改动无关。

### 9.4 偏差/待确认项 → 最终结论（已与产品确认）

| 项 | 结论 |
|----|------|
| **M0 字段统一（§7 R7/Q7）** | **跳过**。已核查 Go 模型字段命名本就一致（`GitHub`/`LinkedIn`/`EnglishName`/`YearsOfExp` 等），统一 HTML 直接引用即正确（16 套渲染测试通过），无需破坏性改名与数据迁移。 |
| **Hidden 守卫（§3.4/Q6）** | **移除守卫 + 补后端数据层过滤**。统一 HTML 不再写任何 Hidden 守卫；前端继续由 `toGoShape` 过滤，后端新增 `model.WithoutHidden()`（`pkg/model/hidden.go`）并在 `HTMLRenderer.RenderWithTemplate` 渲染前调用，过滤语义与前端一致（条目数组 + SkillGroup.Items/CustomSection.Items 子项 + summary_hidden 清空 Summary）。新增回归测试 `TestUnifiedTemplateHiddenFiltered`。 |
| **features 对齐（§2.6/Q9）** | **统一置 false**。16 套内置模板 JSON 的 `qr_code`、`skill_bars` 全部置 `false`（与真实渲染一致：无人渲染 QR、统一 HTML 恒渲染圆点而非进度条）；`avatar`/`links_clickable` 维持原声明。 |
| **M0b 视觉回归（R5）** | **上线前 QA 专项**。本次以"16 套模板 × 统一 HTML 渲染冒烟 + Go 单测（含隐藏场景）"验证；像素级截图对比需运行应用 + rod，列为上线前 QA 跟进。 |

