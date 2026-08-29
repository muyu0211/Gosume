package service

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"gosume/pkg/config"
	"gosume/pkg/event"
	"gosume/pkg/log"
	ghttp "gosume/pkg/remote/http"
	"gosume/pkg/resume/dto"
	"gosume/pkg/resume/helper"
	"gosume/pkg/user_config"
	"gosume/pkg/util"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// allowedDownloadHosts 允许下载更新包的域名白名单。
// 防止 appcast 被篡改后指向任意可执行文件；TODO(更新服务)：替换为真实 CDN 域名。
var allowedDownloadHosts = []string{
	"gosume.dpdns.org",
	"dl.example.com",                // CDN 主域名（占位）
	"github.com",                    // GitHub Releases 直链
	"objects.githubusercontent.com", // GitHub Releases 实际跳转域
}

// 更新包形态（appcast 的 artifact_type，决定替换阶段行为）。
const (
	artifactNSIS     = "nsis-installer"
	artifactAppZip   = "app-zip"
	artifactAppImage = "appimage"
)

// UpdateService 提供在线更新能力：检查版本、下载更新包、触发静默替换。
//
// 流程（见《在线更新开发方案》）：
//  1. CheckUpdate 拉取 appcast，与当前版本比较；
//  2. DownloadUpdate 下载更新包到 {dataDir}/updates/ 并校验 sha256；
//  3. ApplyUpdate 启动分离的 Helper 进程，随后前端走既有未保存确认流程退出，
//     Helper 等主进程退出后完成静默替换并重启新版本。
type UpdateService struct {
	App          *application.App
	configMgr    *user_config.Manager // 用户配置管理器
	state        atomic.Int32         // 下载状态机：-1=空闲；0~100=下载中（值为进度%）。0 是下载开始时的初始进度，因此空闲态必须显式置为 -1，避免 Go 零值(0)被误判为“正在下载进度0”。
	cancel       context.CancelFunc   //  取消正在进行的下载。
	cancelMu     sync.Mutex           // 下载取消锁。
	helper       *exec.Cmd            // 等待主进程退出的 Helper 进程（CancelUpdate 可终止）。
	helperMu     sync.Mutex           // helper 互斥锁
	checkCache   *UpdateInfoResponse  // 检查结果会话缓存：仅成功结果入缓存，进程生命周期内有效
	checkCacheMu sync.Mutex           // 检查缓存锁
	checkMu      sync.Mutex           // 检查执行串行锁：并发调用时后者等待前者完成并命中缓存
}

// updateMetaFile 已下载更新包的元数据文件名（位于 updates/ 目录，跨会话复用）。
// 记录该更新包对应的服务端版本，CheckUpdate 据此判断本地是否已有“当前最新的已就绪包”，避免下次运行重复下载。
const updateMetaFile = "update-meta.json"

// updateMeta 记录已下载但尚未安装的更新包元信息。
type updateMeta struct {
	Version      string `json:"version"`       // 该包对应的服务端版本号
	ArtifactType string `json:"artifact_type"` // 更新包形态
	DownloadedAt string `json:"downloaded_at"` // 下载完成时间
}

// UpdateInfoResponse 检查更新返回的更新信息。
type UpdateInfoResponse struct {
	HasUpdate      bool   `json:"has_update"`               // 是否存在新版本
	CurrentVersion string `json:"current_version"`          // 当前版本
	LatestVersion  string `json:"latest_version,omitempty"` // 最新版本号
	UpdateReady    bool   `json:"update_ready,omitempty"`   // 对应最新版本的更新包已下载就绪，可直接安装
	ReleaseDate    string `json:"release_date,omitempty"`   // 发布日期
	ReleaseNotes   string `json:"release_notes,omitempty"`  // 更新说明
	DownloadURL    string `json:"download_url,omitempty"`   // 更新包下载地址
	SHA256         string `json:"sha256,omitempty"`         // 更新包哈希
	ArtifactType   string `json:"artifact_type,omitempty"`  // 更新包形态（nsis-installer / app-zip / appimage）
	Reason         string `json:"reason,omitempty"`         // has_update=false 时的说明（如包管理器提示）
}

