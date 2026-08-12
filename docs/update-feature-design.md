# 应用更新检查功能 — 技术方案设计

> 状态：草案，待评审后进入实现阶段
> 范围：覆盖主动推送与手动拉取两个入口，统一模态交互、下载进度、安装流程

---

## 1. 需求概述

提供软件更新检查功能，包含两个入口：

| 入口 | 触发方式 | 触发时机 |
|------|----------|----------|
| 主页面 Logo 徽标 | 主动推送（启动时后台拉取） | 应用启动时静默检查，发现新版本则点亮徽标 |
| 设置页「检查更新」按钮 | 用户手动拉取 | 用户在设置页点击按钮主动检查 |

两个入口共享同一个交互模态（`UpdateDialog`）和同一个后端服务（`UpdateService`）。

### 1.1 交互流程

1. 检测到新版本后：
   - 主页入口：在主页面 Logo 右上角显示一个红点徽标，用户点击徽标弹出模态
   - 设置页入口：用户点击「检查更新」按钮后直接弹出模态
2. 模态窗口询问「是否下载新版本」
3. 用户点击「立即下载」后，在当前模态窗口内显示下载进度（百分比、速度、已下载/总大小）
4. 下载完成后，用户点击「立即安装」按钮触发应用安装流程（热更新策略见第 5 节）

---

## 2. 整体架构

数据流分四层：

```
┌─────────────────────────────────────────────────────────────┐
│  前端入口层                                                  │
│  ┌──────────────────┐         ┌──────────────────────┐     │
│  │ 主页 Logo 徽标   │         │ 设置页「检查更新」   │     │
│  │ （启动主动拉取） │         │ （用户手动点击）     │     │
│  └────────┬─────────┘         └──────────┬───────────┘     │
└───────────┼──────────────────────────────┼─────────────────┘
            │                              │
            ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│  共享交互层                                                  │
│  ┌────────────────────────────────────────────────────┐     │
│  │ UpdateDialog（共享模态组件）                       │     │
│  │ 状态机：checking → available → downloading → done  │     │
│  └────────────────────────┬───────────────────────────┘     │
└───────────────────────────┼─────────────────────────────────┘
                            │ callService
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  后端服务层                                                  │
│  ┌────────────────────────────────────────────────────┐     │
│  │ UpdateService（Go，注册为 Wails Service）          │     │
│  │ - CheckForUpdates()                                │     │
│  │ - DownloadUpdate(url, sha256)                      │     │
│  │ - InstallUpdate(installerPath)                     │     │
│  └────────────────────────┬───────────────────────────┘     │
└───────────────────────────┼─────────────────────────────────┘
                            │ HTTP
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  外部服务层                                                  │
│  ┌────────────────────────────────────────────────────┐     │
│  │ 外部 HTTP 更新服务器                               │     │
│  │ - GET /latest 返回版本元信息                       │     │
│  │ - GET /download/... 提供安装包                      │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

**回推机制**：下载是长任务，不阻塞前端。后端通过 Wails v3 事件系统 `app.EmitEvent("update:progress", ...)` 推送进度，前端监听事件更新进度条。

---

## 3. 后端设计（Go）

### 3.1 新增 UpdateService

新建 `pkg/service/update_service.go`，在 `pkg/app/app.go` 注册为第六个 Wails Service。

> 不复用 `SystemService`：职责单一，且需要引入 `net/http`（目前后端零 HTTP 调用），隔离更清晰。

#### 核心方法

| 方法 | 签名 | 职责 |
|------|------|------|
| `CheckForUpdates` | `() (UpdateInfo, error)` | GET `/latest`，对比 `appconfig.App.Version` |
| `DownloadUpdate` | `(url, sha256 string) (string, error)` | 流式下载到临时目录，边下边发事件 |
| `InstallUpdate` | `(installerPath string) (bool, error)` | 启动安装流程，方案见第 5 节 |

#### UpdateInfo 结构

```go
type UpdateInfo struct {
    HasUpdate       bool   `json:"hasUpdate"`
    CurrentVersion  string `json:"currentVersion"`
    LatestVersion   string `json:"latestVersion"`
    DownloadURL     string `json:"downloadUrl"`
    SHA256          string `json:"sha256"`
    ReleaseNotes    string `json:"releaseNotes"`
    MinRequired     string `json:"minRequired"`   // 强制更新门槛
    ForceUpdate     bool   `json:"forceUpdate"`   // 当前版本 < MinRequired 时为 true
}
```

#### 进度事件

```go
type DownloadProgress struct {
    Percent    int     `json:"percent"`    // 0-100
    Speed      string  `json:"speed"`      // 例如 "1.2 MB/s"
    Downloaded string  `json:"downloaded"` // 例如 "12.3 MB"
    Total      string  `json:"total"`      // 例如 "45.6 MB"
}

