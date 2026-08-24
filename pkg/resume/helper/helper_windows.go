//go:build windows

package helper

import (
	"encoding/binary"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"unsafe"
)

// psQuote 把字符串包装为 PowerShell 单引号字面量（内部单引号加倍转义）。
func psQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

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

// Start 启动分离的 PowerShell Helper（方案 §6.5.1）：
// 等主进程退出（最多 120s）→ UAC 静默安装 → 重启新版本。
//
// 关键点：
//   - 安装器 manifest 为 admin，Go 的 exec.Command 走 CreateProcess 不会触发
//     UAC 而是直接失败，必须走 ShellExecute 语义（Start-Process -Verb RunAs）；
//   - 静默重装由安装器 .onInit 读注册表自动定位旧目录，无需传 /D=；
//   - CREATE_NEW_PROCESS_GROUP 使 Helper 与主进程解耦，主进程退出不连带终止。
//
// updateDir 仅为统一签名保留（Unix 平台脚本落盘用），Windows 为内联命令，不使用。
func Start(updateDir, pkgPath, execPath string, trackHelper func(*exec.Cmd)) error {
	// 只有未提权时才需要 -Verb RunAs 触发一次 UAC 提权；
	// 若已以管理员运行则直接由提权后的 Helper 静默安装，避免多余 UAC 弹窗。
	runVerb := ""
	if !windowsElevated() {
		runVerb = "-Verb RunAs"
	}
	script := fmt.Sprintf(
		"$ErrorActionPreference='Stop'; "+
			"try { Wait-Process -Id %d -Timeout 120 } catch {}; "+
			"Start-Process -FilePath %s -ArgumentList '/S' -Wait %s; "+
			"Start-Process -FilePath %s",
		os.Getpid(), psQuote(pkgPath), runVerb, psQuote(execPath))

	cmd := exec.Command("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
		"-WindowStyle", "Hidden", "-Command", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		// 分离进程组 + CREATE_NO_WINDOW（不闪控制台窗口）
		CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP | 0x08000000,
	}
	trackHelper(cmd)
	// 只 Start 不 Wait——Helper 必须在主进程退出后继续存活
	return cmd.Start()
}
