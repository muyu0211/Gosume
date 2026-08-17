package template

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"path/filepath"
	"regexp"
	"strings"
)

// 模板包体积上限，用于防御压缩炸弹（zip bomb）。
const (
	// MaxTemplatePackageSize 是解压后所有文件的总大小上限（10 MiB）。
	MaxTemplatePackageSize = 10 << 20
	// MaxTemplateFileSize 是单个文件解压后的大小上限（2 MiB）。
	MaxTemplateFileSize = 2 << 20
)

// templateIDPattern 限定模板 ID：2–64 位，首字符为字母或数字，
// 其余可含字母、数字、连字符与下划线。
var templateIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$`)

// Package 是本地 .zip 模板包经校验后的内容。
//
// Gosume 一期改造：模板包不再携带 HTML——统一 HTML（templates/template.html）
// 由应用内置，模板制作者只需提供 template.json（元数据）+ styles.css（样式）。
type Package struct {
	Meta Meta
	CSS  string
}

// LoadPackageFromZip 读取并校验 .zip 模板包。
//
// 必须包含 template.json 与 styles.css；若压缩包内仍带 template.html
// （历史模板包），宽松处理：忽略该文件，只取 css+json。
//
// 安全措施：校验条目路径防止目录穿越，并对单文件与总解压体积设上限。
func LoadPackageFromZip(filePath string) (*Package, error) {
	reader, err := zip.OpenReader(filePath)
	if err != nil {
		return nil, fmt.Errorf("open template package: %w", err)
	}
	defer reader.Close()

	var total int64
	files := map[string][]byte{}
	for _, f := range reader.File {
		if f.FileInfo().IsDir() {
			continue
		}
		if err := validatePackagePath(f.Name); err != nil {
			return nil, err
		}
		if f.UncompressedSize64 > MaxTemplateFileSize {
			return nil, fmt.Errorf("template file %s is too large", f.Name)
		}
		total += int64(f.UncompressedSize64)
		if total > MaxTemplatePackageSize {
			return nil, fmt.Errorf("template package is too large")
		}

		base := filepath.Base(filepath.ToSlash(f.Name))
		switch base {
		case "template.json", "styles.css":
			if _, exists := files[base]; exists {
				return nil, fmt.Errorf("duplicate %s in template package", base)
			}
			data, err := readZipFile(f)
			if err != nil {
				return nil, err
			}
			files[base] = data
		case "template.html":
			// 历史模板包中的 HTML 已弃用（统一 HTML 由应用内置），宽松忽略。
			// 不读取其内容，避免用户通过 HTML 干预数据形态。
			continue
		}
	}

	for _, required := range []string{"template.json", "styles.css"} {
		if len(files[required]) == 0 {
			return nil, fmt.Errorf("missing required file: %s", required)
		}
	}

	var meta Meta
	if err := json.Unmarshal(files["template.json"], &meta); err != nil {
		return nil, fmt.Errorf("parse template.json: %w", err)
	}
	normalizeMeta(&meta)

	pkg := &Package{
		Meta: meta,
		CSS:  string(files["styles.css"]),
	}
	if err := ValidatePackage(pkg); err != nil {
		return nil, err
	}
	return pkg, nil
}

// ValidatePackage 校验模板包能否被 Gosume 正常使用。
//
// Gosume 一期改造：HTML 已统一由应用提供，用户无法再提交 HTML，因此
// 不再校验 HTML 语法/执行；只校验元数据与 CSS 基础合法性。
func ValidatePackage(pkg *Package) error {
	if pkg == nil {
		return fmt.Errorf("template package is empty")
	}
	if err := validateMeta(pkg.Meta); err != nil {
		return err
	}
	if strings.TrimSpace(pkg.CSS) == "" {
		return fmt.Errorf("styles.css is empty")
	}
	return nil
}

// validatePackagePath 校验压缩包内条目路径的安全性，
// 拒绝绝对路径与包含 .. 的路径，防止解压时目录穿越。
func validatePackagePath(name string) error {
	clean := filepath.ToSlash(filepath.Clean(name))
	if strings.HasPrefix(clean, "../") || clean == ".." || strings.HasPrefix(clean, "/") || filepath.IsAbs(name) {
		return fmt.Errorf("unsafe path in template package: %s", name)
	}
	return nil
}

// readZipFile 读取压缩包内单个文件的内容。
//
// 使用 CopyN 限定最多读取 MaxTemplateFileSize+1 字节，据此判定超限，
// 避免声明体积造假的压缩包耗尽内存。
func readZipFile(f *zip.File) ([]byte, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", f.Name, err)
	}
	defer rc.Close()

	var buf bytes.Buffer
	if _, err := io.CopyN(&buf, rc, MaxTemplateFileSize+1); err != nil && err != io.EOF {
		return nil, fmt.Errorf("read %s: %w", f.Name, err)
	}
	if buf.Len() > MaxTemplateFileSize {
		return nil, fmt.Errorf("template file %s is too large", f.Name)
	}
	return buf.Bytes(), nil
}

// normalizeMeta 清理元数据首尾空白，并为缺省字段填充默认值。
func normalizeMeta(meta *Meta) {
	meta.ID = strings.TrimSpace(meta.ID)
	meta.Name = strings.TrimSpace(meta.Name)
	meta.Version = strings.TrimSpace(meta.Version)
	meta.Author.Name = strings.TrimSpace(meta.Author.Name)
	meta.PaperSize = strings.TrimSpace(meta.PaperSize)
	if meta.TargetLanguage == nil {
		meta.TargetLanguage = []string{"zh-CN"}
	}
	if meta.Tags == nil {
		meta.Tags = []string{}
	}
	if meta.Category == "" {
		meta.Category = "custom"
	}
	if meta.PaperSize == "" {
		meta.PaperSize = "A4"
	}
	if meta.Orientations == nil {
		meta.Orientations = []string{"portrait"}
	}
	if meta.PageCount.Min == 0 {
		meta.PageCount.Min = 1
	}
	if meta.PageCount.Max == 0 {
		meta.PageCount.Max = 5
	}
	if meta.PageCount.Default == 0 {
		meta.PageCount.Default = 1
	}
}

// validateMeta 校验模板元数据的必填项：ID 格式、名称、版本、作者名，
// 且纸张规格目前仅支持 A4。
func validateMeta(meta Meta) error {
	if !templateIDPattern.MatchString(meta.ID) {
		return fmt.Errorf("template id must be 2-64 characters and contain only letters, numbers, hyphens, or underscores")
	}
	if strings.TrimSpace(meta.Name) == "" {
		return fmt.Errorf("template name is required")
	}
	if strings.TrimSpace(meta.Version) == "" {
		return fmt.Errorf("template version is required")
	}
	if strings.TrimSpace(meta.Author.Name) == "" {
		return fmt.Errorf("template author name is required")
	}
	if meta.PaperSize != "A4" {
		return fmt.Errorf("only A4 templates are currently supported")
	}
	return nil
}
