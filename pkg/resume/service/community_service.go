package service

import (
	"context"
	"encoding/json"
	"gosume/pkg/log"
	"gosume/pkg/resume/dto"
	"gosume/pkg/resume/repo"
	"gosume/pkg/resume/template"
	"gosume/pkg/resume/template_market"
	"gosume/pkg/util"
	"os"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// 社区列表接口默认分页大小上限。
const (
	communityListPageSize = 24
	communityMaxPageSize  = 100
)

// CommunityService 提供模板社区（在线模板市场）能力：
// 浏览社区模板、下载安装到本地、把本地模板发布到社区、模板评分。
// 依赖 config.yaml 中的 gosume.CommunityService 命名服务，需联网访问。
// 客户端逻辑位于 template_market 包，本服务仅做装配与展示层封装。
type CommunityService struct {
	App      *application.App
	client   *template_market.Client // 社区 HTTP 客户端（未配置时为 nil）
	loader   *template.Loader        // 模板加载器
	tempRepo *repo.TemplateRepo      // 模板存储（下载安装持久化）
}

// ServiceName 返回服务名，供 Wails 绑定与前端调用使用。
func (s *CommunityService) ServiceName() string {
	return "CommunityService"
}

// Inject 注入依赖。社区服务未配置时 client 保持 nil，前端会收到明确提示。
func (s *CommunityService) Inject(app *application.App, loader *template.Loader, tempRepo *repo.TemplateRepo) {
	s.App = app
	s.loader = loader
	s.tempRepo = tempRepo
	client, err := template_market.NewClient()
	if err != nil {
		log.Warnf("[community_service] Inject: 社区服务未启用: %v", err)
		return
	}
	s.client = client
	log.Infof("[community_service] Inject: 社区服务就绪 %s", client.Endpoint())
}

// GetCommunityInfo 返回社区服务的配置状态，前端据此提示是否可联网访问。
func (s *CommunityService) GetCommunityInfo() *util.Response {
	if s.client == nil {
		return util.DoRsp(util.SuccCode, "成功", &dto.CommunityInfo{Configured: false})
	}
	return util.DoRsp(util.SuccCode, "成功", &dto.CommunityInfo{
		Endpoint:   s.client.Endpoint(),
		Configured: true,
	})
}

// ListCommunityTemplates 分页拉取社区模板列表，支持分类与关键字筛选，
// 并标记每个模板是否已安装到本地。
func (s *CommunityService) ListCommunityTemplates(category, keyword string, page, pageSize int) *util.Response {
	if s.client == nil {
		return util.DoRsp(util.ErrCode, "模板社区未配置，无法联网访问", nil)
	}
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 || pageSize > communityMaxPageSize {
		pageSize = communityListPageSize
	}

	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()

	list, err := s.client.ListTemplates(ctx, category, keyword, page, pageSize)
	if err != nil {
		log.Errorf("[community_service] ListCommunityTemplates: %v", err)
		// 错误细节仅入日志，不向用户暴露底层原因（网络/服务端状态等）
		return util.DoRsp(util.ErrCode, "访问模板社区失败，请检查网络后重试", nil)
	}
	for i := range list.Items {
		list.Items[i].IsInstalled = s.isInstalled(list.Items[i].ID)
	}

	log.Infof("[community_service] ListCommunityTemplates: category=%s keyword=%s 返回 %d 条", category, keyword, len(list.Items))
	return util.DoRsp(util.SuccCode, "成功", list)
}

// GetCommunityTemplate 返回单个社区模板详情。
func (s *CommunityService) GetCommunityTemplate(id string) *util.Response {
	if s.client == nil {
		return util.DoRsp(util.ErrCode, "模板社区未配置，无法联网访问", nil)
	}
	if id == "" {
		return util.DoRsp(util.ErrCode, "模板 ID 不能为空", nil)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	tmpl, err := s.client.GetTemplate(ctx, id)
	if err != nil {
		log.Errorf("[community_service] GetCommunityTemplate: id=%s: %v", id, err)
		return util.DoRsp(util.ErrCode, "获取模板失败，请稍后重试", nil)
	}
	tmpl.IsInstalled = s.isInstalled(tmpl.ID)
	return util.DoRsp(util.SuccCode, "成功", tmpl)
}

// DownloadCommunityTemplate 下载社区模板包并安装到本地：
// 下载 zip → 现有导入校验（LoadPackageFromZip）→ 写入 SQLite → 记录导入历史。
// 安装后模板离线可用，与本地模板一致。
func (s *CommunityService) DownloadCommunityTemplate(id string) *util.Response {
	if s.client == nil {
		return util.DoRsp(util.ErrCode, "模板社区未配置，无法联网访问", nil)
	}
	if s.tempRepo == nil {
		return util.DoRsp(util.ErrCode, "模板存储未初始化", nil)
	}
	if id == "" {
		return util.DoRsp(util.ErrCode, "模板 ID 不能为空", nil)
	}
	if s.isInstalled(id) {
		return util.DoRsp(util.ErrCode, "该模板已安装，无需重复下载", nil)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	data, err := s.client.DownloadTemplate(ctx, id)
	if err != nil {
		log.Errorf("[community_service] DownloadCommunityTemplate: id=%s: %v", id, err)
		return util.DoRsp(util.ErrCode, "模板下载失败，请稍后重试", nil)
	}

	tmp, err := os.CreateTemp("", "community-dl-*.zip")
	if err != nil {
		log.Errorf("[community_service] DownloadCommunityTemplate: 创建临时文件失败: %v", err)
		return util.DoRsp(util.ErrCode, "模板下载失败，请稍后重试", nil)
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		log.Errorf("[community_service] DownloadCommunityTemplate: 写入临时文件失败: %v", err)
		return util.DoRsp(util.ErrCode, "模板下载失败，请稍后重试", nil)
	}
	if err := tmp.Close(); err != nil {
		log.Errorf("[community_service] DownloadCommunityTemplate: 关闭临时文件失败: %v", err)
		return util.DoRsp(util.ErrCode, "模板下载失败，请稍后重试", nil)
	}

	// 复用现有模板包校验（路径安全、体积上限、元数据合法性）
	pkg, err := template.LoadPackageFromZip(tmpPath)
	if err != nil {
		log.Errorf("[community_service] DownloadCommunityTemplate: 模板包校验失败 id=%s: %v", id, err)
		return util.DoRsp(util.ErrCode, "模板包校验失败", nil)
	}
	if existing, _ := s.loader.LoadByID(pkg.Meta.ID); existing != nil {
		return util.DoRsp(util.ErrCode, "本地已存在相同模板，安装已跳过", nil)
	}

	if err := s.tempRepo.Create(pkg.Meta, pkg.CSS); err != nil {
		log.Errorf("[community_service] DownloadCommunityTemplate: 保存模板失败 id=%s: %v", pkg.Meta.ID, err)
		return util.DoRsp(util.ErrCode, "模板安装失败，请稍后重试", nil)
	}
	if err := s.tempRepo.AddImportLog(pkg.Meta.ID, pkg.Meta.Name, "community"); err != nil {
		log.Warnf("[community_service] DownloadCommunityTemplate: 记录导入历史失败: %v", err)
	}

	log.Infof("[community_service] DownloadCommunityTemplate: 已安装社区模板 id=%s name=%s", pkg.Meta.ID, pkg.Meta.Name)
	return util.DoRsp(util.SuccCode, "已下载并安装到本地", &dto.DownloadTemplateResponse{
		TemplateID: pkg.Meta.ID,
		Name:       pkg.Meta.Name,
		Version:    pkg.Meta.Version,
	})
}

// PublishCommunityTemplate 把本地模板发布到模板社区。
func (s *CommunityService) PublishCommunityTemplate(id string) *util.Response {
	if s.client == nil {
		return util.DoRsp(util.ErrCode, "模板社区未配置，无法发布", nil)
	}
	if id == "" {
		return util.DoRsp(util.ErrCode, "模板 ID 不能为空", nil)
	}
	t, err := s.loader.LoadByID(id)
	if err != nil {
		log.Errorf("[community_service] PublishCommunityTemplate: 模板不存在 id=%s: %v", id, err)
		return util.DoRsp(util.ErrCode, "模板不存在", nil)
	}

	metaJSON, err := json.Marshal(t.Meta)
	if err != nil {
		log.Errorf("[community_service] PublishCommunityTemplate: 序列化元数据失败 id=%s: %v", id, err)
		return util.DoRsp(util.ErrCode, "发布失败", nil)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	resp, err := s.client.PublishTemplate(ctx, string(metaJSON), t.CSS)
	if err != nil {
		log.Errorf("[community_service] PublishCommunityTemplate: 发布失败 id=%s: %v", id, err)
		return util.DoRsp(util.ErrCode, "发布失败，请稍后重试", nil)
	}

	log.Infof("[community_service] PublishCommunityTemplate: 已发布模板 id=%s -> 社区 %s", id, resp.ID)
	return util.DoRsp(util.SuccCode, "发布成功", resp)
}

// RateCommunityTemplate 提交对某个社区模板的评分（1-5 星）。
func (s *CommunityService) RateCommunityTemplate(id string, score int) *util.Response {
	if s.client == nil {
		return util.DoRsp(util.ErrCode, "模板社区未配置，无法评分", nil)
	}
	if id == "" {
		return util.DoRsp(util.ErrCode, "模板 ID 不能为空", nil)
	}
	if score < 1 || score > 5 {
		return util.DoRsp(util.ErrCode, "评分需在 1-5 之间", nil)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	if err := s.client.RateTemplate(ctx, id, score); err != nil {
		log.Errorf("[community_service] RateCommunityTemplate: id=%s score=%d: %v", id, score, err)
		return util.DoRsp(util.ErrCode, "评分提交失败，请稍后重试", nil)
	}

	log.Infof("[community_service] RateCommunityTemplate: 已评分 id=%s score=%d", id, score)
	return util.DoRsp(util.SuccCode, "评分成功", nil)
}

// isInstalled 判断本地是否已安装同 ID 的模板（社区 ID 与包内 template.json ID 一致）。
func (s *CommunityService) isInstalled(id string) bool {
	if s.loader == nil || id == "" {
		return false
	}
	t, err := s.loader.LoadByID(id)
	return err == nil && t != nil
}