package setting

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"gosume/pkg/event"
	"gosume/pkg/log"
	"gosume/pkg/util"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// 模态内文件浏览器单次最多返回的条目数，避免超大目录把整份列表塞进 IPC。
const maxBrowserEntries = 500

// fileBrowserComputerRoot 是「此电脑」虚拟根节点：Windows 下列出所有磁盘，
// 非 Windows 下列出文件系统根。磁盘根的上一级回到该节点，从而可跨盘浏览。
const fileBrowserComputerRoot = "@root"

// StatFile / ReadImage 未显式给体积上限时的默认值。
const defaultStatMaxBytes = 10 << 20

// fileDropTargets 把拖放目标标记（data-file-drop-target 属性值）映射到该目标
// 允许的文件扩展名（小写）。窗口钩子据此过滤拖入的文件，再按目标广播给前端。
var fileDropTargets = map[string][]string{
	"template-import": {".zip"},
	"resume-import":   {".json", ".gosume"},
	"avatar":          {".jpg", ".jpeg", ".png", ".webp"},
}

// FileBrowserRoot 是路径选择器的快捷位置（key 由前端映射为 i18n 文案）。
type FileBrowserRoot struct {
	Key  string `json:"key"`
	Path string `json:"path"`
}

// DirectoryEntry 是目录列表中的一项：目录，或可导入的 .zip 文件。
type DirectoryEntry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"isDir"`
	Size  int64  `json:"size"`
	Ext   string `json:"ext"`
}

// DirectoryListing 是 ListDirectory 的返回负载。
// Roots 始终返回快捷位置；Parent 为空表示已到文件系统根目录。
type DirectoryListing struct {
	Path      string            `json:"path"`
	Parent    string            `json:"parent"`
	Roots     []FileBrowserRoot `json:"roots"`
	Entries   []DirectoryEntry  `json:"entries"`
	Truncated bool              `json:"truncated"`
}

// FileStat 是 StatFile 的返回负载，用于路径输入框的即时校验。
type FileStat struct {
	Path    string `json:"path"`
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	Ext     string `json:"ext"`
	Matched bool   `json:"matched"`
}

// registerFileDropHook 接收 Wails 的系统文件拖放事件，把落在带
// data-file-drop-target 标记元素上的文件绝对路径按目标广播给前端。
//
// Wails runtime 只把落在带标记元素上的拖放上报为有效目标，且 DropTargetDetails
// 会带上该元素的属性；这里按属性值查 fileDropTargets 过滤扩展名，避免模板模态
// 收到图片、头像区收到 zip 之类的串扰。
func (s *SystemService) registerFileDropHook(win *application.WebviewWindow) {
	win.OnWindowEvent(events.Common.WindowFilesDropped, func(wEvent *application.WindowEvent) {
		details := wEvent.Context().DropTargetDetails()
		if details == nil {
			return
		}
		target := details.Attributes["data-file-drop-target"]
		exts, ok := fileDropTargets[target]
		if !ok {
			return
		}

		paths := make([]string, 0, 1)
		for _, p := range wEvent.Context().DroppedFiles() {
			if matchesExt(p, exts) {
				paths = append(paths, p)
			}
		}
		if len(paths) == 0 {
			log.Warnf("[setting.file_browser] 拖入目标 %s 不含可接受扩展名的文件，忽略", target)
			return
		}
		s.App.Event.Emit(event.FILE_DROPPED, event.FileDropped{Target: target, Paths: paths})
	})
}

// matchesExt 判断路径扩展名（大小写不敏感）是否在允许列表内。
func matchesExt(path string, exts []string) bool {
	ext := strings.ToLower(filepath.Ext(strings.TrimSpace(path)))
	for _, e := range exts {
		if ext == strings.ToLower(e) {
			return true
		}
	}
	return false
}

// ListDirectory 返回指定目录的元数据列表，供自绘文件选择模态内的路径选择器使用。
// path 为空时从用户主目录开始；列表只含目录与扩展名命中 accept 的文件，
// 不读取任何文件内容。accept 为空时放行所有普通文件。
func (s *SystemService) ListDirectory(path string, accept []string) *util.Response {
	home, err := os.UserHomeDir()
	if err != nil {
		log.Errorf("[setting.file_browser] 获取用户主目录失败: %v", err)
		return util.DoRsp(util.ErrCode, "无法读取文件目录", nil)
	}

	// 「此电脑」虚拟根：列出本机所有可用磁盘，供用户从 C 盘之外的盘符进入。
	if strings.TrimSpace(path) == fileBrowserComputerRoot {
		return util.DoRsp(util.SuccCode, "成功", &DirectoryListing{
			Path:    fileBrowserComputerRoot,
			Roots:   s.fileBrowserRoots(home),
			Entries: volumeEntries(),
		})
	}

	dir := home
	if strings.TrimSpace(path) != "" {
		dir, err = util.NormalizeFilePath(path)
		if err != nil {
			return util.DoRsp(util.ErrCode, "路径无效", nil)
		}
	}

	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		log.Warnf("[setting.file_browser] 目录不可读 %s: %v", dir, err)
		return util.DoRsp(util.ErrCode, "目录不存在或无法读取", nil)
	}

	rawEntries, err := os.ReadDir(dir)
	if err != nil {
		log.Errorf("[setting.file_browser] 读取目录失败 %s: %v", dir, err)
		return util.DoRsp(util.ErrCode, "目录不存在或无法读取", nil)
	}

	entries := make([]DirectoryEntry, 0, len(rawEntries))
	truncated := false
	for _, e := range rawEntries {
		name := e.Name()
		// 隐藏项与符号链接一律跳过（后者可能把浏览范围带出本目录）
		if strings.HasPrefix(name, ".") || e.Type()&os.ModeSymlink != 0 {
			continue
		}
		fi, err := e.Info()
		if err != nil {
			continue
		}
		isDir := fi.IsDir()
		ext := strings.ToLower(filepath.Ext(name))
		if !isDir && len(accept) > 0 && !matchesExt(name, accept) {
			continue
		}
		entries = append(entries, DirectoryEntry{
			Name:  name,
			Path:  filepath.Join(dir, name),
			IsDir: isDir,
			Size:  fi.Size(),
			Ext:   ext,
		})
		if len(entries) >= maxBrowserEntries {
			truncated = true
			break
		}
	}
	// 目录在前、文件在后，同组内按名称排序，符合常见文件选择器习惯。
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].IsDir != entries[j].IsDir {
			return entries[i].IsDir
		}
		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})

	parent := filepath.Dir(dir)
	if parent == dir {
		// 已到磁盘根（Windows 的 C:\ 或 Unix 的 /）：回到「此电脑」磁盘列表，
		// 而不是把上级置空导致其它磁盘无法进入。
		parent = fileBrowserComputerRoot
	}

	return util.DoRsp(util.SuccCode, "成功", &DirectoryListing{
		Path:      dir,
		Parent:    parent,
		Roots:     s.fileBrowserRoots(home),
		Entries:   entries,
		Truncated: truncated,
	})
}

// StatFile 校验并返回一个待选用文件的基本信息。
// accept 为允许的扩展名列表（小写，含点，如 ".zip"），为空时放行任意普通文件；
// maxBytes 为文件体积上限（字节），≤0 时使用默认 10 MB。不做任何内容读取。
func (s *SystemService) StatFile(path string, accept []string, maxBytes int64) *util.Response {
	p, err := util.NormalizeFilePath(path)
	if err != nil {
		return util.DoRsp(util.ErrCode, "路径无效", nil)
	}
	ext := strings.ToLower(filepath.Ext(p))
	matched := len(accept) == 0 || matchesExt(p, accept)

	info, err := os.Stat(p)
	if err != nil {
		log.Warnf("[setting.file_browser] 文件不可读 %s: %v", p, err)
		return util.DoRsp(util.ErrCode, "文件不存在或无法读取", nil)
	}
	if !info.Mode().IsRegular() {
		return util.DoRsp(util.ErrCode, "请选择普通文件", nil)
	}
	limit := maxBytes
	if limit <= 0 {
		limit = defaultStatMaxBytes
	}
	if info.Size() > limit {
		mb := int64(1) << 20
		return util.DoRsp(util.ErrCode, fmt.Sprintf("文件不能超过 %d MB", (limit+mb-1)/mb), nil)
	}

	return util.DoRsp(util.SuccCode, "成功", &FileStat{
		Path:    p,
		Name:    filepath.Base(p),
		Size:    info.Size(),
		Ext:     ext,
		Matched: matched,
	})
}

// fileBrowserRoots 返回快捷位置；虚拟根始终存在，真实目录只保留可访问的。
func (s *SystemService) fileBrowserRoots(home string) []FileBrowserRoot {
	candidates := []FileBrowserRoot{
		{Key: "computer", Path: fileBrowserComputerRoot},
		{Key: "home", Path: home},
		{Key: "desktop", Path: filepath.Join(home, "Desktop")},
		{Key: "downloads", Path: filepath.Join(home, "Downloads")},
	}
	if s.configMgr != nil {
		candidates = append(candidates, FileBrowserRoot{Key: "dataDir", Path: s.configMgr.DataDir()})
	}
	roots := make([]FileBrowserRoot, 0, len(candidates))
	for _, c := range candidates {
		if c.Key == "computer" {
			roots = append(roots, c)
			continue
		}
		if fi, err := os.Stat(c.Path); err == nil && fi.IsDir() {
			roots = append(roots, c)
		}
	}
	return roots
}

// volumeEntries 枚举本机磁盘（Windows 逐个探测 A: ~ Z:），非 Windows 返回文件系统根。
func volumeEntries() []DirectoryEntry {
	if runtime.GOOS != "windows" {
		return []DirectoryEntry{{Name: "/", Path: "/", IsDir: true}}
	}
	entries := make([]DirectoryEntry, 0, 4)
	// 跳过 A:/B:（传统软驱，探测可能触发设备等待），从 C: 开始即可覆盖
	// 本地硬盘、光驱与映射的网络驱动器。
	for c := 'C'; c <= 'Z'; c++ {
		p := fmt.Sprintf("%c:\\", c)
		if fi, err := os.Stat(p); err == nil && fi.IsDir() {
			entries = append(entries, DirectoryEntry{Name: p, Path: p, IsDir: true})
		}
	}
	return entries
}
