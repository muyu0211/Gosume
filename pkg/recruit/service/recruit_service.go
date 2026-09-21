package service

import (
	"strings"
	"time"

	"gosume/pkg/log"
	recruitmodel "gosume/pkg/recruit/model"
	"gosume/pkg/util"
)

// 条目业务字段（MergeJob / diffs 的白名单，与 Mock 的 diffFields 同族口径）。
var mergeableFields = []string{"position", "event_time", "event_end", "deadline", "link", "location"}

// 枚举白名单（引用 model 定义）。
var (
	modelStages   = recruitmodel.Stages
	modelStatuses = recruitmodel.Statuses
	modelSources  = recruitmodel.Sources
)

func validEnum(list []string, v string) bool { return recruitmodel.Contains(list, v) }

func nowRFC3339() string { return time.Now().Format(time.RFC3339) }

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// ───────────────────────────── 条目 ─────────────────────────────

// ListJobs 全量返回条目（不排序——排序/分区/筛选由前端 grouping 完成）。
func (s *RecruitService) ListJobs() *util.Response {
	jobs, err := s.jobRepo.List()
	if err != nil {
		log.Errorf("[recruit_service] ListJobs: %v", err)
		return util.DoRsp(util.ErrCode, "加载求职进程失败", nil)
	}
	if jobs == nil {
		jobs = []recruitmodel.JobProcess{}
	}
	return util.DoRsp(util.SuccCode, "", jobs)
}

// GetJob 单条。
func (s *RecruitService) GetJob(id string) *util.Response {
	j, err := s.jobRepo.Get(id)
	if err != nil {
		log.Errorf("[recruit_service] GetJob(%s): %v", id, err)
		return util.DoRsp(util.ErrCode, "读取条目失败", nil)
	}
	if j == nil {
		return util.DoRsp(util.ErrCode, "条目不存在", nil)
	}
	return util.DoRsp(util.SuccCode, "", *j)
}

// fingerprint 条目去重指纹（与前端 recruitMock.fingerprint 逐字对齐）：
//   - apply（stage="apply"）:  `a|<norm>|<position>|<本地日期>`
//   - notice（其余环节）:      `n|<norm>|<stage>|<round_no>|<本地日期>`
//
// 日期取到来日（event_time ?? deadline）的本地日期；无时间用空串。
func fingerprint(j recruitmodel.JobProcess) string {
	norm := j.CompanyNorm
	if norm == "" {
		norm = normalizeCompany(j.Company)
	}
	at := j.EventTime
	if at == nil || *at == "" {
		at = j.Deadline
	}
	day := ""
	if at != nil && *at != "" {
		if t, err := time.Parse(time.RFC3339, *at); err == nil {
			day = t.Local().Format("2006-01-02")
		}
	}
	if j.Stage == "apply" {
		return "a|" + norm + "|" + j.Position + "|" + day
	}
	return "n|" + norm + "|" + j.Stage + "|" + itoa(j.RoundNo) + "|" + day
}

// diffFields 与 Mock 的 diffFields 同口径：仅比较这五个业务字段。
func diffFields(a recruitmodel.JobProcess, b recruitmodel.JobProcess) []map[string]string {
	keys := mergeableFields
	out := []map[string]string{}
	get := func(j recruitmodel.JobProcess, k string) string {
		switch k {
		case "position":
			return j.Position
		case "event_time":
			return deref(j.EventTime)
		case "deadline":
			return deref(j.Deadline)
		case "link":
			return j.Link
		case "location":
			return j.Location
		}
		return ""
	}
	for _, k := range keys {
		cur, inc := get(a, k), get(b, k)
		if cur != inc {
			out = append(out, map[string]string{"field": k, "current": cur, "incoming": inc})
		}
	}
	return out
}