// 下载过程中
app.EmitEvent("update:progress", progress)
```

事件需在 `pkg/app/app.go` 的 `registerEvents()` 注册：

```go
application.RegisterEvent[DownloadProgress]("update:progress")
application.RegisterEvent[string]("update:download-completed")
application.RegisterEvent[string]("update:download-failed")
```

### 3.2 Config 扩展（用户配置）

在 `pkg/config/config.go` 的 `Config` 结构体追加字段：

```go
type Config struct {
    DataDir         string    `json:"dataDir"`
    LastUpdateCheck time.Time `json:"lastUpdateCheck"`
    SkippedVersion  string    `json:"skippedVersion"`
    AutoUpdateCheck bool      `json:"autoUpdateCheck"`   // 默认 true
}
```

字段说明：

| 字段 | 用途 |
|------|------|
| `LastUpdateCheck` | 节流：距上次检查不足 N 小时则跳过自动检查 |
| `SkippedVersion` | 用户在模态点击「跳过此版本」时记录，避免反复弹窗 |
| `AutoUpdateCheck` | 用户可关闭启动时自动检查 |

现有 `saveLocked()` 原子写盘机制自动处理持久化，无需额外开发。

### 3.3 外部 HTTP 更新服务器接口约定

后台应提供以下接口（建议）：

```
GET /latest?platform=windows&arch=amd64&current=1.0.0
→ 200
{
    "version": "1.1.0",
    "downloadUrl": "https://update.example.com/download/Gosume-1.1.0-setup.exe",
    "sha256": "abc123def456...",
    "releaseNotes": "修复了导出分页问题...",
    "minRequired": "1.0.0"
}
```

- `platform` / `arch` 由后端通过 `runtime.GOOS` / `runtime.GOARCH` 自动填充
- 下载接口建议支持 HTTP Range 请求，便于断点续传

---

## 4. 前端设计

### 4.1 updateStore（新增）

新建 `frontend/src/stores/updateStore.ts`，管理更新状态机：

```typescript
type UpdateStatus =
  | 'idle'          // 初始态
  | 'checking'      // 正在检查
  | 'available'     // 发现新版本
  | 'downloading'   // 下载中
  | 'done'          // 下载完成
  | 'error';        // 出错

interface UpdateStore {
  status: UpdateStatus;
  updateInfo: UpdateInfo | null;
  progress: { percent: number; speed: string; downloaded: string; total: string };
  error: string | null;
  modalOpen: boolean;        // 控制 UpdateDialog 显隐
  badgeVisible: boolean;     // 控制 Logo 徽标显隐

