# AGENTS.md
## 前端 — React/TypeScript


## 技术栈

- **React 18**，全部使用函数组件 + hooks
- **TypeScript** strict 模式，路径别名 `@/` → `src/`
- **Vite 5**，配合 `@vitejs/plugin-react` 和 `@wailsio/runtime/plugins/vite`
- **Tailwind CSS 3**，自定义主题配置在 `tailwind.config.ts`
- **zustand 5** 状态管理（不使用 Redux）
- **react-router-dom v7**，使用 HashRouter（适配 Wails 的 file:// 协议）
- **react-hook-form 7** + **zod 4** 表单校验
- **lucide-react** 图标库
- **html2canvas** 客户端截图生成

## 架构模式

### 与后端通信

所有 Go 服务调用统一通过 `services/backend.ts`：

```ts
import { callService } from '../services/backend'

const resume = await callService<Resume>('ResumeService', 'NewResume', templateId, 'zh-CN')
```

服务名和方法名与 Go 端定义一一对应：

| 服务 | 可调用方法 |
|------|-----------|
| `ResumeService` | NewResume, LoadResume, ExplicitSave, AutoSave, DeleteResume, SetResume, GetCurrentID, UpdateField, RenderPreview, ListResumes, UpdateResumeMeta |
| `TemplateService` | ListTemplates, GetTemplate, GetTemplateContent, ImportTemplatePackage, CreateTemplate, UpdateTemplate, DeleteTemplate, CloneTemplate, ValidateForTemplate |
| `ExportService` | ExportPDF, ExportPNG |
| `FileService` | OpenFile, SaveFile, GetRecentFiles |
| `SystemService` | GetAppInfo, GetConfig, SetConfig, SetDataDir, GetDefaultDataDir, OpenDataDir, GetSystemInfo |

在纯 Vite 开发模式下（无 Wails 运行时），`callService` 返回 `null`，各 store 有本地 fallback 逻辑。

### 错误处理

所有 Go 服务方法返回的错误统一使用中文用户友好消息（`UserError`）。前端通过 `lib/error-utils.ts` 中的 `extractErrorMessage` 统一提取：

```ts
import { extractErrorMessage } from '../lib/error-utils'

try {
  await callService('ExportService', 'ExportPDF', ...)
} catch (err) {
  setErrorMsg(extractErrorMessage(err, '导出失败，请重试'))
}
```

`extractErrorMessage` 按优先级处理：Error.message → Wails JSON 序列化错误中的 `message` 字段 → 对象的 `message` 属性 → fallback 字符串。

### 模板导入

用户在欢迎页或编辑器模板切换器中可导入 `.zip` 模板包。前端通过 `services/templateService.ts` 的 `importTemplatePackage()` 调用后端：

```ts
import { importTemplatePackage, loadTemplateMetas } from '../services/templateService'

const result = await importTemplatePackage()  // 弹出原生文件选择对话框
if (result) {
  setTemplates(await loadTemplateMetas())      // 刷新模板列表
  setActiveTemplate(result.id)                  // 切换到新模板
}
```

导入成功后需刷新模板列表并重新生成缩略图。仅在 Wails 桌面环境下可用，纯浏览器模式下抛出错误。

### 状态管理

三个 zustand store：

| Store | 职责 | 核心状态 |
|-------|------|----------|
| `resumeStore` | 简历数据与 CRUD | `resume`、`isDirty`、`currentId`、`resumeList`，以及所有数组操作辅助方法 |
| `templateStore` | 模板列表 | `templates`、`selectedId`、`isLoading` |
| `editorStore` | 编辑器 UI | 当前编辑区块、撤销栈、预览设置 |

### 简历字段更新

字段更新通过 `resumeStore.updateField` 使用点号路径表示法：

```ts
updateField('personal.full_name', '张三')
updateField('jobs[0].company', '某公司')
```

### 自动保存

`useAutoSave` hook 监听 `isDirty` 状态，在防抖延迟后调用 `ResumeService.AutoSave`。手动保存（`Ctrl+S`）调用 `ResumeService.ExplicitSave`。