// CreateJob 新建条目（含指纹去重判定、公司自动建档、notice 关联校验）。
func (s *RecruitService) CreateJob(dto recruitmodel.JobProcess, strategy *string) *util.Response {
	if strings.TrimSpace(dto.Company) == "" {
		return util.DoRsp(util.ErrCode, "公司名称不能为空", nil)
	}
	if !validEnum(modelStages, dto.Stage) ||
		!validEnum(modelStatuses, dto.Status) || !validEnum(modelSources, dto.Source) {
		return util.DoRsp(util.ErrCode, "无效的环节/状态/来源", nil)
	}

	j := dto
	j.ID = ""                     // 新建必由后端生成；前端不传 id
	j.Company = strings.TrimSpace(j.Company)
	j.CompanyNorm = normalizeCompany(j.Company)
	j.CreatedAt, j.UpdatedAt = "", "" // repo.Create 生成

	// 原文开关兜底：设置关闭时不落原文（AC-23），不信任前端入参
	if !s.settingsRepo.Get().SaveRawText {
		j.RawText = nil
	}

	// 公司自动建档 / 归并（F6）：norm 唯一，首名为展示名
	cid, rsp := s.ensureCompany(j.CompanyNorm, j.Company)
	if rsp != nil {
		return rsp
	}
	j.CompanyID = cid

	// notice 关联校验：父必须是同公司 apply；跨公司挂载禁止（AC-34 手动路径）
	if rsp := s.validateParent(&j); rsp != nil {
		return rsp
	}

	// 指纹去重（数据量级 50–300，内存比对与 Mock 逐字对齐）
	if strategy == nil || *strategy != "new" {
		jobs, err := s.jobRepo.List()
		if err != nil {
			log.Errorf("[recruit_service] CreateJob list: %v", err)
			return util.DoRsp(util.ErrCode, "保存失败", nil)
		}
		fp := fingerprint(j)
		for _, hit := range jobs {
			if fingerprint(hit) != fp {
				continue
			}
			if strategy != nil && *strategy == "update" {
				j.ID = hit.ID
				j.CreatedAt = hit.CreatedAt
				if err := s.jobRepo.Update(&j); err != nil {
					log.Errorf("[recruit_service] CreateJob(update): %v", err)
					return util.DoRsp(util.ErrCode, "保存失败", nil)
				}
				return util.DoRsp(util.SuccCode, "", map[string]any{"id": j.ID})
			}
			// strategy == nil：不落库，返回疑似重复候选（含逐字段差异）
			return util.DoRsp(util.SuccCode, "", map[string]any{
				"id":        "",
				"duplicate": map[string]any{"job": hit, "diffs": diffFields(hit, j)},
			})
		}
	}

	if err := s.jobRepo.Create(&j); err != nil {
		log.Errorf("[recruit_service] CreateJob insert: %v", err)
		return util.DoRsp(util.ErrCode, "保存失败", nil)
	}
	return util.DoRsp(util.SuccCode, "", map[string]any{"id": j.ID})
}

// UpdateJob 编辑条目（含改公司名的解关联与档案对齐）。
func (s *RecruitService) UpdateJob(dto recruitmodel.JobProcess) *util.Response {
	if strings.TrimSpace(dto.Company) == "" {
		return util.DoRsp(util.ErrCode, "公司名称不能为空", nil)
	}
	if !validEnum(modelStages, dto.Stage) ||
		!validEnum(modelStatuses, dto.Status) || !validEnum(modelSources, dto.Source) {
		return util.DoRsp(util.ErrCode, "无效的环节/状态/来源", nil)
	}
	cur, err := s.jobRepo.Get(dto.ID)
	if err != nil {
		log.Errorf("[recruit_service] UpdateJob get: %v", err)
		return util.DoRsp(util.ErrCode, "读取条目失败", nil)
	}
	if cur == nil {
		return util.DoRsp(util.ErrCode, "条目不存在", nil)
	}

	j := dto
	j.CompanyNorm = normalizeCompany(j.Company)
	if !s.settingsRepo.Get().SaveRawText && j.RawText != nil && *j.RawText == "" {
		j.RawText = nil
	}

	// 改公司名 → 档案对齐 + 父关联一致性（AC-34）
	cid, rsp := s.ensureCompany(j.CompanyNorm, j.Company)
	if rsp != nil {
		return rsp
	}
	j.CompanyID = cid
	if j.ParentID != nil && *j.ParentID != "" {
		parent, err := s.jobRepo.Get(*j.ParentID)
		if err != nil {
			log.Errorf("[recruit_service] UpdateJob parent get: %v", err)
			return util.DoRsp(util.ErrCode, "读取关联投递失败", nil)
		}
		if parent == nil || parent.CompanyNorm != j.CompanyNorm {
			j.ParentID = nil // 跨公司挂载禁止：自动解除关联并提示（前端展示）
		}
	} else {
		j.ParentID = nil
	}
	if j.Stage == "apply" {
		j.ParentID = nil // 投递记录不挂父关联
	}

	if err := s.jobRepo.Update(&j); err != nil {
		log.Errorf("[recruit_service] UpdateJob: %v", err)
		return util.DoRsp(util.ErrCode, "保存失败", nil)
	}
	return util.DoRsp(util.SuccCode, "", map[string]any{"id": j.ID})
}

