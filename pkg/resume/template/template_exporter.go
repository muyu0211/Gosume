package template

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"gosume/pkg/resume/dto"
	"os"
	"strings"
)

// buildReadme 生成分享包内的说明文件内容（模板信息 + 使用方式）。
func buildReadme(meta dto.TemplateMeta) string {
	var b strings.Builder
	b.WriteString("# ")
	b.WriteString(meta.Name)
	b.WriteString("\n\n")
	b.WriteString(fmt.Sprintf("- 版本：%s\n", meta.Version))
	if strings.TrimSpace(meta.Author.Name) != "" {
		b.WriteString(fmt.Sprintf("- 作者：%s\n", meta.Author.Name))
	}
	if len(meta.Tags) > 0 {
		b.WriteString("- 标签：")
		b.WriteString(strings.Join(meta.Tags, "、"))
		b.WriteString("\n")
	}
	if strings.TrimSpace(meta.Description) != "" {
		b.WriteString("\n## 说明\n\n")
		b.WriteString(meta.Description)
		b.WriteString("\n")
	}
	b.WriteString("\n## 使用方式\n\n")
	b.WriteString("在 Gosume 中点击「导入模板」或「导入分享包」，选择本 zip 文件即可安装使用。\n")
	return b.String()
}

// WriteSharePackage 把模板导出为可分享的 zip 分享包。
//
// 分享包保持与现有导入格式兼容：template.json（元数据）+ styles.css（样式），
// 另附 README.md 说明文件（PRD F2"含元数据与说明"）。导出内容仅取自
// 已入库的模板数据与元数据，不拼接用户简历数据。
func WriteSharePackage(t *dto.Template, destPath string) error {
	if t == nil {
		return fmt.Errorf("template is empty")
	}

	metaJSON, err := json.MarshalIndent(t.Meta, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal template meta: %w", err)
	}

	f, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("create share package: %w", err)
	}

	zw := zip.NewWriter(f)
	entries := []struct {
		name string
		data []byte
	}{
		{name: "template.json", data: metaJSON},
		{name: "styles.css", data: []byte(t.CSS)},
		{name: "README.md", data: []byte(buildReadme(t.Meta))},
	}
	for _, e := range entries {
		w, err := zw.Create(e.name)
		if err != nil {
			return fmt.Errorf("create zip entry %s: %w", e.name, err)
		}
		if _, err := w.Write(e.data); err != nil {
			return fmt.Errorf("write zip entry %s: %w", e.name, err)
		}
	}

	if err := zw.Close(); err != nil {
		return fmt.Errorf("finalize share package: %w", err)
	}
	return f.Close()
}
