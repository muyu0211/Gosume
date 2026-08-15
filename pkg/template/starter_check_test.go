package template

import (
	"archive/zip"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestStarterSkillPackagePassesValidation verifies the gosume-template-skills
// starter assets satisfy the real import validation (syntax + execution).
func TestStarterSkillPackagePassesValidation(t *testing.T) {
	starterDir := filepath.Join("..", "..", "gosume-template-skills", "assets", "starter")
	html, err := os.ReadFile(filepath.Join(starterDir, "template.html"))
	if err != nil {
		t.Fatalf("read starter template.html: %v", err)
	}
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
		HTML: string(html),
		CSS:  string(css),
	}); err != nil {
		t.Fatalf("starter package failed validation: %v", err)
	}

	// Also verify round-trip through the ZIP loader path.
	path := filepath.Join(t.TempDir(), "starter.zip")
	f, _ := os.Create(path)
	defer f.Close()
	zw := zip.NewWriter(f)
	for name, content := range map[string]string{
		"template.json": string(meta),
		"template.html": string(html),
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
	if !strings.Contains(pkg.HTML, "if not .Hidden") {
		t.Fatal("starter HTML expected to contain Hidden guards")
	}
}
