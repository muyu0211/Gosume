package service

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
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
	"gosume/pkg/remote/http"
	"gosume/pkg/resume/helper"
	"gosume/pkg/user_config"
	"gosume/pkg/util"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// allowedDownloadHosts 允许下载更新包的域名白名单。
// 防止 appcast 被篡改后指向任意可执行文件；TODO(更新服务)：替换为真实 CDN 域名。
var allowedDownloadHosts = []string{
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
	state        atomic.Int32         // 下载状态：0=idle、1=downloading，防止并发下载。
	cancel       context.CancelFunc   //  取消正在进行的下载。
	cancelMu     sync.Mutex           // 下载取消锁。
	helper       *exec.Cmd            // 等待主进程退出的 Helper 进程（CancelUpdate 可终止）。
	helperMu     sync.Mutex           // helper 互斥锁
	checkCache   *UpdateInfoResponse  // 检查结果会话缓存：仅成功结果入缓存，进程生命周期内有效
	checkCacheMu sync.Mutex           // 检查缓存锁
	checkMu      sync.Mutex           // 检查执行串行锁：并发调用时后者等待前者完成并命中缓存
}

// ---------- appcast 协议 ----------

// appcastManifest 服务端 appcast.json 的根结构。
type appcastManifest struct {
	Product   string                     `json:"product"`
	Channel   string                     `json:"channel"`
	Platforms map[string]appcastPlatform `json:"platforms"`
}

// appcastPlatform 单个平台的更新条目。
type appcastPlatform struct {
	Version      string `json:"version"`
	ReleaseDate  string `json:"release_date"`
	NotesZh      string `json:"notes_zh"`
	NotesEn      string `json:"notes_en"`
	ArtifactType string `json:"artifact_type"`
	InstallerURL string `json:"installer_url"`
	SHA256       string `json:"sha256"`
	Mandatory    bool   `json:"mandatory"` // 预留（P3 强制更新），本期忽略
}

// UpdateInfoResponse 检查更新返回的更新信息。
type UpdateInfoResponse struct {
	HasUpdate      bool   `json:"has_update"`               // 是否存在新版本
	CurrentVersion string `json:"current_version"`          // 当前版本
	LatestVersion  string `json:"latest_version,omitempty"` // 最新版本号
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

	info, errMsg := s.doCheckUpdate()
	if errMsg != "" {
		return util.DoRsp(util.ErrCode, errMsg, nil)
	}
	s.setCheckCache(info)
	return util.DoRsp(util.SuccCode, "成功", info)
}