// ServiceName 返回服务名，供 Wails 绑定与前端调用使用。
func (s *UpdateService) ServiceName() string {
	return "UpdateService"
}

// Inject 依赖注入。
func (s *UpdateService) Inject(app *application.App, configMgr *user_config.Manager) {
	s.App = app
	s.configMgr = configMgr
	s.state.Store(-1) // 初始化空闲态
}

// GetDownloadProgress 返回当前下载状态，供前端在重新打开更新对话框时续显：
// -1=空闲（无下载任务）；0~100=下载中（值为当前进度百分比）。
func (s *UpdateService) GetDownloadProgress() int {
	return int(s.state.Load())
}

// CheckUpdate 检查是否有可用的新版本。
// 成功结果写入会话缓存：同一次运行内重复调用直接返回缓存，不再请求后端，
// 防止高频重复检查；失败结果不缓存，允许用户重试。
// 并发调用经 checkMu 串行化：首个调用执行实际检查，后续调用等待后命中缓存。
func (s *UpdateService) CheckUpdate() *util.Response {
	// 获取缓存
	if cached := s.getCheckCache(); cached != nil {
		return util.DoRsp(util.SuccCode, "成功", *cached)
	}

	s.checkMu.Lock()
	defer s.checkMu.Unlock()
	if cached := s.getCheckCache(); cached != nil {
		return util.DoRsp(util.SuccCode, "成功", *cached)
	}

	// 执行实际检查
	info, errMsg := s.doCheckUpdate()
	if errMsg != "" {
		return util.DoRsp(util.ErrCode, errMsg, nil)
	}
	s.setCheckCache(info)
	return util.DoRsp(util.SuccCode, "成功", info)
}

// DownloadUpdate 后台下载更新包到 {dataDir}/updates/ 并校验 sha256。
func (s *UpdateService) DownloadUpdate(path, sha256Hex string) *util.Response {
	if !util.IsProd() {
		return util.DoRsp(util.ErrCode, "开发模式下不支持在线下载", nil)
	}

	// 校验 sha256 格式
	sha256Hex = strings.ToLower(strings.TrimSpace(sha256Hex))
	if sha256Hex == "" {
		return util.DoRsp(util.ErrCode, "更新包缺少校验信息", nil)
	}

	// 状态守卫：CAS(-1→0) 占用后台下载权（0 为初始进度）。
	if !s.state.CompareAndSwap(-1, 0) {
		log.Infof("[update_service] DownloadUpdate: 已有下载任务进行中，忽略重复请求")
		return util.DoRsp(util.ErrCode, "已有下载任务进行中", nil)
	}
	log.Infof("[update_service] DownloadUpdate: 开始后台下载 %s（sha256 %s…）", path, sha256Hex[:8])

	// 后台下载
	util.Go(func() {
		s.doDownload(path, sha256Hex)
	})

	return util.DoRsp(util.SuccCode, "已开始后台下载", nil)
}