// DeleteJob 删除条目：apply 有子通知时按 cascade 解除关联或级联删除。
func (s *RecruitService) DeleteJob(id string, cascade bool) *util.Response {
	cur, err := s.jobRepo.Get(id)
	if err != nil {
		log.Errorf("[recruit_service] DeleteJob get: %v", err)
		return util.DoRsp(util.ErrCode, "读取条目失败", nil)
	}
	if cur == nil {
		return util.DoRsp(util.ErrCode, "条目不存在", nil)
	}

	if cur.Stage == "apply" {
		if cascade {
			n, err := s.jobRepo.DeleteByParent(id)
			if err != nil {
				log.Errorf("[recruit_service] DeleteJob cascade: %v", err)
				return util.DoRsp(util.ErrCode, "删除失败", nil)
			}
			if err := s.jobRepo.Delete(id); err != nil {
				return util.DoRsp(util.ErrCode, "删除失败", nil)
			}
			return util.DoRsp(util.SuccCode, "", map[string]any{"deleted": n + 1})
		}
		n, err := s.jobRepo.ClearParent(id)
		if err != nil {
			log.Errorf("[recruit_service] DeleteJob unlink: %v", err)
			return util.DoRsp(util.ErrCode, "删除失败", nil)
		}
		if err := s.jobRepo.Delete(id); err != nil {
			return util.DoRsp(util.ErrCode, "删除失败", nil)
		}
		return util.DoRsp(util.SuccCode, "", map[string]any{"unlinked": n})
	}

	if err := s.jobRepo.Delete(id); err != nil {
		return util.DoRsp(util.ErrCode, "删除失败", nil)
	}
	return util.DoRsp(util.SuccCode, "", map[string]any{"deleted": 1})
}

// SetStatus 状态流转（终态可撤销回 pending，不做方向限制——撤销由前端驱动）。
func (s *RecruitService) SetStatus(id, status string) *util.Response {
	if !validEnum(modelStatuses, status) {
		return util.DoRsp(util.ErrCode, "无效的状态", nil)
	}
	if err := s.jobRepo.SetStatus(id, status); err != nil {
		log.Errorf("[recruit_service] SetStatus: %v", err)
		return util.DoRsp(util.ErrCode, "状态更新失败", nil)
	}
	return util.DoRsp(util.SuccCode, "", map[string]any{"id": id})
}

// LinkNotice 关联 / 解除（applyId = nil 表示解除关联）。
func (s *RecruitService) LinkNotice(noticeID string, applyID *string) *util.Response {
	notice, err := s.jobRepo.Get(noticeID)
	if err != nil || notice == nil {
		return util.DoRsp(util.ErrCode, "条目不存在", nil)
	}
	if applyID == nil || *applyID == "" {
		notice.ParentID = nil
		if err := s.jobRepo.Update(notice); err != nil {
			return util.DoRsp(util.ErrCode, "解除关联失败", nil)
		}
		return util.DoRsp(util.SuccCode, "", map[string]any{"id": noticeID})
	}
	parent, err := s.jobRepo.Get(*applyID)
	if err != nil || parent == nil || parent.Stage != "apply" {
		return util.DoRsp(util.ErrCode, "关联的投递记录不存在", nil)
	}
	if parent.CompanyNorm != notice.CompanyNorm {
		return util.DoRsp(util.ErrCode, "不能跨公司关联投递记录", nil)
	}
	notice.ParentID = applyID
	if err := s.jobRepo.Update(notice); err != nil {
		return util.DoRsp(util.ErrCode, "关联失败", nil)
	}
	return util.DoRsp(util.SuccCode, "", map[string]any{"id": noticeID})
}

