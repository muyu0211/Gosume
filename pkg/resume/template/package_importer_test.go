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
	if !strings.Contains(pkg.CSS, "sans-serif") {
		t.Fatalf("CSS not loaded: %q", pkg.CSS)
	}
}

// TestLoadPackageFromZipRequiresCss verifies styles.css is mandatory.
func TestLoadPackageFromZipRequiresCss(t *testing.T) {
	path := writeTemplatePackage(t, map[string]string{
		"template.json": `{
			"id": "local_no_css",
			"name": "No CSS",
			"version": "1.0.0",
			"author": {"name": "Gosume"},
			"paper_size": "A4"
		}`,
	})

	_, err := LoadPackageFromZip(path)
	if err == nil || !strings.Contains(err.Error(), "missing required file") {
		t.Fatalf("expected missing required file error, got: %v", err)
	}
}

// TestLoadPackageFromZipIgnoresLegacyHTML 验证：历史模板包即使携带
// template.html（含任意模板语法/函数），Gosume 一期改造后也宽松忽略，
// 只取 css+json —— 用户无法再通过 HTML 干预数据形态。
func TestLoadPackageFromZipIgnoresLegacyHTML(t *testing.T) {
	path := writeTemplatePackage(t, map[string]string{
		"template.json": `{
			"id": "local_legacy_html",
			"name": "Legacy HTML",
			"version": "1.0.0",
			"author": {"name": "Gosume"},
			"paper_size": "A4"
		}`,
		// 历史包中曾要求 HTML 语法受限，现在这些内容被整体忽略
		"template.html": `{{if index .Jobs 0}}中文{{end}}{{safeURL .Personal.Avatar}}`,
		"styles.css":    `body { color: #111; }`,
	})

	pkg, err := LoadPackageFromZip(path)
	if err != nil {
		t.Fatalf("LoadPackageFromZip() with legacy html error = %v", err)
	}
	if pkg.Meta.ID != "local_legacy_html" {
		t.Fatalf("Meta.ID = %q", pkg.Meta.ID)
	}
}

func writeTemplatePackage(t *testing.T, files map[string]string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "template.zip")
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
