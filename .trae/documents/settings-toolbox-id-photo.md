# 设置页「工具箱」子导航 + 证件照工具包

## Context（背景）

当前设置页（[SettingsPage.tsx](file:///d:/Kits/IDE/Gosume/frontend/src/routes/SettingsPage.tsx)）是单列滚动页，内容集中在 `max-w-2xl` 窄列（语言/外观/自动保存/数据目录/一键填入/关于），页面大量留白。用户希望补充工具类扩展功能，已确认：

- **呈现形式**：设置页内加「子导航」（基础设置 / 工具箱 两个 Tab）。

- **首批范围**：仅做**证件照工具包**（照片压缩、证件照尺寸预设、纯色换底），全走前端 Canvas，无后端改动。

- 图片工具 / 简历体检 / 文本工具 三类留作后续，首批以「敬请期待」占位卡片呈现。

目标：在不改动现有 6 个设置区块行为的前提下，新增一个可切换的「工具箱」Tab 并落地证件照工具包。

## 涉及文件

**修改**

- `frontend/src/routes/SettingsPage.tsx` —— 加 Tab 状态、Tab 栏、条件渲染、容器宽度切换。

**新增**

- `frontend/src/components/tools/ToolsPanel.tsx` —— 工具目录网格 + 「敬请期待」占位 + 挂载 `IdPhotoTool`。

- `frontend/src/components/tools/IdPhotoTool.tsx` —— 证件照工具包全部 UI 与本地状态 + 管线编排 + 保存下载。

- `frontend/src/components/tools/lib.ts` —— 纯函数工具：`mmToPx`、`centerCropDraw`、`replaceBackground`（色键+羽化）、尺寸预设常量、输出字节计算。

无需改动路由（不新增 sub-route，用本地 state 切 Tab）、无新增 npm 依赖、无 Go 后端改动、无 CSS 文件改动。

## 实现细节

### 1. 设置页 Tab 化（SettingsPage.tsx）

- 顶部加状态：`const [activeTab, setActiveTab] = useState<'base' | 'tools'>('base')`。

- 在现有 `<header>` 下方加 Tab 栏（沿用 `btn btn-sm` 词汇，整体 `bg-elev border-b border-surface-100`）：

  - 基础设置：`btn btn-sm`，激活态 `bg-surface-100 text-surface-800`，未激活 `text-surface-500 hover:...`，带 `Settings` 图标。

  - 工具箱：同结构，`Wrench` 图标（加入 lucide 导入）。

- 内容容器宽度按 Tab 切换：

  ```
  className={`flex-1 overflow-auto p-6 ${activeTab === 'base' ? 'max-w-2xl' : 'max-w-4xl w-full mx-auto'}`}
  ```

  基础 Tab 保持 `max-w-2xl`（像素级不变），工具箱 Tab 放宽到 `max-w-4xl` 以容纳左右双栏。

- `activeTab === 'base'` 时按原样渲染 6 个 `<section>`（仅做条件包裹，不改内容）；`activeTab === 'tools'` 时渲染 `<ToolsPanel />`。

### 2. 工具目录网格（ToolsPanel.tsx）

- 本地状态 `const [open, setOpen] = useState('')`，`''` = 目录网格，`'photo'` = 证件照工具包。

- `CATALOG` 注册表（图标支持 future 分类）：

  ```ts
  [
    { id: 'photo',      title: '证件照工具包', active: true,  Icon: Camera },
    { id: 'image',      title: '图片工具',     active: false, Icon: Image },
    { id: 'healthCheck',title: '简历体检',     active: false, Icon: ClipboardCheck },
    { id: 'text',       title: '文本工具',     active: false, Icon: Type },
  ]
  ```

- 卡片样式沿用现有令牌（`border-surface-200 hover:bg-surface-50`）；未激活卡片 `opacity`/`cursor-not-allowed` + `敬请期待` 文本，无点击行为。

### 3. 证件照工具包（IdPhotoTool.tsx + lib.ts）

状态全部本地 `useState`（无需 Zustand store，纯内存 UI）：

- `img: HTMLImageElement | null`、`sourceName`；两组 canvas（原图预览 / 结果画布 refs）。

- `quality`（0–100，默认 90）、`dpi`（默认 300）、`presetId: string | null`。

- 换底参数：`enabled`、`rgb`、`tolerance`（容差 0–100）、`feather`（羽化平滑）。

- 输出：`outputMime: 'image/jpeg' | 'image/png'`、`outputBytes`。

管线（`buildResult()`，纯函数，任一控件变化即重算）：

1. `drawImage` 源图到工作画布。
2. 若开启换底 → `replaceBackground()` 生成换底位图。
3. 若选中尺寸预设 → `centerCropDraw` 到目标像素尺寸。
4. 输出 canvas → `toBlob`。

尺寸预设（mm→px @ dpi：`px = round(mm/25.4*dpi)`），300dpi 下：

- 一寸 25×35mm → 295×413px

- 小一寸 22×32mm

- 二寸 35×49mm

- 大一寸 33×48mm
  中心裁剪：`scale = max(Wt/Ws, Ht/Hs)`，负偏移居中并裁剪，展示 mm 与 px 读数。

换底（色键法，UI 需标注局限）：

- 目标色用预设色板（白/红/深蓝/浅蓝）+ `<input type="color">` 自定义。

- 自动采样源背景色（取左上角像素），按 RGB 欧氏距离阈值识别背景。

- 容差 + 羽化：`[tolerance-feather, tolerance]` 区间线性 alpha 渐变（可用 `ctx.filter='blur'` 补充）；`globalCompositeOperation='destination-over'` 下垫目标色。

- 控制区旁固定提示（`text-xs text-surface-400`）：「换底为纯色算法，仅对背景均匀的照片效果较好；复杂/渐变背景请手动处理。」

文件拾取：`<input type="file" accept="image/*">`（globals.css L209 明确不魔改 file 控件）。保存下载：`canvas.toBlob` → `URL.createObjectURL` → 临时 `a[download]` 点击 → `revokeObjectURL`；默认 JPEG，保留透明背景（勾选）时用 PNG。原生 save 对话框留待后续如需再引入 Go 服务。

压缩反馈：加载时记录 `file.size`，实时显示 原图大小 / 输出大小 / 压缩率。

### 4. 双栏布局（max-w-4xl 内）

```
grid grid-cols-1 md:grid-cols-[minmax(0,340px)_1fr] gap-4
```

左=控制（`form-section` 风格卡片），右=预览（`border border-surface-200 rounded-lg bg-elev` canvas），窄屏回落单栏。操作控件统一用现有组件/令牌（质量/容差用 `AnimatedRange`）。

## 验证

`task dev`（Wails dev + Vite HMR）运行：

1. 进设置页：标题下方出现 Tab 栏，默认在「基础设置」，6 个区块正常渲染、滚动正常、宽度 \~672px。
2. 切「工具箱」：基础区块卸载、出现目录网格，容器 \~896px；切回「基础设置」无状态丢失。
3. 点「证件照工具包」卡片：打开模块；「敬请期待」三卡片不可点。
4. 选照片：原图预览出现。
5. 压缩：拖质量滑块，输出栏 原图大小/输出大小/压缩率 实时刷新。
6. 尺寸预设：选「一寸」→ 结果 295×413\@300dpi 中心裁剪，mm/px 读数正确；换二寸/小一寸/大一寸、改 dpi 均正确。
7. 换底：选蓝色 → 均匀背景变蓝；容差/羽化调整边界、再测白/红及自定义色。限制定位文案可见。
8. 下载：点「下载图片」落盘文件，尺寸/颜色正确；勾选保留透明背景导出 PNG。
9. 回归：反复切 Tab，工具模块卸载干净、无新增后端调用。

