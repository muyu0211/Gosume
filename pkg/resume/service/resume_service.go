package service

import (
	"encoding/json"
	"fmt"
	"gosume/pkg/log"
	"sync"
	"time"

	"gosume/pkg/resume/model"
	"gosume/pkg/resume/repo"
	"gosume/pkg/resume/template_render"
	"gosume/pkg/util"
)

// ResumeService 管理当前编辑中的简历数据与预览渲染。
//
// 采用两层保存模型：内存态（current）与持久态（DB 记录）分离，
// 只有用户显式保存过的简历才允许自动保存，避免意外落库。
type ResumeService struct {
	resumeRepo *repo.ResumeRepo
	renderer   *template_render.HTMLRenderer
	current    *model.Resume
	currentID  string
	persisted  bool // 当前简历是否至少成功持久化过一次
	mu         sync.RWMutex
}

// ServiceName 返回服务名，供 Wails 绑定与前端调用使用。
func (s *ResumeService) ServiceName() string {
	return "ResumeService"
}

// Inject 注入依赖。
func (s *ResumeService) Inject(resumeStore *repo.ResumeRepo, renderer *template_render.HTMLRenderer) {
	s.resumeRepo = resumeStore
	s.renderer = renderer
}

// NewResume 仅在内存中创建一份空白简历。
//
// 该方法不会写入 SQLite——持久化被推迟到用户调用 ExplicitSave 时才发生。
// 参数 templateID 指定初始模板，language 指定简历语言。
func (s *ResumeService) NewResume(templateID string, language string) (*model.Resume, error) {
	now := time.Now()
	resume := &model.Resume{
		Version: model.SchemaVersion,
		Meta: model.ResumeMeta{
			TemplateID:     templateID,
			Language:       language,
			FontSize:       model.FontSizeMedium,
			PageMargin:     model.PageMarginNormal,
			SectionSpacing: model.SectionSpacingNormal,
			CreatedAt:      now,
			UpdatedAt:      now,
		},
		Personal: model.Personal{},
	}

	s.mu.Lock()
	s.current = resume
	s.currentID = ""
	s.persisted = false
	s.mu.Unlock()

	log.Info("[resume_service] NewResume: template=%s (memory only, NOT persisted)", templateID)
	return resume, nil
}

// GetResume 返回当前简历数据。
func (s *ResumeService) GetResume() *model.Resume {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.current
}

// GetCurrentID 返回当前已加载简历的 UUID；尚未持久化时为空串。
func (s *ResumeService) GetCurrentID() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.currentID
}

// SetResume 替换内存中的当前简历，但不写库。
//
// 该方法保留 currentID，即后续保存仍会更新同一条记录；
// 若需要把简历视为全新记录，请使用 InitResume。
func (s *ResumeService) SetResume(resume *model.Resume) {
	s.mu.Lock()
	defer s.mu.Unlock()
	resume.Meta.UpdatedAt = time.Now()
	s.current = resume
}

// InitResume 设置当前简历并重置其身份，使下次 ExplicitSave 创建新记录
// 而不是覆盖已有记录。
//
// 适用于从外部来源（项目文件、示例数据等）载入、应被当作全新简历的场景。
func (s *ResumeService) InitResume(resume *model.Resume) {
	s.mu.Lock()
	defer s.mu.Unlock()
	resume.Meta.UpdatedAt = time.Now()
	s.current = resume
	s.currentID = ""
	s.persisted = false
	log.Info("[resume_service] InitResume: identity reset (will create new row on save)")
}

// UpdateField 按点号路径更新当前简历中的某个字段。
//
// path 支持数组下标，如 "personal.full_name"、"jobs[0].company"；
// value 为该字段对应的 JSON 原文。
func (s *ResumeService) UpdateField(path string, value json.RawMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.current == nil {
		log.Error("[resume_service] no resume loaded")
		return util.UserMsg("未加载简历")
	}

	if err := util.SetFieldByPath(s.current, path, value); err != nil {
		log.Error("[resume_service] update field %s: %v", path, err)
		return util.UserWrap(err, "更新字段失败")
	}

	s.current.Meta.UpdatedAt = time.Now()
	return nil
}

