//go:build windows

package helper

import (
	"encoding/binary"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	"gosume/pkg/config"
	"gosume/pkg/log"
	"gosume/pkg/util"
)

// windowsElevated 探测当前进程是否以管理员（提权）身份运行。
// 通过查询进程令牌的 TokenElevation 属性判定；用于决定启动安装包时是否
// 需要附加 -Verb RunAs——已提权时再 RunAs 只会多弹一次无意义的 UAC 窗。
func windowsElevated() bool {
	proc, err := syscall.GetCurrentProcess()
	if err != nil {
		return false
	}
	var token syscall.Token
	if err := syscall.OpenProcessToken(proc, syscall.TOKEN_QUERY, &token); err != nil {
		return false
	}
	defer token.Close()

	const tokenElevation = 20 // TokenInformationClass = TokenElevation
	getInfo := syscall.NewLazyDLL("advapi32.dll").NewProc("GetTokenInformation")

	// 第一次调用查询所需缓冲区大小
	var size uint32
	if r, _, _ := getInfo.Call(uintptr(token), tokenElevation, 0, 0, uintptr(unsafe.Pointer(&size))); r == 0 {
		return false
	}
	// 第二次调用写回：TokenElevation(nonzero=DWORD)=1 表示已提权
	var buf [4]byte
	if r, _, _ := getInfo.Call(uintptr(token), tokenElevation, uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)), uintptr(unsafe.Pointer(&size))); r == 0 {
		return false
	}
	return binary.LittleEndian.Uint32(buf[:]) != 0
}

// Windows 创建标志常量（golang.org/x/sys/windows 未统一导出，此处直接给值）。
const (
	createBreakawayFromJob = 0x01000000
	createNewProcessGroup  = 0x00000200
	createNoWindow         = 0x08000000
)

// Start 启动分离的 PowerShell Helper（方案 §6.5.1）：
// 等主进程退出（最多 120s）→ UAC 静默安装 → 重启新版本。
//
// 关键点：
//   - 安装器 manifest 为 admin，Go 的 exec.Command 走 CreateProcess 不会触发
//     UAC 而是直接失败，必须走 ShellExecute 语义（Start-Process -Verb RunAs）；
//   - 静默重装由安装器 .onInit 读注册表自动定位旧目录，无需传 /D=；
//   - CREATE_NEW_PROCESS_GROUP + CREATE_BREAKAWAY_FROM_JOB 使 Helper 与主进程
//     解耦：主进程退出（尤其处于 Windows 作业对象且有 KILL_ON_JOB_CLOSE 时）不连带
//     终止 Helper，避免替换/重启步骤被中途杀掉。
//   - 脚本落盘（而非内联 -Command）便于排查；执行进度写入 %TEMP%/update-helper.log。
//     注意：脚本与日志放在系统临时目录而非 updateDir——更新目录常由提权安装实例
//     创建、ACL 可能禁止非提权进程新建文件（DownloadUpdate 写 bin 用的是下载流，
//     权限不同），辅助脚本不依赖该目录可写性。
func Start(updateDir, pkgPath, execPath string, trackHelper func(*exec.Cmd)) error {
	// 只有未提权时才需要 -Verb RunAs 触发一次 UAC 提权；
	// 若已以管理员运行则直接由提权后的 Helper 静默安装，避免多余 UAC 弹窗。
	runVerb := ""
	if !windowsElevated() {
		runVerb = " -Verb RunAs"
	}

	// 脚本与日志统一落 系统临时目录（当前用户可写），实例标识后缀避免多实例互踩
	tmpDir := os.TempDir()
	u := &config.GlobalConfig.App.Update

	// 更新包落地为 .exe 再交给脚本执行：下载包统一存为 .bin（无执行扩展名、
	// 无 shell 关联），Start-Process 直接启动会立即报错并使 Stop 脚本中止，
	// 故在临时目录复制一份 .exe 副本作为安装器（NSIS 不依赖自身文件名）。
	installerExe := filepath.Join(tmpDir, u.WinInstallerExeTmp)
	if err := util.CopyFile(pkgPath, installerExe); err != nil {
		log.Errorf("[helper] Start: 复制安装器失败: %v", err)
		return err
	}

	logFile := psQuote(filepath.Join(tmpDir, u.WinHelperLog))
	logLine := func(msg string) string {
		return fmt.Sprintf(`"%s - %s" | Tee-Object -FilePath %s -Append`, "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", msg, logFile)
	}

	// 主进程名（不含扩展名）：超时后用以辨别 PID 是否仍为 Gosume 主进程，
	// 避免 PID 被无关进程复用时的误判。
	mainProcName := strings.TrimSuffix(filepath.Base(execPath), filepath.Ext(execPath))

	script := fmt.Sprintf(`$ErrorActionPreference='Stop'
									# start
									%s
									try { Wait-Process -Id %d -Timeout %d } catch { }
									$main = Get-Process -Id %d -ErrorAction SilentlyContinue
									if ($main -and $main.ProcessName -eq %s) { %s; exit 1 }
									# main exited
									%s
									# install start
									%s
									Start-Process -FilePath %s -ArgumentList '/S' -Wait%s
									# install done
									%s
									Start-Process -FilePath %s
									# restart launched
									%s
									exit 0`,
		logLine("helper start (watch pid="+fmt.Sprint(os.Getpid())+")"),
		os.Getpid(),
		u.WaitTimeoutSec,
		os.Getpid(),
		psQuote(mainProcName),
		logLine(fmt.Sprintf("main process still running after %ds, abort update", u.WaitTimeoutSec)),
		logLine("main process exited, proceeding to install"),
		logLine("installer start (silent)"),
		psQuote(installerExe), runVerb,
		logLine("installer finished"),
		psQuote(execPath),
		logLine("restarted new version"),
	)

	scriptPath := filepath.Join(tmpDir, u.WinHelperScript)
	// 先删旧脚本再写：历史版本曾以 0 权限写入使文件带只读属性，直接覆盖会失败。
	os.Remove(scriptPath)
	if err := os.WriteFile(scriptPath, []byte(script), 0644); err != nil {
		log.Errorf("[helper] Start: 写入更新脚本失败: %v", err)
		return err
	}

	cmd := exec.Command("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		// 分离进程组 + 脱离当前作业（若主进程处于作业对象则不被连带终结）+ 不闪控制台窗口
		CreationFlags: createBreakawayFromJob | createNewProcessGroup | createNoWindow,
	}
	trackHelper(cmd)
	// 只 Start 不 Wait——Helper 必须在主进程退出后继续存活
	return cmd.Start()
}

// psQuote 把字符串包装为 PowerShell 单引号字面量（内部单引号加倍转义）。
func psQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}
