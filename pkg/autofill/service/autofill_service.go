package service

import (
	"gosume/pkg/autofill"
	"gosume/pkg/log"
	"gosume/pkg/util"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// AutofillService 作为 Wails 服务暴露给前端，用于查看/控制「一键填入」本地桥。
//
// 结构体名必须与 ServiceName() 的返回值一致：Wails 的绑定全名格式为
// `pkg.StructName.Method`（见 v3/pkg/application/bindings.go 的 getMethods），
// 取的是结构体名而非 ServiceName()，两者不一致时前端会报
// "unknown bound method name"。其余服务均遵循此约定。
//
// 本服务位于 pkg/autofill/service 包下，与其它服务不同包；前端 callService
// 通过确定性的服务→包映射解析其绑定路径（frontend/src/services/backend.ts
// 的 SERVICE_PACKAGE_OVERRIDES），新增服务目录时在那里登记即可。
type AutofillService struct {
	app    *application.App
	bridge *autofill.Bridge
}

// ServiceName 返回服务名，供 Wails 绑定与前端调用。
func (s *AutofillService) ServiceName() string { return "AutofillService" }

// Inject 注入依赖。
func (s *AutofillService) Inject(app *application.App, bridge *autofill.Bridge) {
	s.app = app
	s.bridge = bridge
	log.Infof("[autofill_service] Inject: 已注入本地桥")
}

// GetStatus 返回本地桥运行状态（含 port、token、当前简历名），前端据此展示配对信息。
func (s *AutofillService) GetStatus() *util.Response {
	st := s.bridge.Status()
	log.Infof("[autofill_service] GetStatus: running=%v port=%d hasResume=%v resume=%q",
		st.Running, st.Port, st.HasResume, st.ResumeName)
	return util.DoRsp(util.SuccCode, "成功", st)
}

// Start 启动本地桥；已启动则为幂等操作。
func (s *AutofillService) Start() *util.Response {
	log.Infof("[autofill_service] Start: 尝试启动本地桥")
	if err := s.bridge.Start(); err != nil {
		log.Errorf("[autofill_service] Start: 启动失败: %v", err)
		return util.DoRsp(util.ErrCode, "启动自动填入服务失败", nil)
	}
	st := s.bridge.Status()
	log.Infof("[autofill_service] Start: 已启动，port=%d", st.Port)
	return util.DoRsp(util.SuccCode, "成功", st)
}

// Stop 停止本地桥。
func (s *AutofillService) Stop() *util.Response {
	log.Infof("[autofill_service] Stop: 停止本地桥")
	s.bridge.Stop()
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// RotateToken 轮换配对 token，返回新的状态。
func (s *AutofillService) RotateToken() *util.Response {
	log.Infof("[autofill_service] RotateToken: 轮换配对 token")
	return util.DoRsp(util.SuccCode, "成功", s.bridge.RotateToken())
}