// RenderPreview 把当前简历渲染为预览用的 HTML。
func (s *ResumeService) RenderPreview() (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.current == nil {
		log.Error("[resume_service] no resume loaded")
		return "", fmt.Errorf("no resume loaded")
	}
	return s.renderer.Render(s.current)
}

// AutoSave 把当前状态写回 SQLite。
//
// 仅在简历此前已被显式保存过（存在记录）时才生效，否则直接跳过——
// 以此防止用户未主动保存的草稿被意外持久化。
func (s *ResumeService) AutoSave() error {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.current == nil || s.currentID == "" || !s.persisted {
		log.Debug("[resume_service] AutoSave skipped: not persisted (currentID=%q, persisted=%v)", s.currentID, s.persisted)
		return nil
	}

	if err := s.resumeRepo.Update(s.currentID, s.current); err != nil {
		log.Error("[resume_service] auto save resume: %v", err)
		return util.UserWrap(err, "自动保存失败")
	}
	log.Info("[resume_service] AutoSave: updated id=%s", s.currentID)
	return nil
}

// UpdateResumeMeta 更新简历所用的模板 ID（仅改内存态，不写库）。
func (s *ResumeService) UpdateResumeMeta(templateID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.current == nil {
		log.Error("[resume_service] no resume loaded")
		return util.UserMsg("未加载简历")
	}

	s.current.Meta.TemplateID = templateID
	s.current.Meta.UpdatedAt = time.Now()
	return nil
}

// ListResumes 返回未删除的简历列表，按 updated_at 倒序。
func (s *ResumeService) ListResumes() ([]repo.ResumeListItem, error) {
	return s.resumeRepo.List()
}

// LoadResume 按 ID 加载简历，并将其设为当前简历（视为已持久化）。
func (s *ResumeService) LoadResume(id string) (*model.Resume, error) {
	resume, err := s.resumeRepo.GetByID(id)
	if err != nil {
		return nil, util.UserWrap(err, "加载简历失败")
	}

	s.mu.Lock()
	s.current = resume
	s.currentID = id
	s.persisted = true
	s.mu.Unlock()

	return resume, nil
}

// ExplicitSave 是唯一对外暴露的持久化入口。
//
// 仅由前端在用户显式保存（Ctrl+S 或保存按钮）时调用；真正的写库逻辑位于
// 未导出的 saveResume，前端无法通过 Wails 绑定直接触达。
func (s *ResumeService) ExplicitSave() error {
	log.Info("[resume_service] ExplicitSave: user-initiated save")
	return s.saveResume()
}

// saveResume 把当前简历持久化到 SQLite。
//
// 首次保存创建新记录，后续保存更新已有记录。
// 该方法为未导出方法，前端无法直接调用。
func (s *ResumeService) saveResume() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.current == nil {
		return util.UserMsg("未加载简历")
	}

	s.current.Meta.UpdatedAt = time.Now()

	if s.currentID == "" {
		log.Info("[resume_service] saveResume: CREATING new resume (first persist)")
		id, err := s.resumeRepo.Create(s.current)
		if err != nil {
			return util.UserWrap(err, "创建简历失败")
		}
		s.currentID = id
		s.persisted = true
		log.Info("[resume_service] saveResume: created id=%s", id)
		return nil
	}

	log.Info("[resume_service] saveResume: UPDATING existing id=%s", s.currentID)
	s.persisted = true
	return s.resumeRepo.Update(s.currentID, s.current)
}

// GetResumeByID 按 ID 读取简历，不影响当前简历状态。
// 返回原始简历数据，供前端自行渲染。
func (s *ResumeService) GetResumeByID(id string) (*model.Resume, error) {
	return s.resumeRepo.GetByID(id)
}

// DeleteResume 按 ID 软删除简历。
// 若删除的正是当前简历，则同时清空内存态与身份信息。
func (s *ResumeService) DeleteResume(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.currentID == id {
		s.current = nil
		s.currentID = ""
		s.persisted = false
	}

	return s.resumeRepo.SoftDelete(id)
}
