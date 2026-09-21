package service

import (
	"gosume/pkg/log"
	recruitrepo "gosume/pkg/recruit/repo"
	"gosume/pkg/util"
)

// RecruitService 求职进程模块的后端服务。
//
// 分期实现（PRD）：设置项 + 条目 CRUD + 公司档案已就绪（2026-09-19）；
// Parse（粘贴解析）与导出导入待后续批次——前端已有的对应调用在绑定实现前
// 会失败，属于已知未实现，不是缺陷。
type RecruitService struct {
	settingsRepo *recruitrepo.SettingsRepo
	jobRepo      *recruitrepo.JobRepo
	companyRepo  *recruitrepo.CompanyRepo
}

// ServiceName 返回服务名，供 Wails 绑定与前端调用使用。
// ⚠ 绑定全名第三段取结构体名，必须与前端 registerServicePackage 登记的包路径一致。
func (s *RecruitService) ServiceName() string {
	return "RecruitService"
}

// Inject 注入存储（全部复用 gosume.db 共享连接）。
func (s *RecruitService) Inject(jobRepo *recruitrepo.JobRepo, companyRepo *recruitrepo.CompanyRepo, settingsRepo *recruitrepo.SettingsRepo) {
	s.jobRepo = jobRepo
	s.companyRepo = companyRepo
	s.settingsRepo = settingsRepo
}

// supportedThresholds 临近阈值合法档位（PRD Q3：12 / 24 / 48 / 72）。
var supportedThresholds = map[int]bool{12: true, 24: true, 48: true, 72: true}

// GetSettings 读取模块设置。
func (s *RecruitService) GetSettings() *util.Response {
	return util.DoRsp(util.SuccCode, "", s.settingsRepo.Get())
}

// SetSettings 部分更新模块设置。
//
// patch 的键与前端 JobSettings 字段名一致（nearThresholdHours / saveRawText），
// Wails 会把 JSON 对象解成 map[string]any（数值为 float64）。
// 只更新**出现的键**——saveRawText=false 是合法值，不能用零值判断是否提供。
func (s *RecruitService) SetSettings(patch map[string]any) *util.Response {
	cur := s.settingsRepo.Get()

	if v, ok := patch["nearThresholdHours"]; ok {
		f, ok := v.(float64)
		if !ok {
			return util.DoRsp(util.ErrCode, "临近阈值格式无效", nil)
		}
		n := int(f)
		if !supportedThresholds[n] {
			return util.DoRsp(util.ErrCode, "不支持的临近阈值", nil)
		}
		cur.NearThresholdHours = n
	}

	if v, ok := patch["saveRawText"]; ok {
		b, ok := v.(bool)
		if !ok {
			return util.DoRsp(util.ErrCode, "原文保存开关格式无效", nil)
		}
		cur.SaveRawText = b
	}

	if err := s.settingsRepo.Save(cur); err != nil {
		log.Errorf("[recruit_service] SetSettings 保存失败: %v", err)
		return util.DoRsp(util.ErrCode, "保存设置失败", nil)
	}
	return util.DoRsp(util.SuccCode, "", cur)
}
