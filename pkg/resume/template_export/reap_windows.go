//go:build windows

package template_export

import (
	"encoding/base64"
	"os/exec"
	"strings"
	"unicode/utf16"

	"gosume/pkg/log"
)

// reapLeftoverBrowsers 回收上次会话残留的无头浏览器进程（Windows 实现）。
//
// 禁用 leakless 后，主进程被强杀/崩溃时浏览器不会随主进程退，残留进程会锁住固定
// 的 profile 目录与调试端口，导致下次启动连上半死实例报 "unexpected EOF"，或新
// Edge 因 profile 被锁启动即退。故在每次全新启动前，按命令行关键字把仍占着本站
// 调试端口 / profile 目录的 Chrome、Edge 进程强杀。
//
// 用 PowerShell 的 Get-CimInstance 枚举 + taskkill 清理：跨 PowerShell 版本稳定，
// 且 CIM 查询 + 进程终止是常规系统操作，不会触发杀软对"可执行文件执行"那类误报。
func reapLeftoverBrowsers(markers []string) {
	if len(markers) == 0 {
		return
	}
	conds := make([]string, 0, len(markers))
	for _, m := range markers {
		if m == "" {
			continue
		}
		// PowerShell -like 通配匹配，内部单引号翻倍转义
		esc := strings.ReplaceAll(m, "'", "''")
		// 注意：表达式内部必须用 -or（表达式运算符），语句级关键字 or 在 Where-Object
		// {} 里会解析失败报 "Unexpected token 'or'"（退出码1）。
		conds = append(conds, "($_.CommandLine -like '*"+esc+"*')")
	}
	if len(conds) == 0 {
		return
	}
	// 进程名限定在 Chromium 系，避免误杀用户日常使用的同名进程之外的东西
	script := "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' or Name='msedge.exe' or Name='chromium.exe'\" | " +
		"Where-Object {" + strings.Join(conds, " -or ") + "} | " +
		"ForEach-Object { taskkill /F /T /PID $_.ProcessId *> $null }"

	// 用 -EncodedCommand 而非 -Command：后者会反向处理脚本内的双引号（把 -Filter
	// "Name=..." 的引号剥掉，or 变成位置参数→Get-CimInstance 直接报错），导致脚本
	// 每次解析失败。UTF-16LE 的 base64 编码后传给 -EncodedCommand 可百分之百保留
	// 原始脚本，杜绝引号/转义问题。
	if err := exec.Command("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
		"-EncodedCommand", encodePSCommand(script)).Run(); err != nil {
		// 清理失败不致命：让正常启动路径兜底，避免因清理异常阻断导出
		log.Warnf("[browser] 清理残留浏览器进程失败: %v", err)
	}
}

// encodePSCommand 把 PowerShell 脚本编码为 -EncodedCommand 所需的 UTF-16LE + base64。
func encodePSCommand(script string) string {
	u := utf16.Encode([]rune(script))
	buf := make([]byte, 0, len(u)*2)
	for _, v := range u {
		buf = append(buf, byte(v), byte(v>>8)) // 小端
	}
	return base64.StdEncoding.EncodeToString(buf)
}