// ApplyUpdate 启动分离的 Helper 进程完成静默替换
func (s *UpdateService) ApplyUpdate() *util.Response {
	if !util.IsProd() {
		return util.DoRsp(util.ErrCode, "开发模式下不支持应用更新", nil)
	}

	updateDir := s.updateDir()
	pkgPath := filepath.Join(updateDir, config.GlobalConfig.App.Update.PackageFile)
	if _, err := os.Stat(pkgPath); err != nil {
		return util.DoRsp(util.ErrCode, "更新包未就绪，请先下载", nil)
	}

	// 解析当前可执行路径（重启用），必须先于启动 Helper 获取
	execPath, err := os.Executable()
	if err != nil {
		log.Errorf("[update_service] ApplyUpdate: 解析应用路径失败: %v", err)
		return util.DoRsp(util.ErrCode, "启动更新失败", nil)
	}

	// 用于在 Helper 退出时记录 Helper 进程，以便后续 Kill
	trackHelper := func(cmd *exec.Cmd) {
		s.helperMu.Lock()
		s.helper = cmd
		s.helperMu.Unlock()
	}

	if err := helper.Start(updateDir, pkgPath, execPath, trackHelper); err != nil {
		log.Errorf("[update_service] ApplyUpdate: 启动更新助手失败: %v", err)
		return util.DoRsp(util.ErrCode, "启动更新失败", nil)
	}

	log.Infof("[update_service] ApplyUpdate: 更新助手已启动，等待应用退出后替换")
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// CancelUpdate 取消正在进行的下载，或终止仍在等待主进程退出的 Helper。
func (s *UpdateService) CancelUpdate() *util.Response {
	s.cancelMu.Lock()
	if s.cancel != nil {
		s.cancel()
		s.state.Store(-1) // 立即回到空闲态；DownloadUpdate 的 defer 会再次释放（幂等）
	}
	s.cancelMu.Unlock()

	s.helperMu.Lock()
	if s.helper != nil && s.helper.Process != nil {
		// Helper 在等待阶段被杀是安全的（尚未开始替换）；若已越过等待
		// 阶段则 Kill 仅结束 sh，mv/open 已由子进程接管或尚未执行。
		_ = s.helper.Process.Kill()
	}
	s.helperMu.Unlock()

	log.Infof("[update_service] CancelUpdate: 已取消")
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// doCheckUpdate 执行实际的检查逻辑：成功返回更新信息，失败返回错误提示。
func (s *UpdateService) doCheckUpdate() (UpdateInfoResponse, string) {
	current := config.GlobalConfig.App.Version

	// NOTE: 测试直接返回更新
	if !util.IsProd() {
		log.Infof("[CheckUpdate] Test Env 检查更新")
		return UpdateInfoResponse{
			HasUpdate:      false,
			CurrentVersion: current,
			Reason:         "测试环境不支持在线更新",
		}, ""
	}

	// Linux：仅 AppImage 安装形态支持应用内更新，deb/rpm/AUR 走系统包管理器。
	if runtime.GOOS == "linux" && !(os.Getenv("APPIMAGE") != "") {
		return UpdateInfoResponse{
			HasUpdate:      false,
			CurrentVersion: current,
			Reason:         "当前安装形态暂不支持应用内更新，请通过系统包管理器获取新版本",
		}, ""
	}

	// 获取更新信息
	manifest, err := fetchAppcast()
	if err != nil {
		log.Errorf("[update_service] CheckUpdate: 拉取更新信息失败: %v", err)
		return UpdateInfoResponse{}, "检查更新失败，请检查网络后重试"
	}

	// 解析平台条目
	entry, ok := resolvePlatformEntry(manifest)
	if !ok || !isAllowedURL(entry.InstallerURL) {
		return UpdateInfoResponse{HasUpdate: false, CurrentVersion: current}, ""
	}

	// 本地是否已下载更新包：一致则无需再下载.
	ready := s.isUpdateReady(entry)

	log.Infof("[update_service] CheckUpdate 当前 %s，服务端 %s（%s）ready=%v", current, entry.Version, entry.ArtifactType, ready)
	return UpdateInfoResponse{
		HasUpdate:      compareVersion(entry.Version, current) > 0,
		CurrentVersion: current,
		LatestVersion:  entry.Version,
		UpdateReady:    ready,
		ReleaseDate:    entry.ReleaseDate,
		ReleaseNotes:   strings.TrimSpace(entry.NotesZh),
		DownloadURL:    entry.InstallerURL,
		SHA256:         entry.SHA256,
		ArtifactType:   entry.ArtifactType,
	}, ""
}

// getCheckCache 读取检查结果会话缓存（无则 nil）。
func (s *UpdateService) getCheckCache() *UpdateInfoResponse {
	s.checkCacheMu.Lock()
	defer s.checkCacheMu.Unlock()
	return s.checkCache
}

// setCheckCache 写入检查结果会话缓存。
func (s *UpdateService) setCheckCache(info UpdateInfoResponse) {
	s.checkCacheMu.Lock()
	s.checkCache = &info
	s.checkCacheMu.Unlock()
}

// isUpdateReady 判断本地是否已有“与给定服务端版本一致”的已下载更新包。
func (s *UpdateService) isUpdateReady(entry dto.AppcastPlatform) bool {
	updateDir := s.updateDir()
	if _, err := os.Stat(filepath.Join(updateDir, config.GlobalConfig.App.Update.PackageFile)); err != nil {
		log.Errorf("[update_service] isUpdateReady 更新包缺失 %s", err)
		return false
	}
	// 读取元数据
	meta, err := s.loadUpdateMeta(updateDir)
	if err != nil {
		log.Errorf("[update_service] isUpdateReady 更新包元数据缺失 %s", err)
		return false // 缺少元数据则无法确认版本，保守视为未就绪
	}
	// 校验本地更新包是否与远程一致（版本+形态）
	return validateUpdatePkg(meta, entry)
}

// saveUpdateMeta 在下载成功后持久化更新包元信息（版本+形态），供下次运行复用。
func (s *UpdateService) saveUpdateMeta(updateDir string, meta updateMeta) error {
	data, err := json.Marshal(meta)
	if err != nil {
		log.Errorf("[update_service] saveUpdateMeta 序列化更新包元数据失败: %v", err)
		return err
	}
	return os.WriteFile(filepath.Join(updateDir, updateMetaFile), data, 0644)
}

// loadUpdateMeta 读取已下载更新包的元信息；不存在或损坏时返回错误。
func (s *UpdateService) loadUpdateMeta(updateDir string) (updateMeta, error) {
	var meta updateMeta
	data, err := os.ReadFile(filepath.Join(updateDir, updateMetaFile))
	if err != nil {
		return meta, err
	}
	err = json.Unmarshal(data, &meta)
	return meta, err
}

// validateUpdatePkg 校验本地更新包是否与远程一致（版本+形态）。
func validateUpdatePkg(meta updateMeta, entry dto.AppcastPlatform) bool {
	return meta.Version == entry.Version && meta.ArtifactType == entry.ArtifactType
}

// doDownload 在后台 goroutine 中执行下载全流程：下载 → sha256 校验 →
// 落地正式包 → 平台后处理 → 记录元信息，完成后经 update:result 通知前端。
func (s *UpdateService) doDownload(path, sha256Hex string) {
	defer s.state.Store(-1) // 结束统一回到空闲态，供后续再次下载

	// 完成（成功/失败/取消）时释放取消句柄，避免悬挂引用。
	defer func() {
		s.cancelMu.Lock()
		if s.cancel != nil {
			s.cancel()
		}
		s.cancel = nil
		s.cancelMu.Unlock()
	}()

	// 把下载结果经事件推送给前端（对话框可能已关闭/重开，不依赖同步返回）。
	emitResult := func(success bool, msg string) {
		if success {
			s.App.Event.Emit(event.UPDATE_RESULT, "ok")
		} else {
			s.App.Event.Emit(event.UPDATE_RESULT, "error:"+msg)
		}
	}

	updateDir := s.updateDir()
	if err := os.MkdirAll(updateDir, 0755); err != nil {
		log.Errorf("[update_service] doDownload 创建更新目录失败: %v", err)
		emitResult(false, "创建更新目录失败")
		return
	}

	// 清理旧包，目录内恒为最新一份
	cleanUpdateArtifacts(updateDir)

	ctx, cancel := context.WithCancel(context.Background())
	s.cancelMu.Lock()
	s.cancel = cancel
	s.cancelMu.Unlock()

	// 下载 + 流式哈希
	tmpPath := filepath.Join(updateDir, config.GlobalConfig.App.Update.PackageTmp)
	hashHex, err := s.download(ctx, path, tmpPath)
	if err != nil {
		os.Remove(tmpPath)
		if ctx.Err() != nil {
			log.Infof("[update_service] doDownload: 下载已取消")
			emitResult(false, "下载已取消")
			return
		}
		log.Errorf("[update_service] doDownload 下载失败: %v", err)
		emitResult(false, "下载失败，请检查网络后重试")
		return
	}

	// sha256 校验：不通过则删除文件并报错
	if hashHex != sha256Hex {
		os.Remove(tmpPath)
		log.Errorf("[update_service] doDownload sha256 不匹配（期望 %s，实际 %s）", sha256Hex, hashHex)
		emitResult(false, "更新包校验失败，已丢弃")
		return
	}

	// 落地为正式包名
	pkgPath := filepath.Join(updateDir, config.GlobalConfig.App.Update.PackageFile)
	if err := os.Rename(tmpPath, pkgPath); err != nil {
		os.Remove(tmpPath)
		log.Errorf("[update_service] doDownload 保存更新包失败: %v", err)
		emitResult(false, "保存更新包失败")
		return
	}

	// 平台后处理
	switch runtime.GOOS {
	case "darwin":
		if err := extractAppBundle(pkgPath, updateDir); err != nil {
			log.Errorf("[update_service] doDownload 解压更新包失败: %v", err)
			emitResult(false, "更新包解压失败")
			return
		}
	case "linux":
		if err := os.Chmod(pkgPath, 0755); err != nil {
			log.Errorf("[update_service] doDownload 设置执行权限失败: %v", err)
			emitResult(false, "准备更新包失败")
			return
		}
	}

	// 记录更新包元信息（版本+形态），供下次运行 CheckUpdate 时判定“已下载就绪”，
	// 避免用户未立即安装、下次想装时重新下载。版本取自本次会话的检查缓存。
	if cached := s.getCheckCache(); cached != nil {
		_ = s.saveUpdateMeta(updateDir, updateMeta{
			Version:      cached.LatestVersion,
			ArtifactType: cached.ArtifactType,
			DownloadedAt: time.Now().Format(time.RFC3339),
		})
	}

	// 给前端推送 100% 进度 + 完成通知
	s.App.Event.Emit(event.UPDATE_PROGRESS, 100)
	s.App.Event.Emit(event.UPDATE_RESULT, "ok")
	log.Infof("[update_service] doDownload: 更新包已就绪 %s（sha256 %s…）", pkgPath, hashHex[:12])
}

// download 执行下载：写入 dst，边下边算 sha256 与推送进度，返回文件哈希。
// 走 remote/http 标准库后端（NewStdHttpClient）流式传输（WithDoNotParse），
// 避免 resty 缓冲把大文件整体读入内存；不设整体超时，仅依赖调用方 ctx 控制
// 生命周期与取消。
func (s *UpdateService) download(ctx context.Context, path, dst string) (string, error) {
	client := ghttp.NewStdHttpClient("gosume.UpdateService", ghttp.WithForceHTTP1())
	resp, err := client.Get(ctx, path, nil, ghttp.WithDoNotParse())
	if err != nil {
		log.Errorf("[update_service] download: 下载失败: %v", err)
		return "", err
	}

	// 总大小未知时按已下载字节数上报，Content-Length 缺失则置 -1
	total := int64(-1)
	if v := resp.Header().Get("Content-Length"); v != "" {
		if n, perr := strconv.ParseInt(v, 10, 64); perr == nil {
			total = n
		}
	}

	f, err := os.Create(dst)
	if err != nil {
		log.Errorf("[update_service] download: 创建更新包文件失败: %v", err)
		return "", err
	}
	defer f.Close()

	hasher := sha256.New()
	pr := &progressReader{
		r:     io.TeeReader(resp.Body(), hasher),
		total: total,
		emit: func(pct int, read, total int64) {
			// 百分比模式发 pct（0-100）；未知总大小时发已下载字节数
			if total > 0 {
				s.App.Event.Emit(event.UPDATE_PROGRESS, pct)
				s.state.Store(int32(pct)) // 同步内存进度，供前端重新打开对话框时续显
			} else {
				s.App.Event.Emit(event.UPDATE_PROGRESS, int(read))
				s.state.Store(0) // 总大小未知：仅标记“下载中”，进度按事件推送的字节数展示
			}
		},
	}
	if _, err := io.Copy(f, pr); err != nil {
		log.Errorf("[update_service] download: 写入更新包文件失败: %v", err)
		return "", err
	}
	return hex.EncodeToString(hasher.Sum(nil)), nil
}

// fetchAppcast 拉取并解析服务端 appcast.json（走 remote 统一客户端）。
// appcast 为小文件，请求级超时收紧到 10s（覆盖服务配置的不设整体超时）；
// 静态托管的 appcast.json Content-Type 可能不规范，强制按 JSON 解析。
func fetchAppcast() (*dto.AppcastManifest, error) {
	var m dto.AppcastManifest
	client := ghttp.NewHttpClient("gosume.UpdateService")
	resp, err := client.Get(context.Background(), "/appcast.json", &m,
		ghttp.WithTimeout(10*time.Second),
		ghttp.WithForceJSON(),
	)
	if err != nil {
		return nil, err
	}

	// 响应体上限 1MB，防御异常响应拖垮内存
	if resp.Size() > 1<<20 {
		return nil, fmt.Errorf("appcast 响应过大: %d bytes", resp.Size())
	}
	return &m, nil
}

// resolvePlatformEntry 按本机环境解析 appcast 平台条目（方案 §5.1.1）。
// darwin 优先 universal 条目（双架构合一），无则回退本机架构。
func resolvePlatformEntry(m *dto.AppcastManifest) (dto.AppcastPlatform, bool) {
	var keys []string
	switch runtime.GOOS {
	case "darwin":
		keys = []string{"darwin-universal", "darwin-" + runtime.GOARCH}
	default:
		keys = []string{runtime.GOOS + "-" + runtime.GOARCH}
	}
	for _, k := range keys {
		if e, ok := m.Platforms[k]; ok {
			return e, true
		}
	}
	return dto.AppcastPlatform{}, false
}

// progressReader 包装下载流：按「每 1% 或每 100ms」节流上报进度。
type progressReader struct {
	r        io.Reader
	total    int64 // Content-Length，未知为 -1
	read     int64
	lastPct  int // 上次上报的百分比
	lastEmit time.Time
	emit     func(pct int, read, total int64)
}

func (pr *progressReader) Read(p []byte) (int, error) {
	n, err := pr.r.Read(p)
	pr.read += int64(n)

	if pr.emit != nil && n > 0 {
		now := time.Now()
		if pr.total > 0 {
			pct := int(float64(pr.read) / float64(pr.total) * 100)
			if pct > pr.lastPct && (pct >= pr.lastPct+1 || now.Sub(pr.lastEmit) >= 100*time.Millisecond) {
				pr.emit(pct, pr.read, pr.total)
				pr.lastPct = pct
				pr.lastEmit = now
			}
		} else if now.Sub(pr.lastEmit) >= 200*time.Millisecond {
			// 总大小未知：按时间节流上报字节数
			pr.emit(-1, pr.read, pr.total)
			pr.lastEmit = now
		}
	}
	return n, err
}

// extractAppBundle 把 app-zip 更新包解压到 updates/，并校验 .app 结构完整。
func extractAppBundle(zipPath, updateDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("open zip: %w", err)
	}
	defer r.Close()

	appName := config.GlobalConfig.App.Name
	for _, f := range r.File {
		// Zip Slip 防护：拒绝绝对路径与 .. 上跳
		name := filepath.Clean(strings.TrimPrefix(f.Name, "/"))
		if filepath.IsAbs(name) || strings.HasPrefix(name, "..") {
			return fmt.Errorf("illegal path in archive: %s", f.Name)
		}
		dst := filepath.Join(updateDir, name)
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(dst, f.Mode()); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
			return err
		}
		if err := extractZipFile(f, dst); err != nil {
			return err
		}
	}

	// 校验 .app 结构：Contents/MacOS/<AppName> 必须存在
	bin := filepath.Join(updateDir, appName+".app", "Contents", "MacOS", appName)
	if _, err := os.Stat(bin); err != nil {
		os.RemoveAll(filepath.Join(updateDir, appName+".app"))
		return fmt.Errorf("app bundle structure missing")
	}
	return nil
}

