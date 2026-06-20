package template

import (
	"archive/zip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadPackageFromZip(t *testing.T) {
	path := writeTemplatePackage(t, map[string]string{
		"template.json": `{
			"id": "local_test_template",
			"name": "Local Test",
			"version": "1.0.0",
			"author": {"name": "Gosume"},
			"description": "A local import test template",
			"paper_size": "A4"
		}`,
		"template.html": `<!DOCTYPE html>
<html>
<head><style>{{template "styles.css" .}}</style></head>
<body>
	<h1>{{.Personal.FullName}}</h1>
	{{if .Jobs}}{{range .Jobs}}<p>{{.Company}}</p>{{end}}{{end}}
</body>
</html>`,
		"styles.css": `body { font-family: sans-serif; }`,
	})

	pkg, err := LoadPackageFromZip(path)
	if err != nil {
		t.Fatalf("LoadPackageFromZip() error = %v", err)
	}
	if pkg.Meta.ID != "local_test_template" {
		t.Fatalf("Meta.ID = %q", pkg.Meta.ID)
	}
	if pkg.Meta.Category != "custom" {
		t.Fatalf("default category = %q", pkg.Meta.Category)
	}
}

func TestLoadPackageFromZipRejectsUnsupportedPreviewSyntax(t *testing.T) {
	path := writeTemplatePackage(t, map[string]string{
		"template.json": `{
			"id": "local_bad_template",
			"name": "Local Bad",
			"version": "1.0.0",
			"author": {"name": "Gosume"},
			"paper_size": "A4"
		}`,
		"template.html": `{{if eq .Meta.Language "zh-CN"}}中文{{end}}`,
		"styles.css":    `body { color: #111; }`,
	})

	_, err := LoadPackageFromZip(path)
	if err == nil {
		t.Fatal("LoadPackageFromZip() expected error")
	}
	if !strings.Contains(err.Error(), "unsupported template control expression") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func writeTemplatePackage(t *testing.T, files map[string]string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "template.gosume-template")
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create package: %v", err)
	}
	defer f.Close()

	zw := zip.NewWriter(f)
	for name, content := range files {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatalf("create zip entry: %v", err)
		}
		if _, err := w.Write([]byte(content)); err != nil {
			t.Fatalf("write zip entry: %v", err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip: %v", err)
	}

	return path
}
