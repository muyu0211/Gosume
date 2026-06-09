package export

import (
	"archive/zip"
	"bytes"
	"fmt"
	"strings"

	"gosume/pkg/model"
)

// DOCXExporter exports resumes to DOCX format by constructing an OOXML document
// directly from the resume model data using Go standard library only.
type DOCXExporter struct {
	htmlRenderer HTMLRenderer
}

// NewDOCXExporter creates a new DOCX exporter.
func NewDOCXExporter(htmlRenderer HTMLRenderer) *DOCXExporter {
	return &DOCXExporter{htmlRenderer: htmlRenderer}
}

// Export builds a .docx file from resume model data.
func (e *DOCXExporter) Export(resume *model.Resume, opts ExportOptions) ([]byte, error) {
	doc := newDocxBuilder()

	// --- Title ---
	if resume.Personal.FullName != "" {
		doc.addParagraph(resume.Personal.FullName, 28, true, "")
		doc.addSpacer(80)
	}

	// --- Contact line ---
	contact := buildContactLine(&resume.Personal)
	if contact != "" {
		doc.addParagraph(contact, 20, false, "777777")
		doc.addSpacer(160)
	}

	// --- Summary ---
	if resume.Summary != "" {
		doc.addSectionHeader("个人总结")
		doc.addParagraph(resume.Summary, 21, false, "")
		doc.addSpacer(120)
	}

	// --- Work Experience ---
	if len(resume.Jobs) > 0 {
		doc.addSectionHeader("工作经历")
		for _, job := range resume.Jobs {
			doc.addJobEntry(&job)
		}
		doc.addSpacer(80)
	}

	// --- Projects ---
	if len(resume.Projects) > 0 {
		doc.addSectionHeader("项目经历")
		for _, proj := range resume.Projects {
			doc.addProjectEntry(&proj)
		}
		doc.addSpacer(80)
	}

	// --- Education ---
	if len(resume.Education) > 0 {
		doc.addSectionHeader("教育背景")
		for _, edu := range resume.Education {
			doc.addEducationEntry(&edu)
		}
		doc.addSpacer(80)
	}

	// --- Skills ---
	if len(resume.Skills) > 0 {
		doc.addSectionHeader("专业技能")
		for _, grp := range resume.Skills {
			names := make([]string, len(grp.Items))
			for i, item := range grp.Items {
				names[i] = item.Name
			}
			content := grp.Category + "：" + strings.Join(names, "、")
			doc.addParagraph(content, 21, false, "")
		}
		doc.addSpacer(80)
	}

	// --- Languages ---
	if len(resume.Languages) > 0 {
		doc.addSectionHeader("语言能力")
		for _, lang := range resume.Languages {
			doc.addParagraph(lang.Name+"："+lang.Level, 21, false, "")
		}
		doc.addSpacer(80)
	}

	// --- Awards ---
	if len(resume.Awards) > 0 {
		doc.addSectionHeader("奖项荣誉")
		for _, award := range resume.Awards {
			doc.addAwardEntry(&award)
		}
		doc.addSpacer(80)
	}

	// --- Custom Sections ---
	for _, sec := range resume.Custom {
		if sec.Title == "" {
			continue
		}
		doc.addSectionHeader(sec.Title)
		for _, item := range sec.Items {
			doc.addCustomItemEntry(&item)
		}
		doc.addSpacer(80)
	}

	return doc.build()
}

func buildContactLine(p *model.Personal) string {
	var parts []string
	if p.Email != "" {
		parts = append(parts, p.Email)
	}
	if p.Phone != "" {
		parts = append(parts, p.Phone)
	}
	if p.Location != "" {
		parts = append(parts, p.Location)
	}
	if p.Website != "" {
		parts = append(parts, p.Website)
	}
	if p.GitHub != "" {
		parts = append(parts, "GitHub: "+p.GitHub)
	}
	if p.LinkedIn != "" {
		parts = append(parts, "LinkedIn: "+p.LinkedIn)
	}
	return strings.Join(parts, "  |  ")
}

// --- docxBuilder: minimal OOXML ZIP builder ---

type docxBuilder struct {
	body strings.Builder
}

func newDocxBuilder() *docxBuilder {
	return &docxBuilder{}
}

func (d *docxBuilder) addSectionHeader(title string) {
	d.addParagraph(title, 24, true, "1a1a2e")
	d.addSpacer(120)
}

func (d *docxBuilder) addParagraph(text string, fontSizeHalfPt int, bold bool, colorHex string) {
	rPr := d.runProperties(fontSizeHalfPt, bold, colorHex)
	escaped := xmlEscape(text)
	d.body.WriteString(fmt.Sprintf(
		`<w:p><w:pPr><w:spacing w:after="40" w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:rPr>%s</w:rPr><w:t xml:space="preserve">%s</w:t></w:r></w:p>`,
		rPr, escaped,
	))
}

func (d *docxBuilder) addSpacer(space int) {
	d.body.WriteString(fmt.Sprintf(
		`<w:p><w:pPr><w:spacing w:after="%d"/></w:pPr></w:p>`, space,
	))
}

func (d *docxBuilder) addBullet(text string) {
	d.addParagraph("• "+text, 21, false, "")
}

