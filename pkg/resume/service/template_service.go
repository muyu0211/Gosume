package service

import (
	"fmt"
	"sort"
	"strings"

	"gosume/pkg/log"
	"gosume/pkg/resume/dto"
	"gosume/pkg/resume/model"
	"gosume/pkg/resume/repo"
	"gosume/pkg/resume/template"
	"gosume/pkg/resume/vo"
	"gosume/pkg/util"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// TemplateService 管理模板的查询、增删改与导入。
type TemplateService struct {
	App        *application.App
	loader     *template.Loader // 模板加载器
	tempRepo   *repo.TemplateRepo
	HTML       string
	GlobalCSS string
}

// ServiceName 返回服务名，供 Wails 绑定与前端调用使用。
func (s *TemplateService) ServiceName() string {
	return "TemplateService"
}

// Inject 注入依赖。unifiedHTML 为应用内置的统一简历 HTML 骨架，globalCSS 为全局统一样式。
func (s *TemplateService) Inject(app *application.App, loader *template.Loader, store *repo.TemplateRepo, unifiedHTML string, globalCSS string) {
	s.App = app
	s.loader = loader
	s.tempRepo = store
	s.HTML = unifiedHTML
	s.GlobalCSS = globalCSS
}

// ListTemplates 返回所有可用模板的元数据（内置 + 用户模板）。
func (s *TemplateService) ListTemplates() *util.Response {
	templates, err := s.loader.LoadAll()
	if err != nil {
		log.Errorf("[template_service] ListTemplates: 加载模板列表失败: %v", err)
		return util.DoRsp(util.ErrCode, fmt.Sprintf("加载模板列表失败: %s", err.Error()), nil)
	}

	var metas []vo.TemplateMeta
	for _, t := range templates {
		metas = append(metas, util.GetTemplateMeta(t))
	}
	log.Infof("[template_service] ListTemplates: 共 %d 个模板", len(metas))
	return util.DoRsp(util.SuccCode, "成功", metas)
}

// GetTemplate 返回单个模板的元数据。
func (s *TemplateService) GetTemplate(id string) *util.Response {
	t, err := s.loader.LoadByID(id)
	if err != nil {
		log.Errorf("[template_service] GetTemplate: 模板不存在 id=%s: %v", id, err)
		return util.DoRsp(util.ErrCode, "模板不存在", nil)
	}
	meta := util.GetTemplateMeta(t)
	return util.DoRsp(util.SuccCode, "成功", &meta)
}

// effectiveHTML 返回模板实际使用的 HTML：已迁移到统一骨架（uses_unified_html）
// 或模板无自带 HTML 时使用应用内置的 template.html（Gosume 一期改造）。
func (s *TemplateService) effectiveHTML(t *dto.Template) string {
	if t.Meta.UseUnifiedHTML || strings.TrimSpace(t.HTML) == "" {
		return s.HTML
	}
	return t.HTML
}

// GetTemplateContent 返回模板的 HTML、CSS 及纸张规格。
func (s *TemplateService) GetTemplateContent(id string) *util.Response {
	t, err := s.loader.LoadByID(id)
	if err != nil {
		log.Errorf("[template_service] GetTemplateContent: 模板不存在 id=%s: %v", id, err)
		return util.DoRsp(util.ErrCode, "模板不存在", nil)
	}
	orientation := ""
	if len(t.Meta.Orientations) > 0 {
		orientation = t.Meta.Orientations[0]
	}
	return util.DoRsp(util.SuccCode, "成功", &vo.TemplateContent{
		HTML:        s.effectiveHTML(t),
		CSS:         t.CSS,
		GlobalCSS:   s.GlobalCSS,
		PaperSize:   t.Meta.PaperSize,
		Orientation: orientation,
	})
}

// ImportTemplateResponse 是用户模板包安装成功后返回给前端的结果。
type ImportTemplateResponse struct {
	ID      string          `json:"id"`
	Name    string          `json:"name"`
	Version string          `json:"version"`
	Meta    vo.TemplateMeta `json:"meta"`
}

// ImportTemplatePackage 弹出原生文件对话框，导入本地 .zip 模板包。
// 用户取消选择时返回成功响应且 data 为空串。
func (s *TemplateService) ImportTemplatePackage() *util.Response {
	return s.importPackageViaDialog("local")
}

// ImportSharePackage 导入他人分享的 .zip 模板包。
// 复用现有导入校验流程（LoadPackageFromZip），仅以 share 来源记录导入历史。
func (s *TemplateService) ImportSharePackage() *util.Response {
	return s.importPackageViaDialog("share")
}

// importPackageViaDialog 弹出原生文件对话框选择 .zip 模板包，并以指定来源记录导入历史。
func (s *TemplateService) importPackageViaDialog(source string) *util.Response {
	if s.App == nil {
		return util.DoRsp(util.ErrCode, "应用未初始化", nil)
	}

	filePath, err := s.App.Dialog.OpenFile().
		SetTitle("导入模板包").
		AddFilter("ZIP 文件 (*.zip)", "*.zip").
		AddFilter("所有文件 (*.*)", "*.*").
		CanChooseFiles(true).
		PromptForSingleSelection()
	if err != nil {
		if util.IsCancel(err) {
			return util.DoRsp(util.SuccCode, "已取消", "")
		}
		return util.DoRsp(util.ErrCode, "打开文件对话框失败", nil)
	}
	if filePath == "" {
		return util.DoRsp(util.SuccCode, "已取消", "")
	}
	return s.importTemplatePackageFromPath(filePath, source)
}

// importTemplatePackageFromPath 从指定路径解析并安装模板包。
// 解析 ZIP → 校验 ID 未被占用 → 写入 SQLite → 记录导入历史 → 返回结果。
func (s *TemplateService) importTemplatePackageFromPath(filePath, source string) *util.Response {
	if strings.TrimSpace(filePath) == "" {
		return util.DoRsp(util.ErrCode, "模板包路径不能为空", nil)
	}

	pkg, err := template.LoadPackageFromZip(filePath)
	if err != nil {
		log.Errorf("[template_service] importTemplatePackageFromPath: 解析模板包失败 %s: %v", filePath, err)
		return util.DoRsp(util.ErrCode, fmt.Sprintf("解析模板包失败: %v", err), nil)
	}

	// 检查模板 ID 是否已经存在，存在则判断version
	if existing, _ := s.loader.LoadByID(pkg.Meta.ID); existing != nil {
		log.Warnf("[template_service] importTemplatePackageFromPath: 模板已存在 id=%s", pkg.Meta.ID)
		// 如果版本号相同，则提示用户模板已经存在，提示用户是否需要覆盖/不覆盖
		return util.DoRsp(util.ErrCode, "模板已存在", nil)
	}

	if err := s.tempRepo.Create(pkg.Meta, pkg.CSS); err != nil {
		log.Errorf("[template_service] importTemplatePackageFromPath: 保存模板失败 id=%s: %v", pkg.Meta.ID, err)
		return util.DoRsp(util.ErrCode, fmt.Sprintf("保存模板失败: %v", err), nil)
	}

	// 记录导入历史（本地导入/分享包导入），失败仅告警不阻断导入流程
	if err := s.tempRepo.AddImportLog(pkg.Meta.ID, pkg.Meta.Name, source); err != nil {
		log.Warnf("[template_service] importTemplatePackageFromPath: 记录导入历史失败 id=%s: %v", pkg.Meta.ID, err)
	}

	log.Infof("[template_service] importTemplatePackageFromPath: 已导入模板 id=%s name=%s source=%s", pkg.Meta.ID, pkg.Meta.Name, source)
	meta := util.GetTemplateMeta(&dto.Template{
		Meta:      pkg.Meta,
		CSS:       pkg.CSS,
		IsBuiltin: false,
	})
	return util.DoRsp(util.SuccCode, "成功", &ImportTemplateResponse{
		ID:      pkg.Meta.ID,
		Name:    pkg.Meta.Name,
		Version: pkg.Meta.Version,
		Meta:    meta,
	})
}

// ValidateForTemplate 校验简历数据是否满足指定模板的要求。
func (s *TemplateService) ValidateForTemplate(templateID string, resume *model.Resume) *util.Response {
	t, err := s.loader.LoadByID(templateID)
	if err != nil {
		return util.DoRsp(util.SuccCode, "成功", &template.ValidationResult{
			Valid:  false,
			Errors: []string{fmt.Sprintf("模板不存在: %s", templateID)},
		})
	}
	return util.DoRsp(util.SuccCode, "成功", template.ValidateDataForTemplate(t, resume))
}

// CreateTemplate 创建一个用户模板。
func (s *TemplateService) CreateTemplate(meta dto.TemplateMeta, css string) *util.Response {
	if meta.ID == "" {
		log.Errorf("[template_service] CreateTemplate: 模板 ID 不能为空")
		return util.DoRsp(util.ErrCode, "模板 ID 不能为空", nil)
	}
	if err := s.tempRepo.Create(meta, css); err != nil {
		log.Errorf("[template_service] CreateTemplate: 创建模板失败 id=%s: %v", meta.ID, err)
		return util.DoRsp(util.ErrCode, err.Error(), nil)
	}
	log.Infof("[template_service] CreateTemplate: 已创建模板 id=%s", meta.ID)
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// UpdateTemplate 更新已存在的用户模板。
func (s *TemplateService) UpdateTemplate(id string, meta dto.TemplateMeta, css string) *util.Response {
	if meta.ID == "" {
		log.Errorf("[template_service] UpdateTemplate: 模板 ID 不能为空")
		return util.DoRsp(util.ErrCode, "模板 ID 不能为空", nil)
	}
	if err := s.tempRepo.Update(id, meta, css); err != nil {
		log.Errorf("[template_service] UpdateTemplate: 更新模板失败 id=%s: %v", id, err)
		return util.DoRsp(util.ErrCode, fmt.Sprintf("更新模板失败: %v", err), nil)
	}
	log.Infof("[template_service] UpdateTemplate: 已更新模板 id=%s", id)
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// DeleteTemplate 软删除用户模板。
func (s *TemplateService) DeleteTemplate(id string) *util.Response {
	if id == "" {
		log.Errorf("[template_service] DeleteTemplate: 模板 ID 不能为空")
		return util.DoRsp(util.ErrCode, "模板 ID 不能为空", nil)
	}
	if err := s.tempRepo.SoftDelete(id); err != nil {
		log.Errorf("[template_service] DeleteTemplate: 删除模板失败 id=%s: %v", id, err)
		return util.DoRsp(util.ErrCode, err.Error(), nil)
	}
	log.Infof("[template_service] DeleteTemplate: 已删除模板 id=%s", id)
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// CloneTemplate 把模板（内置或用户）复制为一个新的用户模板。
// 新模板版本号重置为 1.0.0。
func (s *TemplateService) CloneTemplate(sourceID, newID string) *util.Response {
	if newID == "" {
		return util.DoRsp(util.ErrCode, "新模板 ID 不能为空", nil)
	}

	src, err := s.loader.LoadByID(sourceID)
	if err != nil {
		log.Errorf("[template_service] CloneTemplate: 源模板不存在 id=%s: %v", sourceID, err)
		return util.DoRsp(util.ErrCode, fmt.Sprintf("模板不存在: %v", err), nil)
	}

	meta := src.Meta
	meta.ID = newID
	meta.Version = "1.0.0"

	// 检查新 ID 是否已被占用
	if existing, _ := s.loader.LoadByID(newID); existing != nil {
		log.Warnf("[template_service] CloneTemplate: 新模板 ID 已被占用 id=%s", newID)
		return util.DoRsp(util.ErrCode, "模板 ID 已被占用", nil)
	}

	if err := s.tempRepo.Create(meta, src.CSS); err != nil {
		log.Errorf("[template_service] CloneTemplate: 克隆模板失败 source=%s new=%s: %v", sourceID, newID, err)
		return util.DoRsp(util.ErrCode, fmt.Sprintf("克隆模板失败: %v", err), nil)
	}

	log.Infof("[template_service] CloneTemplate: 已克隆模板 %s -> %s", sourceID, newID)
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// ListCategories 返回模板分类及数量，供模板市场分类筛选。
// "custom"（未分类）排在末尾，其余按名称字典序排列。
func (s *TemplateService) ListCategories() *util.Response {
	templates, err := s.loader.LoadAll()
	if err != nil {
		log.Errorf("[template_service] ListCategories: 加载模板列表失败: %v", err)
		return util.DoRsp(util.ErrCode, "加载模板列表失败", nil)
	}

	counts := map[string]int{}
	for _, t := range templates {
		cat := strings.TrimSpace(t.Meta.Category)
		if cat == "" {
			cat = "custom"
		}
		counts[cat]++
	}

	cats := make([]vo.TemplateCategory, 0, len(counts))
	for name, count := range counts {
		cats = append(cats, vo.TemplateCategory{Name: name, Count: count})
	}
	sort.Slice(cats, func(i, j int) bool {
		if cats[i].Name == "custom" {
			return false
		}
		if cats[j].Name == "custom" {
			return true
		}
		return cats[i].Name < cats[j].Name
	})

	log.Infof("[template_service] ListCategories: 共 %d 个分类", len(cats))
	return util.DoRsp(util.SuccCode, "成功", cats)
}

// ListTemplatesByCategory 按分类/标签/收藏筛选模板并分页返回。
// category 为空表示全部分类；tag 为空表示全部标签；favoriteOnly 为 true 时仅返回收藏。
// page 从 1 开始，pageSize <= 0 时返回全部命中项。
func (s *TemplateService) ListTemplatesByCategory(category, tag string, favoriteOnly bool, page, pageSize int) *util.Response {
	templates, err := s.loader.LoadAll()
	if err != nil {
		log.Errorf("[template_service] ListTemplatesByCategory: 加载模板列表失败: %v", err)
		return util.DoRsp(util.ErrCode, "加载模板列表失败", nil)
	}

	filtered := make([]*dto.Template, 0, len(templates))
	for _, t := range templates {
		if category != "" && t.Meta.Category != category {
			continue
		}
		if tag != "" {
			matched := false
			for _, tg := range t.Meta.Tags {
				if tg == tag {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
		}
		if favoriteOnly && !t.IsFavorite {
			continue
		}
		filtered = append(filtered, t)
	}

	total := len(filtered)
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = total
	}
	start := (page - 1) * pageSize
	if start > total {
		start = total
	}
	end := start + pageSize
	if end > total {
		end = total
	}

	items := make([]vo.TemplateMeta, 0, end-start)
	for _, t := range filtered[start:end] {
		items = append(items, util.GetTemplateMeta(t))
	}

	log.Infof("[template_service] ListTemplatesByCategory: category=%s tag=%s favorite=%v 命中 %d 个模板", category, tag, favoriteOnly, total)
	return util.DoRsp(util.SuccCode, "成功", &vo.TemplateListResponse{
		Total:    total,
		Page:     page,
		PageSize: pageSize,
		Items:    items,
	})
}

// SetTemplateFavorite 收藏或取消收藏模板（内置与用户模板均可收藏）。
func (s *TemplateService) SetTemplateFavorite(id string, favorite bool) *util.Response {
	if id == "" {
		log.Errorf("[template_service] SetTemplateFavorite: 模板 ID 不能为空")
		return util.DoRsp(util.ErrCode, "模板 ID 不能为空", nil)
	}
	if err := s.tempRepo.SetFavorite(id, favorite); err != nil {
		log.Errorf("[template_service] SetTemplateFavorite: id=%s favorite=%v: %v", id, favorite, err)
		return util.DoRsp(util.ErrCode, err.Error(), nil)
	}
	log.Infof("[template_service] SetTemplateFavorite: id=%s favorite=%v", id, favorite)
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// ListImportLogs 分页返回模板包导入历史（按导入时间倒序）。
// page 从 1 开始，pageSize <= 0 时默认返回最近 50 条。
func (s *TemplateService) ListImportLogs(page, pageSize int) *util.Response {
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 50
	}
	logs, err := s.tempRepo.ListImportLogs(pageSize, (page-1)*pageSize)
	if err != nil {
		log.Errorf("[template_service] ListImportLogs: 查询导入历史失败: %v", err)
		return util.DoRsp(util.ErrCode, "查询导入历史失败", nil)
	}
	items := make([]vo.ImportLog, 0, len(logs))
	for _, l := range logs {
		items = append(items, vo.ImportLog{
			ID:           l.ID,
			TemplateID:   l.TemplateID,
			TemplateName: l.TemplateName,
			Source:       l.Source,
			ImportedAt:   l.ImportedAt,
		})
	}
	log.Infof("[template_service] ListImportLogs: 共返回 %d 条", len(items))
	return util.DoRsp(util.SuccCode, "成功", items)
}

// DeleteImportLog 删除一条导入历史记录。
func (s *TemplateService) DeleteImportLog(id int64) *util.Response {
	if err := s.tempRepo.DeleteImportLog(id); err != nil {
		log.Errorf("[template_service] DeleteImportLog: id=%d: %v", id, err)
		return util.DoRsp(util.ErrCode, err.Error(), nil)
	}
	log.Infof("[template_service] DeleteImportLog: id=%d", id)
	return util.DoRsp(util.SuccCode, "成功", nil)
}

// ExportTemplatePackage 弹出保存对话框，把模板导出为可分享的 .zip 分享包
// （template.json + styles.css + README.md），格式与现有导入包兼容。
// 用户取消选择时返回成功响应且 data 为空串。
func (s *TemplateService) ExportTemplatePackage(id string) *util.Response {
	if s.App == nil {
		return util.DoRsp(util.ErrCode, "应用未初始化", nil)
	}
	t, err := s.loader.LoadByID(id)
	if err != nil {
		log.Errorf("[template_service] ExportTemplatePackage: 模板不存在 id=%s: %v", id, err)
		return util.DoRsp(util.ErrCode, "模板不存在", nil)
	}

	defaultName := fmt.Sprintf("%s.zip", strings.ReplaceAll(t.Meta.Name, " ", "_"))
	filePath, err := s.App.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:    "导出模板分享包",
		Filename: defaultName,
		Filters: []application.FileFilter{
			{DisplayName: "ZIP 文件 (*.zip)", Pattern: "*.zip"},
			{DisplayName: "所有文件 (*.*)", Pattern: "*.*"},
		},
	}).PromptForSingleSelection()
	if err != nil {
		if util.IsCancel(err) {
			return util.DoRsp(util.SuccCode, "已取消", "")
		}
		log.Errorf("[template_service] ExportTemplatePackage: 保存对话框失败: %v", err)
		return util.DoRsp(util.ErrCode, "打开保存对话框失败", nil)
	}
	if filePath == "" {
		return util.DoRsp(util.SuccCode, "已取消", "")
	}
	if !strings.HasSuffix(strings.ToLower(filePath), ".zip") {
		filePath += ".zip"
	}

	if err := template.WriteSharePackage(t, filePath); err != nil {
		log.Errorf("[template_service] ExportTemplatePackage: 导出失败 id=%s: %v", id, err)
		return util.DoRsp(util.ErrCode, "导出模板分享包失败", nil)
	}
	log.Infof("[template_service] ExportTemplatePackage: 已导出分享包 %s", filePath)
	return util.DoRsp(util.SuccCode, "成功", filePath)
}
