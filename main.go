package main

import (
	"embed"

	"gosume/pkg/app"
	"gosume/pkg/appconfig"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed all:templates
var builtinTemplates embed.FS

func main() {
	appCfg := appconfig.Load()
	app.New(assets, builtinTemplates, appCfg).Run()
}