  checkForUpdates: (source: 'auto' | 'manual') => Promise<void>;
  startDownload: () => Promise<void>;
  skipVersion: () => Promise<void>;   // 写入 config.skippedVersion
  reset: () => void;
}
```

`source` 参数区分来源：

- `'auto'`（启动主动检查）：若 `latestVersion === config.skippedVersion` 则静默不点亮徽标；网络失败时静默回到 `idle`
- `'manual'`（用户点击）：无视跳过记录，总是展示检查结果；失败时弹出错误提示

### 4.2 UpdateDialog 组件（新增）

新建 `frontend/src/components/update/UpdateDialog.tsx`，复用 `ExportDialog.tsx` 的交互模式：

- 同样的 `entering → open → exiting` phase 动画
- 同样的 overlay + 居中卡片结构（`w-[480px]`）
- 同样的 click-outside-to-close 行为（下载中除外，下载中不可关闭）

#### 状态分支渲染

| 状态 | 模态内容 |
|------|----------|
| `checking` | 加载图标 + 「正在检查更新...」 |
| `available` | 新版本号 + 更新说明 + 「立即下载」/「稍后」/「跳过此版本」按钮 |
| `downloading` | 进度条（百分比）+ 下载速度 + 已下载/总大小，按钮禁用，不可关闭 |
| `done` | 绿色完成图标 + 「下载完成」+ 「立即安装并重启」按钮 |
| `error` | 红色错误图标 + 错误信息 + 「重试」/「关闭」按钮 |

进度数据通过监听 `update:progress` 事件写入 store，模态自动响应。

#### 全局挂载

`UpdateDialog` 作为全局组件挂在 `App.tsx` 根节点，两个入口共享同一个实例：

```tsx
// App.tsx
function App() {
  useEffect(() => {
    // 现有逻辑：设置 frameless 模式
    // 新增：启动时静默检查更新
    if (config.autoUpdateCheck !== false) {
      useUpdateStore.getState().checkForUpdates('auto');
    }
  }, []);

  return (
    <>
      <TitleBar />
      <main className="flex-1">...</main>
      <UpdateDialog />   {/* 全局唯一实例 */}
    </>
  );
}
```

### 4.3 设置页入口（需求点 1）

在 `frontend/src/routes/SettingsPage.tsx` 的「关于」section 内，版本号下方增加「检查更新」按钮：

```tsx
<section className="form-section">
  <div className="form-section-header">
    <Info className="w-4 h-4" />
    <h2>关于</h2>
  </div>
  <div className="p-3 rounded-lg border border-surface-200">
    <div className="flex items-center gap-2">
      <span>Gosume v{version}</span>
      <button onClick={() => checkForUpdates('manual')}>检查更新</button>
    </div>
    {status === 'up-to-date' && <span className="text-green-600">已是最新版本</span>}
    {status === 'available' && /* 打开 UpdateDialog */}
  </div>
</section>
```

点击行为：

- 无更新：内联显示「已是最新版本」（沿用现有 `text-green-600` + `CheckCircle` 模式，3 秒后消失）
- 有更新：`updateStore.setModalOpen(true)`，弹出 `UpdateDialog`

### 4.4 主页 Logo 徽标（需求点 2）

在 `frontend/src/routes/WelcomePage.tsx` 的 Logo 容器右上角加一个红点徽标：

```tsx
<div className="relative">
  <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center shadow-sm">
    <Sparkles className="w-5 h-5 text-white" />
  </div>
  {badgeVisible && (
    <button
      onClick={() => updateStore.setModalOpen(true)}
      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500
                 flex items-center justify-center ring-2 ring-white"
      title="发现新版本，点击查看"
      aria-label="发现新版本"
    >
      <span className="w-2 h-2 rounded-full bg-white" />
    </button>
  )}
