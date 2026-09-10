//go:build !windows

package template_export

import "os/exec"

// reapLeftoverBrowsers 回收上次会话残留的无头浏览器进程（Unix 实现）。
//
// 用 pkill 按命令行关键字杀掉匹配的浏览器进程。pkill 无匹配时返回码 1、信号类
// 错误返回 128+，这里统一静默忽略——清理失败交给正常启动路径兜底，不阻断导出。
func reapLeftoverBrowsers(markers []string) {
	for _, m := range markers {
		if m == "" {
			continue
		}
		_ = exec.Command("pkill", "-f", m).Run()
	}
}