// doCheckUpdate 执行实际的检查逻辑：成功返回更新信息，失败返回错误提示。
func (s *UpdateService) doCheckUpdate() (UpdateInfoResponse, string) {
	current := config.GlobalConfig.App.Version

	// NOTE: 测试直接返回更新
	if !util.IsProd() {
		log.Infof("[CheckUpdate] Test Env 检查更新")
		return UpdateInfoResponse{
			HasUpdate:      true,
			CurrentVersion: current,
			LatestVersion:  "1.0.0",
			ReleaseDate:    "2025-12-31",
			ReleaseNotes:   "测试更新说明",
			DownloadURL:    "https://dl.example.com/gosume/gosume-1.0.0-windows-amd64.exe",
			SHA256:         "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
			ArtifactType:   "nsis-installer",
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

	log.Infof("[update_service] CheckUpdate: 当前 %s，服务端 %s（%s）", current, entry.Version, entry.ArtifactType)
	return UpdateInfoResponse{
		HasUpdate:      compareVersion(entry.Version, current) > 0,
		CurrentVersion: current,
		LatestVersion:  entry.Version,
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

// ---------- ApplyUpdate / CancelUpdate ----------

// ApplyUpdate 启动分离的 Helper 进程完成静默替换（方案 §6.5）。
//
// 成功返回后由前端走既有未保存确认流程，并经 SystemService.QuitApp
// 显式终止主进程；Helper 等主进程真正退出（最多 120s）后执行替换并重启新版本。
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
	}
	s.cancelMu.Unlock()

	s.helperMu.Lock()
	if s.helper != nil && s.helper.Process != nil {
		// Helper 在等待阶段被杀是安全的（尚未开始替换）；若已越过等待
		// 阶段则 Kill 仅结束 sh，mv/open 已由子进程接管或尚未执行。
		_ = s.helper.Process.Kill()
	}
	s.helperMu.Unlock()

	return util.DoRsp(util.SuccCode, "成功", nil)
}

// DownloadUpdate 下载更新包到 {dataDir}/updates/ 并校验 sha256（阻塞直至完成）。
//
// 进度经 update:progress 事件推送：Content-Length 已知时为 0-100 百分比；
// 未知时为已下载字节数（前端按 MB 展示）。
// macOS（app-zip）额外解压出 Gosume.app 并校验结构；Linux（appimage）补执行权限。
func (s *UpdateService) DownloadUpdate(dlURL, sha256Hex string) *util.Response {
	if !util.IsProd() {
		return util.DoRsp(util.ErrCode, "开发模式下不支持在线下载", nil)
	}

	// 状态守卫：下载中重复调用直接拒绝
	if !s.state.CompareAndSwap(0, 1) {
		return util.DoRsp(util.ErrCode, "已有下载任务进行中", nil)
	}
	defer s.state.Store(0)

	// 域名白名单 + HTTPS 校验（与 CheckUpdate 处各验一次，防窗口期不一致）
	if !isAllowedURL(dlURL) {
		return util.DoRsp(util.ErrCode, "下载地址不合法", nil)
	}
	sha256Hex = strings.ToLower(strings.TrimSpace(sha256Hex))
	if sha256Hex == "" {
		return util.DoRsp(util.ErrCode, "更新包缺少校验信息", nil)
	}

	updateDir := s.updateDir()
	if err := os.MkdirAll(updateDir, 0755); err != nil {
		log.Errorf("[update_service] DownloadUpdate: 创建更新目录失败: %v", err)
		return util.DoRsp(util.ErrCode, "创建更新目录失败", nil)
	}

	// 清理旧包，目录内恒为最新一份
	cleanUpdateArtifacts(updateDir)

	ctx, cancel := context.WithCancel(context.Background())
	s.setDownloadCancel(cancel)
	defer func() {
		cancel()
		s.setDownloadCancel(nil)
	}()

	// 下载 + 流式哈希
	tmpPath := filepath.Join(updateDir, config.GlobalConfig.App.Update.PackageTmp)
	hashHex, err := s.download(ctx, dlURL, tmpPath)
	if err != nil {
		os.Remove(tmpPath)
		if ctx.Err() != nil {
			return util.DoRsp(util.ErrCode, "下载已取消", nil)
		}
		log.Errorf("[update_service] DownloadUpdate 下载失败: %v", err)
		return util.DoRsp(util.ErrCode, "下载失败，请检查网络后重试", nil)
	}

	// sha256 校验：不通过则删除文件并报错
	if hashHex != sha256Hex {
		os.Remove(tmpPath)
		log.Errorf("[update_service] DownloadUpdate sha256 不匹配（期望 %s，实际 %s）", sha256Hex, hashHex)
		return util.DoRsp(util.ErrCode, "更新包校验失败，已丢弃", nil)
	}

	// 落地为正式包名
	pkgPath := filepath.Join(updateDir, config.GlobalConfig.App.Update.PackageFile)
	if err := os.Rename(tmpPath, pkgPath); err != nil {
		os.Remove(tmpPath)
		log.Errorf("[update_service] DownloadUpdate 保存更新包失败: %v", err)
		return util.DoRsp(util.ErrCode, "保存更新包失败", nil)
	}

	// 平台后处理
	switch runtime.GOOS {
	case "darwin":
		if err := extractAppBundle(pkgPath, updateDir); err != nil {
			log.Errorf("[update_service] DownloadUpdate 解压更新包失败: %v", err)
			return util.DoRsp(util.ErrCode, "更新包解压失败", nil)
		}
	case "linux":
		if err := os.Chmod(pkgPath, 0755); err != nil {
			log.Errorf("[update_service] DownloadUpdate 设置执行权限失败: %v", err)
			return util.DoRsp(util.ErrCode, "准备更新包失败", nil)
		}
	}

	// 给前端推送 100% 进度
	s.App.Event.Emit(event.UPDATE_PROGRESS, 100)
	log.Infof("[update_service] DownloadUpdate 更新包已就绪 %s（sha256 %s）", pkgPath, hashHex[:12])
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// download 执行下载：写入 dst，边下边算 sha256 与推送进度，返回文件哈希。
// 走 remote 统一客户端（绝对地址直接请求，忽略服务基地址）；服务配置为
// 不设整体超时，下载时长由调用方 context 控制。
func (s *UpdateService) download(ctx context.Context, dlURL, dst string) (string, error) {
	client := http.NewHttpClient("gosume.UpdateService")
	resp, err := client.Get(ctx, dlURL, nil,
		http.WithRetryCount(0), // 下载流不自动重试（重下整个包代价大），失败由用户手动重试
		http.WithDoNotParse(),  // 流式读取，避免整体读入内存
		http.WithForceHTTP1(),  // 部分网络下 HTTP/2 连接复用易被重置，下载改用 HTTP/1.1
	)
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
			} else {
				s.App.Event.Emit(event.UPDATE_PROGRESS, int(read))
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
func fetchAppcast() (*appcastManifest, error) {
	var m appcastManifest
	client := http.NewHttpClient("gosume.UpdateService")

	resp, err := client.Get(context.Background(), "/appcast.json", &m,
		http.WithTimeout(10*time.Second),
		http.WithForceJSON(),
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
func resolvePlatformEntry(m *appcastManifest) (appcastPlatform, bool) {
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
	return appcastPlatform{}, false
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
