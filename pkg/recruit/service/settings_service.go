package service

import (
	"context"
	"sync"

	"gosume/pkg/ai"
	"gosume/pkg/log"
	recruitrepo "gosume/pkg/recruit/repo"
	"gosume/pkg/util"
)

// RecruitService 求职进程模块的后端服务。
type RecruitService struct {
	settingsRepo *recruitrepo.SettingsRepo
	jobRepo      *recruitrepo.JobRepo
	companyRepo  *recruitrepo.CompanyRepo
	chat         ai.ChatFunc // AI 对话能力（Parse 粘贴解析用；nil 视为未配置）

	// 前端关闭弹窗时调 CancelParse 触发，见 parse_service.go。
	parseMu     sync.Mutex
	parseCancel context.CancelFunc
}

// ServiceName 返回服务名，供 Wails 绑定与前端调用使用。
func (s *RecruitService) ServiceName() string {
	return "RecruitService"
}

// Inject 注入存储（全部复用 gosume.db 共享连接）与 AI 对话能力。
// chat 由装配层传 ai.NewDynamicChat(...)：每次调用实时读取当前启用配置，
// 热切换/改配置即时生效，本服务不感知数据目录。
func (s *RecruitService) Inject(jobRepo *recruitrepo.JobRepo, companyRepo *recruitrepo.CompanyRepo, settingsRepo *recruitrepo.SettingsRepo, chat ai.ChatFunc) {
	s.jobRepo = jobRepo
	s.companyRepo = companyRepo
	s.settingsRepo = settingsRepo
	s.chat = chat
}

// supportedThresholds 临近阈值合法档位（PRD Q3：12 / 24 / 48 / 72）。
var supportedThresholds = map[int]bool{12: true, 24: true, 48: true, 72: true}

// GetSettings 读取模块设置。
func (s *RecruitService) GetSettings() *util.Response {
	return util.DoRsp(util.SuccCode, "", s.settingsRepo.Get())
}

// SetSettings 部分更新模块设置。
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
