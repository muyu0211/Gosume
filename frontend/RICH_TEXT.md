# 富文本输入框完整逻辑链路

> 本文档梳理 Gosume 富文本输入（RichTextField）从「数据源」到「编辑区」再到「简历渲染/导出」的完整链路，
> 以及 Markdown 私有扩展（列表符号、有序标号、字体颜色）的双向转换约定。作为对齐"编辑区与简历渲染
> 使用同一条 md 解析链"这一目标的实现说明。

## 1. 核心文件与职责

| 文件                                                                         | 职责                                                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [src/lib/markdown.ts](src/lib/markdown.ts)                                 | 双向转换引擎：`markdownToHtml`（md→受限 HTML）与 `htmlToMarkdown`（HTML→md）。含所有私有扩展规则、白名单、历史数据兼容 |
| [src/components/ui/RichTextField.tsx](src/components/ui/RichTextField.tsx) | 所见即所得编辑器组件。contentEditable + 类 Word 工具栏，受控于外部 Markdown 值                            |
| [src/lib/templateEngine.ts](src/lib/templateEngine.ts)                     | 简历模板渲染器，把 `{{md .Summary}}` / `{{mdInline .X}}` 委托给 `markdownToHtml`                |
| 各调用方                                                                       | `ExtrasEditor` / `SummarySection` / `ExperienceSection` etc. 把字段值接入编辑器并落库           |

**关卡原则**：编辑区输入 → `htmlToMarkdown` 序列化成 Markdown 落库；简历预览/导出 → `markdownToHtml` 从同一份 Markdown 渲染。两处共用同一套解析规则，确保往返一致、不因"反复嵌套字体格式"产生偏差。

## 2. 数据模型：Markdown 源（含 HTML 标签）

所有富文本字段（个人总结、工作/项目简述、关键亮点、获奖概述、扩展信息值）在状态与存储层是
**Markdown 字符串**，其中行内强调以 `<strong>/<em>` HTML 标签表达（见 §3.3），颜色/列表/链接
用 markdown 私有语法。

* 编辑器对外暴露 `value: string`（Markdown + 内联标签）与 `onChange(value)`。

* 落库、undo/redo、导入导出、模板渲染全部消费这份数据。

* HTML 只存在于编辑区 DOM（contentEditable）与模板渲染的瞬时输出中。

## 3. 序列化：编辑区 HTML → Markdown（htmlToMarkdown）

入口 [markdown.ts htmlToMarkdown](src/lib/markdown.ts) 使用 [TurndownService](src/lib/markdown.ts)（turndown 库）递归遍历编辑区 DOM。

### 3.1 标准格式映射

* `<strong>/<b>` → 保留 `<strong>…</strong>` 标签（不压成 `**`）

* `<em>/<i>` → 保留 `<em>…</em>` 标签（不压成 `*`）

* `<a href>` → `[text](url)`

* 段落/换行：块级容器降级为段落，单换行按 turndown 默认处理

* 受限子集之外的块（标题/引用/pre/figure）：`UNWRAP_TAGS` 规则去语义化，仅保留文本（`innerHTML + '\n\n'`）

* 图片/表格/hr 等：`turndown.remove` 直接丢弃

### 3.2 私有扩展：列表与颜色

| DOM                                | Markdown 源                                    |
| ---------------------------------- | --------------------------------------------- |
| `<ul data-marker="square">` 等      | 行首符号 `□/→/—/✓ + 空格`（见 `md-styled-list`）       |
| `<ol data-marker="lower_roman">` 等 | 行首固定前缀 `i./a./A./(1)/[1]`（见 `md-styled-ol`）   |
| `<span style="color">`             | `[color:#rrggbb]…[/color]`（见 `md-color-span`） |

编号**不落库**：有序列表数据源不存编号，渲染时由 CSS counter 从 1 连续生成，删项自动递补。

### 3.3 强调采用"保留标签"无损方案（关键设计）