// FindDuplicates 弱匹配提示（同公司同环节但日期不同，不拦截）。
func (s *RecruitService) FindDuplicates(dto recruitmodel.JobProcess) *util.Response {
	norm := normalizeCompany(dto.Company)
	jobs, err := s.jobRepo.List()
	if err != nil {
		log.Errorf("[recruit_service] FindDuplicates: %v", err)
		return util.DoRsp(util.ErrCode, "读取失败", nil)
	}
	out := []map[string]any{}
	for _, hit := range jobs {
		// kind 已由 stage 派生：stage 相同 ⇒ 类型相同，Kind 比对随之移除
		if hit.CompanyNorm != norm || hit.Stage != dto.Stage {
			continue
		}
		if fingerprint(hit) == fingerprint(dto) {
			continue // 完全同指纹走 CreateJob 的强去重
		}
		out = append(out, map[string]any{"job": hit})
	}
	return util.DoRsp(util.SuccCode, "", out)
}

// MergeJob 疑似重复「更新原有」：按白名单字段合并 patch 到目标条目。
func (s *RecruitService) MergeJob(targetID string, patch map[string]any) *util.Response {
	cur, err := s.jobRepo.Get(targetID)
	if err != nil {
		log.Errorf("[recruit_service] MergeJob get: %v", err)
		return util.DoRsp(util.ErrCode, "读取条目失败", nil)
	}
	if cur == nil {
		return util.DoRsp(util.ErrCode, "条目不存在", nil)
	}
	applyPatch := func(dst *string, v any) {
		if sv, ok := v.(string); ok {
			*dst = sv
		}
	}
	for k, v := range patch {
		switch k {
		case "position":
			applyPatch(&cur.Position, v)
		case "link":
			applyPatch(&cur.Link, v)
		case "location":
			applyPatch(&cur.Location, v)
		case "event_time":
			var p *string
			applyNullable(&p, v)
			cur.EventTime = p
		case "event_end":
			var p *string
			applyNullable(&p, v)
			cur.EventEnd = p
		case "deadline":
			var p *string
			applyNullable(&p, v)
			cur.Deadline = p
		}
	}
	if err := s.jobRepo.Update(cur); err != nil {
		log.Errorf("[recruit_service] MergeJob update: %v", err)
		return util.DoRsp(util.ErrCode, "合并失败", nil)
	}
	return util.DoRsp(util.SuccCode, "", map[string]any{"id": cur.ID})
}

// ───────────────────────────── 公司档案 ─────────────────────────────

// ListCompanies 全量公司档案。
func (s *RecruitService) ListCompanies() *util.Response {
	cs, err := s.companyRepo.List()
	if err != nil {
		log.Errorf("[recruit_service] ListCompanies: %v", err)
		return util.DoRsp(util.ErrCode, "加载公司档案失败", nil)
	}
	if cs == nil {
		cs = []recruitmodel.JobCompany{}
	}
	return util.DoRsp(util.SuccCode, "", cs)
}

// GetCompany 单档案。
func (s *RecruitService) GetCompany(id string) *util.Response {
	c, err := s.companyRepo.Get(id)
	if err != nil {
		log.Errorf("[recruit_service] GetCompany: %v", err)
		return util.DoRsp(util.ErrCode, "读取公司档案失败", nil)
	}
	if c == nil {
		return util.DoRsp(util.ErrCode, "公司档案不存在", nil)
	}
	return util.DoRsp(util.SuccCode, "", *c)
}

