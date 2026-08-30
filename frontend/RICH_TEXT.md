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

## 2. 数据模型：Markdown 源

所有富文本字段（个人总结、工作/项目简述、关键亮点、获奖概述、扩展信息值）在状态与存储层是 **Markdown 字符串**，而非 HTML。

* 编辑器对外暴露 `value: string`（Markdown）与 `onChange(value)`。

* 落库、undo/redo、导入导出、模板渲染全部消费这份 Markdown。

* HTML 只存在于编辑区 DOM（contentEditable）与模板渲染的瞬时输出中。

## 3. 序列化：编辑区 HTML → Markdown（htmlToMarkdown）

入口 [markdown.ts htmlToMarkdown](src/lib/markdown.ts) 使用 [TurndownService](src/lib/markdown.ts)（turndown 库）递归遍历编辑区 DOM。

### 3.1 标准格式映射

* `<strong>/<b>` → `**…**`

* `<em>/<i>` → `*…*`

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

### 3.3 相邻强调的分隔（关键设计）

编辑器 HTML 中相邻的 `<strong>/<em>`（如 `<strong>a</strong><em>b</em>`）若直接拼 `**a**` + `*b*`，
会得到 `**a***b*`——CommonMark 无法还原为并列区间（规范死区）。因此序列化时通过
`emphasizeBoundaryZwsp` 给相邻强调节点的边界补零宽空格（U+200B），把合并的 run 拆回独立定界符：
`**a**⟦ZW⟧*b*`。渲染端再剥离/保留该 ZWSP（见 §5）。

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

### 5.1 预处理（历史兼容 + 相邻定界符）

1. `stripHistoricalZwsp`：剥离历史数据中**定界符内侧**的 ZWSP；但**保留夹在两个** **`*`** **run 之间**的 ZWSP
   （`**a**⟦ZW⟧**b**` 的分隔），否则会把正确的相邻格式退化成合并 run。
2. `separateConsecutiveDelims`：把历史数据的 ≥4 连 `*` run（`**a****b**`）按每 2 个分隔插 ZWSP，
   交给原生强调按独立 run 配对。

> 这两步共同构成"相邻强调隔离"的防御层，覆盖旧数据与手写 markdown，与新序列化（§3.3）互补。

### 5.2 markdown-it 引擎

* `mdBlock`：`breaks:true`（单换行→`<br>`）+ 禁用 image/table/heading/blockquote/hr/fence/backticks/strikethrough/html\_block。

* `mdInline`：仅行内（禁 image/html\_inline/backticks/strikethrough），`render` 后 `.replace(/\n/g,'<br>')`。

### 5.3 私有扩展渲染规则

* `color_open` / `color_close` inline rule：把 `[color:#hex]…[/color]` 转为 `<span style="color:{$1}">`。

* `symbolListRule`（block）：把 `□/→/—/✓ + 空格` 开头的连续行解析为带 `data-marker` 的 `<ul>`。

* `orderedListRule`（block）：把 `i./a./A./(1)/[1] + 空格` 开头的连续行解析为带 `data-marker` 的 `<ol>`，前缀剥离。

### 5.4 安全化（DOMPurify）

* 白名单 `ALLOWED_TAGS`（p/br/strong/em/a/span/ul/ol/li）、`ALLOWED_ATTR`（href/data-marker/style）、
  `ALLOWED_URI_REGEXP`（http/https/mailto）。

* Hook 收敛 `style`：仅允许纯 `color:#hex`，其余移除。

* 最后剥离所有残留 ZWSP（ZWSP 仅作分隔信号，不进入最终 HTML）。

### 5.5 有序列表编号归一

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

* 确认 markdown.ts / RichTextField.tsx 内不存在未使用的导出 / 冗余分支（逐个 grep 核验通过）。

## 9. 已知边界（非本次修复范围）

* **三层以上交替嵌套**（如"粗→斜→粗→斜"连续交替形成的 `**a*b**c**d*e**`）在 CommonMark 参考实现
  中同样存在歧义，属规范固有死区。真实编辑器的一次粗/斜交叉最多产生相邻或双层，已被 §3.3 + §5.1
  覆盖。对三层特例，唯一彻底规避手段是改用私有内联标签（不作为默认方案）。

* Go 侧 `pkg/resume/template_render/markdown.go`（goldmark）为遗留渲染路径，前端渲染不调用；其
  已对齐 ZWSP 剥离，但不复现前端对历史脏数据（定界符贴标点）的修复，仅服务旧链路兼容。