编辑区 DOM 里的 `<strong>`/`<em>` 可能是**任意交叉嵌套树**（如 `<em>美</em><strong>团<em>外卖</em></strong>`）。
如果把强调压成 `**`/`*` 定界符字符串，CommonMark 强调算法对交叉嵌套有理论死区，渲染时无法还原
（`separate/Z-WSP/宽松强调` 等补丁都只是缓解）。因此**序列化时原样保留** **`<strong>/<em>`** **标签**，
渲染端 `html:true` + DOMPurify 白名单透传，简历与编辑区所见完全一致、天然无损。渲染端**禁用强调
定界符**（`**`/`*` 按字面显示），只认 `<strong>/<em>` 标签。

## 4. 编辑区交互（RichTextField）

### 4.1 受控同步与防回流

* `lastValueRef` 记录最近落库值，`composingRef` 标记中文输入法组合期。

* `flush(el)`：`composingRef` 为假时，把 `el.innerHTML` 经 `htmlToMarkdown` 序列化，更新 `lastValueRef` 并 `onChange(md)`。

* 外部 `value` 变化 effect：仅当 `value !== lastValueRef.current` 且非组合期、且 `htmlToMarkdown(el.innerHTML)` 与 `value` 不一致时才回写 `el.innerHTML = markdownToHtml(value)`。该口径保证"自身输入回流"不会触发重渲染。

* 挂载初始化：一次性用 `markdownToHtml(value)` 填充编辑区。

### 4.2 工具栏命令

* **加粗/斜体**：`document.execCommand('bold'/'italic')`（浏览器原生，自动维护嵌套），随后 `handleInput()` 触发序列化。

* **列表**：`applyListMarker('ul'|'ol', cmd, defaultMarker, marker)` 统一 toggle 语义：

  * 不在列表 → 新建并设所选符号/标号；

  * 已在列表且点当前符号 → 取消列表；

  * 已列表点其他符号 → 仅切换 `data-marker`。

* **字体颜色**：`applyColor` 分两类：

  * 选区完整覆盖单个颜色 span 且同色 → 解包；异色 → 整体改色；

  * 其余（部分选中/跨颜色）→ `wrapSelectionColor` 逐文本节点 `splitText` 包上新 span。

  * `clearColor` 解包选区内所有 color span。颜色比较统一走 `cssColorToHex`（浏览器内联样式是 rgb()）。

* **清除格式**：`clearAllFormat` 读可见文本重建纯文本块 `<div>`，移除一切格式标签。

* 无选区时格式按钮置灰（`hasSelection` 跟踪 `selectionchange`）。

### 4.3 输入净化

* `handleBeforeInput`：超字数上限拦截；inline 形态禁止插入换行。

* `handlePaste`：一律按纯文本插入（转义 `<>&`），inline 去换行，受字数上限截断。

## 5. 渲染：Markdown → 受限 HTML（markdownToHtml）

入口 [markdown.ts markdownToHtml](src/lib/markdown.ts)，mode 分 `block`/`inline`。

### 5.1 markdown-it 引擎

* `mdBlock`：`html:true` + `breaks:true`（单换行→`<br>`）+ 禁用 image/table/heading/blockquote/hr/fence/backticks/strikethrough/html\_block。

* `mdInline`：`html:true` + 仅行内（禁 image/backticks/strikethrough，**保留 html\_inline 以透传** **`<strong>/<em>`**），`render` 后 `.replace(/\n/g,'<br>')`。

* **html 透传**：序列化的 `<strong>/<em>` 标签原样进入输出（DOMPurify 白名单含 strong/em，安全）。

* **禁用强调定界符**：两引擎 `inline.ruler.disable('emphasis')`——`**`/`*` 不再解析为强调，按字面显示。
  强调只接受 `<strong>/<em>` 标签，彻底规避 CommonMark 对交叉嵌套的死区。

### 5.2 私有扩展渲染规则

* `color_open` / `color_close` inline rule：把 `[color:#hex]…[/color]` 转为 `<span style="color:{$1}">`。