// SaveCompany 新建/更新档案（norm 冲突检测——别名归并的唯一权威，Q13 仅提示）。
func (s *RecruitService) SaveCompany(dto recruitmodel.JobCompany) *util.Response {
	dto.Norm = normalizeCompany(dto.Norm)
	if dto.Norm == "" {
		dto.Norm = normalizeCompany(dto.Name)
	}
	if dto.Norm == "" {
		return util.DoRsp(util.ErrCode, "公司名称不能为空", nil)
	}
	existing, err := s.companyRepo.GetByNorm(dto.Norm)
	if err != nil {
		log.Errorf("[recruit_service] SaveCompany getByNorm: %v", err)
		return util.DoRsp(util.ErrCode, "保存公司档案失败", nil)
	}
	if existing != nil && existing.ID != dto.ID {
		return util.DoRsp(util.ErrCode, "该别名已属于 "+existing.Name, nil)
	}
	if dto.ID != "" {
		cur, err := s.companyRepo.Get(dto.ID)
		if err != nil || cur == nil {
			return util.DoRsp(util.ErrCode, "公司档案不存在", nil)
		}
	}
	if err := s.companyRepo.Save(&dto); err != nil {
		log.Errorf("[recruit_service] SaveCompany: %v", err)
		return util.DoRsp(util.ErrCode, "保存公司档案失败", nil)
	}
	return util.DoRsp(util.SuccCode, "", map[string]any{"id": dto.ID})
}

// DeleteCompany 删除档案：其下仍有条目时拒绝（AC-36）。
func (s *RecruitService) DeleteCompany(id string) *util.Response {
	c, err := s.companyRepo.Get(id)
	if err != nil {
		log.Errorf("[recruit_service] DeleteCompany get: %v", err)
		return util.DoRsp(util.ErrCode, "读取公司档案失败", nil)
	}
	if c == nil {
		return util.DoRsp(util.ErrCode, "公司档案不存在", nil)
	}
	n, err := s.jobRepo.CountByCompany(c.Norm, id)
	if err != nil {
		log.Errorf("[recruit_service] DeleteCompany count: %v", err)
		return util.DoRsp(util.ErrCode, "删除公司档案失败", nil)
	}
	if n > 0 {
		return util.DoRsp(util.ErrCode, "请先处理该公司下的 "+itoa(n)+" 条记录", nil)
	}
	if err := s.companyRepo.Delete(id); err != nil {
		log.Errorf("[recruit_service] DeleteCompany delete: %v", err)
		return util.DoRsp(util.ErrCode, "删除公司档案失败", nil)
	}
	return util.DoRsp(util.SuccCode, "", nil)
}

// ───────────────────────────── 内部辅助 ─────────────────────────────

// ensureCompany 按 norm 自动建档 / 归并（F6：用户无感知，展示名取首次使用的公司名）。
func (s *RecruitService) ensureCompany(norm, name string) (*string, *util.Response) {
	existing, err := s.companyRepo.GetByNorm(norm)
	if err != nil {
		log.Errorf("[recruit_service] ensureCompany getByNorm: %v", err)
		return nil, util.DoRsp(util.ErrCode, "保存失败", nil)
	}
	if existing != nil {
		return &existing.ID, nil
	}
	c := recruitmodel.JobCompany{Name: strings.TrimSpace(name), Norm: norm, Aliases: "[]"}
	if err := s.companyRepo.Save(&c); err != nil {
		log.Errorf("[recruit_service] ensureCompany create: %v", err)
		return nil, util.DoRsp(util.ErrCode, "保存失败", nil)
	}
	return &c.ID, nil
}

// validateParent notice 的父关联校验：必须存在、是 apply、且同公司。
func (s *RecruitService) validateParent(j *recruitmodel.JobProcess) *util.Response {
	if j.Stage == "apply" {
		j.ParentID = nil
		return nil
	}
	if j.ParentID == nil || *j.ParentID == "" {
		j.ParentID = nil
		return nil
	}
	parent, err := s.jobRepo.Get(*j.ParentID)
	if err != nil {
		log.Errorf("[recruit_service] validateParent: %v", err)
		return util.DoRsp(util.ErrCode, "读取关联投递失败", nil)
	}
	if parent == nil || parent.Stage != "apply" || parent.CompanyNorm != j.CompanyNorm {
		return util.DoRsp(util.ErrCode, "关联的投递记录无效", nil)
	}
	return nil
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func applyNullable(dst **string, v any) {
	if v == nil {
		*dst = nil
		return
	}
	if sv, ok := v.(string); ok {
		*dst = &sv
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}