</div>
```

徽标可见性由 `updateStore.badgeVisible` 控制——只有 `status === 'available'` 且未被跳过时才显示。点击徽标直接打开同一个 `UpdateDialog`。

### 4.5 启动时主动检查

在 `App.tsx` 现有 `useEffect`（设置 frameless 模式那段）末尾追加：

```typescript
useEffect(() => {
  // 现有：设置 frameless 模式
  ...

  // 新增：启动时静默检查更新
  const AUTO_CHECK_INTERVAL_HOURS = 24;
  const lastCheck = config.lastUpdateCheck;
  const shouldSkip =
    !config.autoUpdateCheck ||
    (lastCheck && Date.now() - lastCheck.getTime() < AUTO_CHECK_INTERVAL_HOURS * 3600 * 1000);

  if (!shouldSkip) {
    useUpdateStore.getState().checkForUpdates('auto');
  }
}, []);
```

`auto` 模式特点：

- 静默执行，失败不报错（网络异常时 `status` 回到 `idle`，徽标不显示）
- 检测到新版本**不弹窗**，只点亮 Logo 徽标，由用户主动点击触发模态
- 受 `lastUpdateCheck` 节流，避免每次启动都请求

---

## 5. 热更新策略

> **现实约束**：Gosume 是编译型 Wails 桌面应用，前端资源被 `//go:embed` 打进二进制，**无法像 Electron 那样热替换前端文件**。真正的「不停机热更新」对二进制变更不可行。

可行方案对比：

| 方案 | 做法 | 体验 | 推荐度 |
|------|------|------|--------|
| **A. 安装包替换** | 下载 NSIS `.exe` 安装包 → `exec.Command` 启动安装程序 → 当前应用退出 → 安装程序覆盖文件并重启 | 用户见安装向导（可加 `/S` 静默参数无感升级） | 最稳妥，推荐 |
| **B. 二进制自更新** | 用 `github.com/minio/selfupdate` 下载新二进制 → 校验 SHA256 → 替换当前 exe → 提示重启 | 需重启，Windows 下运行中 exe 被锁需借助 helper | 轻量但 Windows 有坑 |
| **C. Helper 脚本** | 下载新 exe → 生成 `.bat` 等待主进程退出后覆盖并重启 | 全程无安装界面 | 最轻但维护成本高 |

### 推荐方案 A：安装包替换

项目已有 NSIS 构建链（`build/windows/nsis/project.nsi`），与现有打包流程一致：

1. `UpdateService.DownloadUpdate()` 下载 NSIS 安装包到临时目录
2. 用户在 `UpdateDialog` 点击「立即安装并重启」
3. 前端调用 `UpdateService.InstallUpdate(installerPath)`
4. 后端用 `exec.Command(installerPath, "/S")` 启动静默安装（NSIS 支持 `/S` 静默参数）
5. 后端调用 `SystemService.CloseWindow()` 退出当前应用
6. NSIS 安装程序检测到旧进程退出后，覆盖文件并重启新版本

`InstallUpdate` 实现示意：

```go
func (s *UpdateService) InstallUpdate(installerPath string) error {
    // 启动安装程序（静默模式）
    cmd := exec.Command(installerPath, "/S")
    if err := cmd.Start(); err != nil {
        return UserWrap(err, "启动安装程序失败")
    }

    // 给安装程序一点时间初始化，然后退出当前应用
    go func() {
        time.Sleep(500 * time.Millisecond)
        s.systemSvc.CloseWindow()
    }()

    return nil
}
```

### 静默 vs 可见安装

- 默认推荐静默（`/S`）：用户已确认下载，安装过程无需干预
- 通过 `app.yaml` 增加 `update.silent_install: true` 配置项，允许切换为可见安装（调试时有用）

---

## 6. API 契约总结

### 6.1 前端 → 后端（via `callService`）

```typescript
// services/backend.ts 已有 callService 封装
UpdateService.CheckForUpdates()                                    → UpdateInfo
UpdateService.DownloadUpdate(url: string, sha256: string)          → string (本地安装包路径)
UpdateService.InstallUpdate(installerPath: string)                 → boolean
```

### 6.2 后端 → 前端（via Wails Event）

| 事件名 | 数据类型 | 触发时机 |
|--------|----------|----------|
| `update:progress` | `DownloadProgress` | 下载过程中，每秒或每接收 N 字节触发一次 |
| `update:download-completed` | `string`（安装包路径） | 下载成功完成 |
| `update:download-failed` | `string`（错误信息） | 下载失败（网络中断、SHA256 校验失败等） |