* `symbolListRule`（block）：把 `□/→/—/✓ + 空格` 开头的连续行解析为带 `data-marker` 的 `<ul>`。

* `orderedListRule`（block）：把 `i./a./A./(1)/[1] + 空格` 开头的连续行解析为带 `data-marker` 的 `<ol>`，前缀剥离。

### 5.3 安全化（DOMPurify）

* 白名单 `ALLOWED_TAGS`（p/br/strong/em/a/span/ul/ol/li）、`ALLOWED_ATTR`（href/data-marker/style）、
  `ALLOWED_URI_REGEXP`（http/https/mailto）——**透传的** **`<strong>/<em>`** **在此被白名单约束**，
  恶意标签（img/script/onclick 等）在此剥离。

* Hook 收敛 `style`：仅允许纯 `color:#hex`，其余移除。

* 剥离残留零宽空格（U+200B，兼容旧数据）。

### 5.4 有序列表编号归一

`mdBlock.render` 后 `.replace(/<ol start="\d+">/g, '<ol>')`，忽略手写 `start`，编号统一从 1 走 CSS counter。

## 6. 简历模板渲染（templateEngine）

`templateEngine.ts` 把模板里的：

* `{{md .X}}` → `markdownToHtml(X, 'block')`

* `{{mdInline .Y}}` → `markdownToHtml(Y, 'inline')`

因此**简历预览与导出走与编辑器回显完全一致的 md 解析链**，这就是本次重构的核心目标：
不再存在"编辑器用一套逻辑、简历用另一套逻辑"的双轨不一致。

## 7. 完整数据流（一张图）

```
[用户输入编辑区 DOM]
      │
      ▼  flush(): htmlToMarkdown  (turndown + 私有扩展 + 相邻ZWSP)
[Markdown 源] ────────────────► 落库 / 状态 (zustand)
      │
      │  onChange(md) 更新 value；外部 value 变化时反向校验
      ▼
[markdownToHtml]  (stripZWSP → separate → markdown-it → 自定义扩展 rule → DOMPurify)
      │
      ├──► 编辑区回显 (el.innerHTML)
      └──► 模板渲染 ({{md}}/{{mdInline}}) → 简历预览 / 导出
```

## 8. 已清理的岔路 / 冗余（本次迭代）

* 删除遗留调试探针 `frontend/_probe/`（index.html + main.tsx）—— 无引用、未接入构建，仅早期排错用。

* 删除 `frontend/_paginationCore.mjs` —— paginationCore.ts 的临时 bundle 导出，无引用。

* 删除 `markdown.ts` 的 `stripHistoricalZwsp` —— 早期为旧版 ZWSP 填充格式做的历史数据兼容，删除后功能等价。

* 删除 `emphasizeBoundaryZwsp`/`INLINE_FORMAT_TAGS`（相邻定界符 ZWSP 分隔）—— 标签方案下不再需要。

* 删除 `looseEmphasisTokenize` + `separateConsecutiveDelims`，并禁用强调定界符规则 —— 核心改为"保留标签"：
  强调只认 `<strong>/<em>` 标签，`**`/`*` 定界符引擎整体移除（不再处理定界符强调）。

* 确认 markdown.ts / RichTextField.tsx 内不存在未使用的导出 / 冗余分支（逐个 grep 核验通过）。

## 9. 已知边界（非本次修复范围）

* **强调交叉死区已彻底解决**：编辑区任意 `<strong>/<em>` 交叉嵌套树，序列化保留标签、渲染端
  html:true 透传，简历与编辑区完全一致。**纯标签方案下** **`**`/`*`** **定界符不再解析**（字面显示），
  若将来需要支持手动粘贴 markdown 强调，需另加定界符解析分支。

* Go 侧**无任何渲染逻辑**（goldmark / template\_render 均已删除），所有渲染（主页预览、编辑预览、
  导出）全部在**前端**经 `templateEngine` → `markdownToHtml` 完成。

