package main

import (
	"embed"

	"gosume/pkg/app"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed all:templates
var builtinTemplates embed.FS

func main() {
	app.New(assets, builtinTemplates).Run()
}