### 预览

`usePreview` hook 在客户端生成预览 HTML（带 300ms 防抖）：`renderTemplate`（lib/template-engine.ts）本地渲染模板 → `injectLayoutCss`（lib/layoutPresets.ts）注入页边距 CSS 变量与内容间距规则 → 写入 `resumeStore.previewHtml`。PreviewPanel 通过 iframe 渲染。不经过 Go 后端——后端内存仅在显式保存时同步，确保每次按键即时反映。单文件导出（ExportDialog）直接复用 `previewHtml`；批量导出（ResumeListDrawer）对每份简历独立执行相同的渲染 + 注入流程。

模板引擎（`lib/template-engine.ts`）提供以下模板辅助函数：

| 辅助函数 | 用途 |
|----------|------|
| `escapeHtml` | HTML 转义，防 XSS |
| `nl2br` | 换行符转 `<br>` |
| `i18n(lang, zhKey, enKey)` | 根据简历语言字段切换中英文显示 |
| `safeHTML(s)` | 输出原始 HTML（用于模板中已转义的内容） |
| `defaultVal(fallback, val)` | 值为空时返回默认值 |
| `not / and / or / eq / ne` | Go template 布尔运算符（`{{if not .Hidden}}` 等条件渲染） |

### 页面布局档位

`LayoutPopover`（Toolbar 内）提供两项布局设置，均以**枚举 key**持久化（禁止存储具体像素/毫米值），前端负责枚举 → CSS 的映射与注入，后端只透传存储：

| 字段 | 类型 | UI |
|------|------|-----|
| `meta.page_margin` | `MarginKey`（compact/narrow/normal/wide/comfortable） | 5 档滑块 |
| `meta.section_spacing` | `SectionSpacingKey`（同上五档） | 5 档按钮 |

- 所有档位定义、默认值、枚举 → CSS 值映射集中在 `lib/layoutPresets.ts`；赋值必须引用导出的常量（`DEFAULT_MARGIN_KEY` 等），不得硬编码字符串
- 内容间距分三层注入（模块 ↔ 模块 / 条目 ↔ 条目 / 细节 ↔ 细节），`normal` 档不注入任何规则，保留模板原生节奏
- 覆盖的选择器清单与模板侧规范见 `templates/AGENTS.md` 的"布局档位"小节，新增参与间距调整的组件需两侧同步

## 开发规范

### 通用规则
- 代码格式化工具：Prettier + ESLint
- 禁止使用：any 类型、var 声明、硬编码魔法值（如直接写 100 代替 MAX_PAGE_SIZE）

### React+TS 专属规则
- 组件风格：优先使用函数式组件（React.FC），禁止使用类组件
- 类型定义：使用 interface 定义组件 props，简单场景可使用 type
- 命名规范：
    - 组件名：PascalCase（如 UserList）
    - 函数名：camelCase（如 handleUserClick）
    - 常量名：UPPER_CASE_SNAKE_CASE（如 MAX_PAGE_SIZE）
- 示例：
```ts
// 正确示例
interface UserListProps {
  users: Array<{ id: number; name: string }>;
}
export const UserList: React.FC<UserListProps> = ({ users }) => {
  const handleClick = (id: number) => {
    console.log(`User ID: ${id}`);
  };
  return (
    <div className="user-list">
      {users.map(user => (
        <button key={user.id} onClick={() => handleClick(user.id)}>
          {user.name}
        </button>
      ))}
    </div>
  );
};
```

### 代码注释
- 代码应有详细规范的注释；
- 注释应符合社区主流注释风格：方法名，方法作用，方法参数等

### 禁止操作
- 不得修改/删除：.env（密钥文件）、src/core（核心工具类）、migrations/（迁移文件）
- 不得修改：package.json 中的依赖版本、CI/CD 流水线配置（.github/workflows/）
- 不得提交：node_modules 目录、IDE 配置文件（.vscode/）、未完成的测试代码

