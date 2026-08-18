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
	config.Load()
	app.New(assets, builtinTemplates).Run()
}
