//go:build darwin || linux

package helper

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"

	"gosume/pkg/config"
	"gosume/pkg/util"
)

// Start 按平台启动分离的 Helper 进程：等主进程退出（最多 120s）后静默替换
// 并重启新版本。darwin 走 .app 包替换（方案 §6.5.2），linux 走 AppImage
// 覆盖（方案 §6.5.3），差异收在本文件内，对调用方呈现统一入口。
func Start(updateDir, pkgPath, execPath string, trackHelper func(*exec.Cmd)) error {
	if runtime.GOOS == "darwin" {
		return startDarwinHelper(updateDir, execPath, trackHelper)
	}
	return startLinuxHelper(updateDir, pkgPath, execPath, trackHelper)
}

// waitForExitSnippet 返回等待指定进程退出的 shell 片段（最多 timeoutSec 秒）。
// kill -0 仅探测进程存在（不发信号），进程已退出或超时则继续执行后续命令。
func waitForExitSnippet(pid, timeoutSec int) string {
	return fmt.Sprintf("i=0; while kill -0 %d 2>/dev/null && [ $i -lt %d ]; do sleep 1; i=$((i+1)); done", pid, timeoutSec)
}

// startDarwinHelper 启动 shell 脚本 Helper（方案 §6.5.2）：等主进程退出 → rm 旧 .app → mv 新 .app 至原路径 → open 重启。
func startDarwinHelper(updateDir, execPath string, trackHelper func(*exec.Cmd)) error {
	// .app 根 = execPath 向上三层（…/Gosume.app/Contents/MacOS/Gosume）
	appRoot := filepath.Dir(filepath.Dir(filepath.Dir(execPath)))
	if !strings.HasSuffix(appRoot, ".app") {
		return fmt.Errorf("应用不在 .app 包内(%s), 无法自动更新", execPath)
	}

	// 校验新 .app 已解压就绪
	appName := config.GlobalConfig.App.Name
	newApp := filepath.Join(updateDir, appName+".app")
	if _, err := os.Stat(filepath.Join(newApp, "Contents", "MacOS", appName)); err != nil {
		return fmt.Errorf("新版本 .app 未就绪: %w", err)
	}

	// 写权限预检：无权限直接报错，避免「旧包已删、新包搬不进」的中间态
	if err := checkDirWritable(filepath.Dir(appRoot)); err != nil {
		return fmt.Errorf("无应用目录写权限: %w", err)
	}

	script := fmt.Sprintf("#!/bin/sh\n"+
		"%s\n"+
		"rm -rf %s && mv %s %s && open %s\n",
		waitForExitSnippet(os.Getpid(), 120),
		util.ShQuote(appRoot), util.ShQuote(newApp), util.ShQuote(appRoot), util.ShQuote(appRoot))

	return runScriptHelper(updateDir, script, trackHelper)
}

// startLinuxHelper 启动 shell 脚本 Helper（方案 §6.5.3）：
// 等主进程退出 → mv 新 AppImage 覆盖原文件 → 后台启动新版本。
func startLinuxHelper(updateDir, pkg, execPath string, trackHelper func(*exec.Cmd)) error {
	// AppImage 运行时 os.Executable() 指向挂载点，真实文件路径在 APPIMAGE 环境变量
	appPath := os.Getenv("APPIMAGE")
	if appPath == "" {
		appPath = execPath
	}

	// 写权限预检：无权限直接报错，不进入替换流程
	if err := checkDirWritable(filepath.Dir(appPath)); err != nil {
		return fmt.Errorf("无安装位置写权限: %w", err)
	}

	script := fmt.Sprintf("#!/bin/sh\n"+
		"%s\n"+
		"mv %s %s && chmod +x %s && nohup %s >/dev/null 2>&1 &\n",
		waitForExitSnippet(os.Getpid(), 120),
		util.ShQuote(pkg), util.ShQuote(appPath), util.ShQuote(appPath), util.ShQuote(appPath))

	return runScriptHelper(updateDir, script, trackHelper)
}

// runScriptHelper 把脚本写入 updates/ 并以独立会话启动（主进程退出不连带终止）。
//
// 脚本落盘（而非 -c 传参）：路径含空格时引号转义复杂度可控，且便于排查。
func runScriptHelper(updateDir, script string, trackHelper func(*exec.Cmd)) error {
	scriptPath := filepath.Join(updateDir, config.GlobalConfig.App.UpdateHelperScript)
	if err := os.WriteFile(scriptPath, []byte(script), 0755); err != nil {
		return err
	}
	cmd := exec.Command("sh", scriptPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true} // 脱离会话

	// 回调进行Helper跟踪
	trackHelper(cmd)

	// 只 Start 不 Wait——Helper 必须在主进程退出后继续存活
	return cmd.Start()
}

// checkDirWritable 探测目录可写性：尝试创建并删除临时探测文件。
func checkDirWritable(dir string) error {
	probe := filepath.Join(dir, ".gosume-update-probe")
	f, err := os.OpenFile(probe, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0644)
	if err != nil {
		return err
	}
	f.Close()
	return os.Remove(probe)
}
