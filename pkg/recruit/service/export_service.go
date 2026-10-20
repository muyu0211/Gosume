package service

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"gosume/pkg/log"
	recruitmodel "gosume/pkg/recruit/model"
	"gosume/pkg/util"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// 求职进程数据导出：CSV（Excel 友好，带 BOM）与 JSON（结构化备份）。
// 导出走系统「另存为」对话框，用户取消不视为错误；写入磁盘后返回路径供前端提示。

// ExportJobs 导出求职进程条目（format: "csv" | "json"）。
// 边界语义：格式非法 / 无数据 → 拒绝导出；用户取消另存 → 成功 + 空路径（前端提示已取消）。
func (s *RecruitService) ExportJobs(format string) *util.Response {
	format = strings.ToLower(strings.TrimSpace(format))
	if format != "csv" && format != "json" {
		return util.DoRsp(util.ErrCode, fmt.Sprintf("不支持的导出格式：%s（仅支持 csv / json）", format), nil)
	}

	jobs, err := s.jobRepo.List()
	if err != nil {
		log.Errorf("[recruit_service] ExportJobs: 读取数据失败: %v", err)
		return util.DoRsp(util.ErrCode, "读取数据失败，请稍后重试", nil)
	}
	if len(jobs) == 0 {
		return util.DoRsp(util.ErrCode, "暂无可导出的数据", nil)
	}

	var payload []byte
	switch format {
	case "csv":
		payload, err = buildJobsCSV(jobs)
	default:
		payload, err = buildJobsJSON(jobs)
	}
	if err != nil {
		log.Errorf("[recruit_service] ExportJobs: 生成导出内容失败: %v", err)
		return util.DoRsp(util.ErrCode, "生成导出内容失败", nil)
	}

	// 另存对话框：默认文件名带时间戳，用户可改路径与文件名
	defaultName := fmt.Sprintf("求职进程-%s.%s", time.Now().Format("20060102-150405"), format)
	filePath, err := s.app.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:    "导出求职进程",
		Filename: defaultName,
		Filters: []application.FileFilter{
			{DisplayName: strings.ToUpper(format) + " 文件", Pattern: "*." + format},
		},
	}).PromptForSingleSelection()
	if err != nil {
		if util.IsCancel(err) {
			return util.DoRsp(util.SuccCode, "已取消导出", nil)
		}
		log.Errorf("[recruit_service] ExportJobs: 打开保存对话框失败: %v", err)
		return util.DoRsp(util.ErrCode, "打开保存对话框失败", nil)
	}
	if filePath == "" {
		return util.DoRsp(util.SuccCode, "已取消导出", nil)
	}

	if err := os.WriteFile(filePath, payload, 0o644); err != nil {
		log.Errorf("[recruit_service] ExportJobs: 写入文件失败 %s: %v", filePath, err)
		return util.DoRsp(util.ErrCode, "写入文件失败，请检查磁盘与权限", nil)
	}

	log.Infof("[recruit_service] ExportJobs: format=%s count=%d path=%s", format, len(jobs), filePath)
	return util.DoRsp(util.SuccCode, "成功", map[string]string{"path": filePath})
}

// csvHeader CSV 表头（中文，Excel 打开即读）。
var csvHeader = []string{
	"ID", "公司", "归一化公司", "岗位", "环节", "轮次", "状态", "来源",
	"举办时间", "全天", "截止时间", "线上", "链接", "地点", "备注", "创建时间", "更新时间",
}

// buildJobsCSV 序列化为 CSV：全字段加引号 + 双写转义，\uFEFF BOM 保证 Excel 中文不乱码。
func buildJobsCSV(jobs []recruitmodel.JobProcess) ([]byte, error) {
	var b strings.Builder
	b.WriteString("\uFEFF")
	writeCSVRow(&b, csvHeader)
	for _, j := range jobs {
		writeCSVRow(&b, []string{
			j.ID, j.Company, j.CompanyNorm, j.Position, j.Stage,
			fmt.Sprintf("%d", j.RoundNo), j.Status, j.Source,
			deref(j.EventTime), boolStr(j.AllDay), deref(j.Deadline), boolStr(j.Online),
			j.Link, j.Location, j.Note, j.CreatedAt, j.UpdatedAt,
		})
	}
	return []byte(b.String()), nil
}

// writeCSVRow 写一行：RFC 4180 转义（引号双写 + 整字段引号包裹），CRLF 行尾。
func writeCSVRow(b *strings.Builder, fields []string) {
	quoted := make([]string, len(fields))
	for i, f := range fields {
		quoted[i] = `"` + strings.ReplaceAll(f, `"`, `""`) + `"`
	}
	b.WriteString(strings.Join(quoted, ","))
	b.WriteString("\r\n")
}

func boolStr(v bool) string {
	if v {
		return "是"
	}
	return "否"
}

// jobsExportFile JSON 导出的文件结构：带版本号与导出时间，便于将来做导入/迁移。
type jobsExportFile struct {
	Version    int                       `json:"version"`
	ExportedAt string                    `json:"exported_at"`
	Count      int                       `json:"count"`
	Jobs       []recruitmodel.JobProcess `json:"jobs"`
}

// buildJobsJSON 序列化为缩进 JSON（jobs 字段契约与 List 返回一致）。
func buildJobsJSON(jobs []recruitmodel.JobProcess) ([]byte, error) {
	if jobs == nil {
		jobs = []recruitmodel.JobProcess{}
	}
	return json.MarshalIndent(jobsExportFile{
		Version:    1,
		ExportedAt: time.Now().Format(time.RFC3339),
		Count:      len(jobs),
		Jobs:       jobs,
	}, "", "  ")
}