// extractZipFile 解压单个 zip 条目，保留可执行权限。
func extractZipFile(f *zip.File, dst string) error {
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, f.Mode())
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, rc)
	return err
}

// cleanUpdateArtifacts 下载前清理 updates/ 内残留的临时包与既往解压产物。
// 刻意保留上一份可用的正式安装包（Update.PackageFile）：若本次下载/校验失败，
// 旧包仍可备用，不会被误删；新包校验通过后rename会原子覆盖旧包。
func cleanUpdateArtifacts(updateDir string) {
	os.Remove(filepath.Join(updateDir, config.GlobalConfig.App.Update.PackageTmp))
	os.Remove(filepath.Join(updateDir, config.GlobalConfig.App.Update.UnixHelperScript))
	os.RemoveAll(filepath.Join(updateDir, config.GlobalConfig.App.Name+".app"))
}

// updateDir 更新工作目录 {dataDir}/updates/。
func (s *UpdateService) updateDir() string {
	return filepath.Join(s.configMgr.DataDir(), "updates")
}

// setDownloadCancel 记录/清除当前下载的取消函数。
func (s *UpdateService) setDownloadCancel(cancel context.CancelFunc) {
	s.cancelMu.Lock()
	s.cancel = cancel
	s.cancelMu.Unlock()
}