### 6.3 后端 → 外部（via `net/http`）

```
GET {UPDATE_SERVER}/latest?platform=windows&arch=amd64&current=1.0.0
GET {downloadUrl}  (支持 Range 请求，断点续传)
```

`UPDATE_SERVER` 通过 `app.yaml` 配置：

```yaml
update:
  server_url: https://update.example.com
  check_interval_hours: 24
  silent_install: true
```

---

## 7. 改动文件清单

### 7.1 后端

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `pkg/appconfig/app.yaml` | 修改 | 追加 `update` 配置块（server_url、check_interval、silent_install） |
| `pkg/appconfig/appconfig.go` | 修改 | 追加 `AppConfigUpdate` 结构与字段映射 |
| `pkg/service/update_service.go` | 新增 | `UpdateService` 实现 + HTTP 客户端 + 事件发射 |
| `pkg/app/app.go` | 修改 | 注册 `UpdateService`、注册 `update:*` 事件、注入依赖 |
| `pkg/config/config.go` | 修改 | 扩展 `Config` 结构体（LastUpdateCheck / SkippedVersion / AutoUpdateCheck） |

### 7.2 前端

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `frontend/src/stores/updateStore.ts` | 新增 | 状态机 + 事件监听 |
| `frontend/src/components/update/UpdateDialog.tsx` | 新增 | 共享模态组件 |
| `frontend/src/routes/WelcomePage.tsx` | 修改 | Logo 徽标 + 版本号改调用 `SystemService.GetAppVersion()` |
| `frontend/src/routes/SettingsPage.tsx` | 修改 | 「检查更新」按钮 + 版本号改调用服务 |
| `frontend/src/components/layout/StatusBar.tsx` | 修改 | 版本号改调用服务 |
| `frontend/src/App.tsx` | 修改 | 挂载 `UpdateDialog` + 启动时主动检查 |

### 7.3 构建配置

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `build/windows/info.json` | 修改 | 同步版本号与 `app.yaml` 一致 |

---

## 8. 关键设计决策

### 8.1 为何新建 `UpdateService` 而非塞进 `SystemService`

- `SystemService` 已有 11 个方法，职责过载
- `UpdateService` 需要引入 `net/http`（目前后端零 HTTP 调用），隔离降低耦合
- 后续可独立测试更新逻辑，不污染系统服务测试

### 8.2 为何共享 `UpdateDialog` 而非两个入口各写一个

- 两个入口的交互流程完全一致（提示 → 下载 → 安装）
- 共享组件保证状态机一致性，避免行为分叉
- 全局单例挂载，简化状态管理

### 8.3 为何 `auto` 模式不直接弹窗

- 启动时弹窗打断用户工作流，体验差
- 徽标是低干扰提示，用户可在合适时机主动查看
- 用户在设置页可主动检查，等同于显式触发

### 8.4 为何选择安装包替换而非二进制自更新

- Windows 下运行中的 exe 文件被锁，无法直接覆盖，需 helper 进程
- NSIS 安装包已包含完整的文件替换、注册表更新、卸载逻辑
- 与现有打包流程（`build/windows/nsis/project.nsi`）一致，无需引入新工具链
- 静默安装 `/S` 参数对用户透明，体验接近「热更新」

---

## 9. 后续待确认事项

1. **外部 HTTP 更新服务器**：接口是否已存在？协议是否需要调整？
2. **安装包签名**：是否需要对安装包做数字签名校验？（当前方案仅 SHA256 校验完整性）
3. **强制更新**：`minRequired` 字段触发强制更新时，是否禁用「稍后」按钮？
4. **跨平台**：当前方案主要面向 Windows（NSIS）。macOS 需用 `.dmg` 或 `.app` 替换，Linux 需用 AppImage/deb，后续是否支持？
5. **回滚机制**：安装失败后是否提供回滚到旧版本的能力？
