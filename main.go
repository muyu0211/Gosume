package main

import (
	"embed"

	"gosume/pkg/app"
	"gosume/pkg/config"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed all:templates
var builtinTemplates embed.FS

func main() {
	// 加载应用级配置
	config.Load()
	app.New(assets, builtinTemplates).Run()
}