// isAllowedURL 校验下载地址：必须 HTTPS 且域名在白名单内（含一级子域）。
func isAllowedURL(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return false
	}
	host := u.Hostname()
	for _, allowed := range allowedDownloadHosts {
		if host == allowed || strings.HasSuffix(host, "."+allowed) {
			return true
		}
	}
	return false
}

// compareVersion 比较 x.y.z 格式版本号：a>b 返回 1，a<b 返回 -1，相等返回 0。
// 逐段比较数字部分；数字相等时，无预发布后缀的正式版（如 2.0.0）大于带后缀的
// 预发布版（如 2.0.0-beta），从而能正确提示从预发布升级到正式版。
// 非法段按 0 处理（如 1.0 视为 1.0.0）。
func compareVersion(a, b string) int {
	pa := strings.Split(strings.TrimSpace(a), ".")
	pb := strings.Split(strings.TrimSpace(b), ".")
	n := len(pa)
	if len(pb) > n {
		n = len(pb)
	}
	for i := 0; i < n; i++ {
		var segA, segB string
		if i < len(pa) {
			segA = pa[i]
		}
		if i < len(pb) {
			segB = pb[i]
		}
		numA, preA := splitSegment(segA)
		numB, preB := splitSegment(segB)
		if numA != numB {
			if numA > numB {
				return 1
			}
			return -1
		}
		// 数字相等：正式版（无后缀）优先于预发布版
		relA, relB := preA == "", preB == ""
		if relA != relB {
			if relA {
				return 1
			}
			return -1
		}
		// 均为预发布且后缀不同：按后缀字面比较（同段内粗粒度排序）
		if !relA && preA != preB {
			if preA > preB {
				return 1
			}
			return -1
		}
	}
	return 0
}

// splitSegment 解析单个版本段为数字部分与预发布/元数据后缀。
// 只取首个 '-' 或 '+' 之前的数字部分，非法内容按 0 处理。
func splitSegment(seg string) (int, string) {
	pre := ""
	if i := strings.IndexAny(seg, "-+"); i >= 0 {
		seg, pre = seg[:i], seg[i:]
	}
	num, _ := strconv.Atoi(strings.TrimSpace(seg))
	return num, pre
}
