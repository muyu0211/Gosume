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

//go:embed config.yaml
var cfg []byte

func main() {
	config.Load(cfg)
	app.New(assets, builtinTemplates).Run()
}
