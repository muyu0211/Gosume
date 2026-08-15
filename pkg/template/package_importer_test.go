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
		"template.html": `{{if index .Jobs 0}}中文{{end}}`, "styles.css": `body { color: #111; }`,
	})

	_, err := LoadPackageFromZip(path)
	if err == nil {
		t.Fatal("LoadPackageFromZip() expected error")
	}
	if !strings.Contains(err.Error(), "unsupported template control expression") {
		t.Fatalf("unexpected error: %v", err)
	}
}

// TestLoadPackageFromZipAcceptsBooleanOperators 验证 {{if}} 后跟
// not/and/or/eq/ne 布尔组合表达式能通过导入校验。
// 修复前：isSupportedControlExpr 只允许简单路径，导致用户自制模板使用
// {{if not .Hidden}} / {{if and .Summary (not .SummaryHidden)}}
// （与内置模板相同的写法）会被导入拒绝，而前端预览引擎
// （templateEngine.ts evalExpr）与 Go html/template 均已支持这些运算符。
func TestLoadPackageFromZipAcceptsBooleanOperators(t *testing.T) {
	path := writeTemplatePackage(t, map[string]string{
		"template.json": `{
			"id": "local_bool_template",
			"name": "Local Bool",
			"version": "1.0.0",
			"author": {"name": "Gosume"},
			"paper_size": "A4"
		}`,
		"template.html": `<!DOCTYPE html>
<html>
<head><style>{{template "styles.css" .}}</style></head>
<body>
	{{if and .Summary (not .SummaryHidden)}}<div class="summary">{{nl2br .Summary}}</div>{{end}}
	{{range .Jobs}}{{if not .Hidden}}<div class="experience-item">{{.Company}}</div>{{end}}{{end}}
	{{if eq .Meta.Language "zh-CN"}}<div>中文简历</div>{{end}}
</body>
</html>`,
		"styles.css": `body { font-family: sans-serif; }`,
	})

	pkg, err := LoadPackageFromZip(path)
	if err != nil {
		t.Fatalf("LoadPackageFromZip() with boolean operators error = %v", err)
	}
	if pkg.Meta.ID != "local_bool_template" {
		t.Fatalf("Meta.ID = %q", pkg.Meta.ID)
	}
}

// TestLoadPackageFromZipAcceptsSafeURL 验证 safeURL 函数能通过导入校验，
// 与渲染器（pkg/render/html.go）注册的函数表保持一致。
// 修复前：isSupportedFunctionCall 白名单漏了 safeURL，导致用户自制模板
// 使用 {{safeURL .Personal.Avatar}}（与内置模板相同的写法）会被导入拒绝。
func TestLoadPackageFromZipAcceptsSafeURL(t *testing.T) {
	path := writeTemplatePackage(t, map[string]string{
		"template.json": `{
			"id": "local_safeurl_template",
			"name": "Local SafeURL",
			"version": "1.0.0",
			"author": {"name": "Gosume"},
			"paper_size": "A4"
		}`,
		"template.html": `<!DOCTYPE html>
<html>
<head><style>{{template "styles.css" .}}</style></head>
<body>
	{{if .Personal.Avatar}}<img src="{{safeURL .Personal.Avatar}}" alt="avatar" />{{end}}
	<h1>{{.Personal.FullName}}</h1>
</body>
</html>`,
		"styles.css": `body { font-family: sans-serif; }`,
	})

	pkg, err := LoadPackageFromZip(path)
	if err != nil {
		t.Fatalf("LoadPackageFromZip() with safeURL error = %v", err)
	}
	if pkg.Meta.ID != "local_safeurl_template" {
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