func (d *docxBuilder) addJobEntry(job *model.Job) {
	header := job.Company
	if job.Title != "" {
		header += "  |  " + job.Title
	}
	d.addParagraph(header, 22, true, "")

	sub := job.Location
	if sub == "" {
		sub = formatDateRange(job.StartDate, job.EndDate, job.IsCurrent)
	} else if job.StartDate != "" {
		sub += "  |  " + formatDateRange(job.StartDate, job.EndDate, job.IsCurrent)
	}
	if sub != "" {
		d.addParagraph(sub, 18, false, "666666")
	}

	if job.Summary != "" {
		d.addParagraph(job.Summary, 21, false, "")
	}
	for _, hl := range job.Highlights {
		d.addBullet(hl)
	}
}

func (d *docxBuilder) addProjectEntry(proj *model.Project) {
	header := proj.Name
	if proj.Role != "" {
		header += "  |  " + proj.Role
	}
	d.addParagraph(header, 22, true, "")

	if proj.StartDate != "" || proj.URL != "" {
		sub := proj.StartDate
		if proj.EndDate != "" && sub != "" {
			sub += " - " + proj.EndDate
		}
		if proj.URL != "" {
			if sub != "" {
				sub += "  |  "
			}
			sub += proj.URL
		}
		d.addParagraph(sub, 18, false, "666666")
	}

	if proj.Summary != "" {
		d.addParagraph(proj.Summary, 21, false, "")
	}
	for _, hl := range proj.Highlights {
		d.addBullet(hl)
	}
}

func (d *docxBuilder) addEducationEntry(edu *model.Education) {
	header := edu.School
	if edu.Degree != "" {
		header += "  |  " + edu.Degree
	}
	d.addParagraph(header, 22, true, "")

	sub := edu.Major
	if edu.Minor != "" {
		sub += " / " + edu.Minor
	}
	if edu.GPA != "" {
		sub += "  |  GPA: " + edu.GPA
	}
	if edu.StartDate != "" || edu.EndDate != "" {
		sub += "  |  " + edu.StartDate + " - " + edu.EndDate
	}
	d.addParagraph(sub, 18, false, "666666")

	for _, hl := range edu.Highlights {
		d.addBullet(hl)
	}
}

func (d *docxBuilder) addAwardEntry(award *model.Award) {
	header := award.Title
	d.addParagraph(header, 22, true, "")

	sub := award.Issuer
	if award.Date != "" {
		if sub != "" {
			sub += "  |  "
		}
		sub += award.Date
	}
	if sub != "" {
		d.addParagraph(sub, 18, false, "666666")
	}
	if award.Summary != "" {
		d.addParagraph(award.Summary, 21, false, "")
	}
}

func (d *docxBuilder) addCustomItemEntry(item *model.CustomItem) {
	header := item.Title
	d.addParagraph(header, 22, true, "")

	sub := item.Subtitle
	if item.Date != "" {
		if sub != "" {
			sub += "  |  "
		}
		sub += item.Date
	}
	if sub != "" {
		d.addParagraph(sub, 18, false, "666666")
	}
	if item.Description != "" {
		d.addParagraph(item.Description, 21, false, "")
	}
	for _, hl := range item.Highlights {
		d.addBullet(hl)
	}
}

func (d *docxBuilder) runProperties(fontSizeHalfPt int, bold bool, colorHex string) string {
	var parts []string
	if bold {
		parts = append(parts, `<w:b/><w:bCs/>`)
	}
	parts = append(parts, fmt.Sprintf(`<w:sz w:val="%d"/><w:szCs w:val="%d"/>`, fontSizeHalfPt, fontSizeHalfPt))
	if colorHex != "" {
		parts = append(parts, fmt.Sprintf(`<w:color w:val="%s"/>`, colorHex))
	}
	return strings.Join(parts, "")
}

func (d *docxBuilder) build() ([]byte, error) {
	var buf bytes.Buffer
	z := zip.NewWriter(&buf)

	// [Content_Types].xml
	contentTypes := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
	d.writeZipEntry(z, "[Content_Types].xml", contentTypes)

	// _rels/.rels
	rels := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
	d.writeZipEntry(z, "_rels/.rels", rels)

	// word/_rels/document.xml.rels
	docRels := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`
	d.writeZipEntry(z, "word/_rels/document.xml.rels", docRels)

	// word/document.xml
	documentXML := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
            xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:v="urn:schemas-microsoft-com:vml"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
%s
  </w:body>
</w:document>`, d.body.String())
	d.writeZipEntry(z, "word/document.xml", documentXML)

	if err := z.Close(); err != nil {
		return nil, fmt.Errorf("写入 docx: %w", err)
	}
	return buf.Bytes(), nil
}

func (d *docxBuilder) writeZipEntry(z *zip.Writer, name string, content string) {
	w, _ := z.Create(name)
	w.Write([]byte(content))
}

func formatDateRange(start, end string, isCurrent bool) string {
	if start == "" {
		return ""
	}
	if isCurrent || end == "" {
		return start + " - 至今"
	}
	return start + " - " + end
}

func xmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	s = strings.ReplaceAll(s, "'", "&apos;")
	return s
}
