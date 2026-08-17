package template

import (
	"archive/zip"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestStarterSkillPackagePassesValidation 验证 gosume-template-skills 提供的
// starter 素材能通过真实的模板导入校验。
//
// Gosume 一期改造：模板包不再校验/携带 HTML（统一 HTML 由应用内置），
// 这里只校验 starter 的 template.json + styles.css 可通过导入。
func TestStarterSkillPackagePassesValidation(t *testing.T) {
	starterDir := filepath.Join("..", "..", "gosume-template-skills", "assets", "starter")
	css, err := os.ReadFile(filepath.Join(starterDir, "styles.css"))
	if err != nil {
		t.Fatalf("read starter styles.css: %v", err)
	}
	meta, err := os.ReadFile(filepath.Join(starterDir, "template.json"))
	if err != nil {
		t.Fatalf("read starter template.json: %v", err)
	}

	var metaVal Meta
	if err := json.Unmarshal(meta, &metaVal); err != nil {
		t.Fatalf("parse starter template.json: %v", err)
	}
	if err := ValidatePackage(&Package{
		Meta: metaVal,
		CSS:  string(css),
	}); err != nil {
		t.Fatalf("starter package failed validation: %v", err)
	}

	// 同时验证经由 ZIP 加载路径的往返：其中包含一个必须被宽松忽略的
	// 历史 template.html。
	path := filepath.Join(t.TempDir(), "starter.zip")
	f, _ := os.Create(path)
	defer f.Close()
	zw := zip.NewWriter(f)
	for name, content := range map[string]string{
		"template.json": string(meta),
		"template.html": "<html><body>{{if .Jobs}}{{end}}</body></html>",
		"styles.css":    string(css),
	} {
		w, _ := zw.Create(name)
		w.Write([]byte(content))
	}
	zw.Close()

	pkg, err := LoadPackageFromZip(path)
	if err != nil {
		t.Fatalf("LoadPackageFromZip(starter) error = %v", err)
	}
	if pkg.Meta.ID != metaVal.ID {
		t.Fatalf("starter meta id = %q, want %q", pkg.Meta.ID, metaVal.ID)
	}
	if strings.TrimSpace(pkg.CSS) == "" {
		t.Fatal("starter CSS expected to be non-empty")
	}
}
