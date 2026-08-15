package service

import (
	"encoding/json"
	"fmt"
	"gosume/pkg/log"
	"sync"
	"time"

	"gosume/pkg/model"
	"gosume/pkg/render"
	"gosume/pkg/store"
)

// ResumeService manages the current resume data and preview rendering.
type ResumeService struct {
	store     *store.ResumeStore
	renderer  *render.HTMLRenderer
	current   *model.Resume
	currentID string
	persisted bool // true when current resume has been persisted to DB at least once
	mu        sync.RWMutex
}

// ServiceName returns the service name for Wails logging.
func (s *ResumeService) ServiceName() string {
	return "ResumeService"
}

// Inject sets up dependencies.
func (s *ResumeService) Inject(resumeStore *store.ResumeStore, renderer *render.HTMLRenderer) {
	s.store = resumeStore
	s.renderer = renderer
}

// NewResume creates a new blank resume in memory only.
// It does NOT persist to SQLite — persistence is deferred until ExplicitSave is called.
func (s *ResumeService) NewResume(templateID string, language string) (*model.Resume, error) {
	now := time.Now()
	resume := &model.Resume{
		Version: "1.0",
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

// GetResume returns the current resume data.
func (s *ResumeService) GetResume() *model.Resume {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.current
}

// GetCurrentID returns the UUID of the currently loaded resume.
func (s *ResumeService) GetCurrentID() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.currentID
}

// SetResume replaces the current resume in memory without persisting.
// It preserves currentID — use InitResume for new/separate resumes that need a fresh identity.
func (s *ResumeService) SetResume(resume *model.Resume) {
	s.mu.Lock()
	defer s.mu.Unlock()
	resume.Meta.UpdatedAt = time.Now()
	s.current = resume
}

// InitResume sets the current resume and resets identity so the next ExplicitSave
// creates a new DB row instead of overwriting an existing one.
// Use this when loading a resume from an external source (file, sample data, etc.)
// that should be treated as a brand-new resume in the database.
func (s *ResumeService) InitResume(resume *model.Resume) {
	s.mu.Lock()
	defer s.mu.Unlock()
	resume.Meta.UpdatedAt = time.Now()
	s.current = resume
	s.currentID = ""
	s.persisted = false
	log.Info("[resume_service] InitResume: identity reset (will create new row on save)")
}

// UpdateField updates a field in the current resume by path.
func (s *ResumeService) UpdateField(path string, value json.RawMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.current == nil {
		log.Error("[resume_service] no resume loaded")
		return UserMsg("未加载简历")
	}

	if err := model.SetFieldByPath(s.current, path, value); err != nil {
		log.Error("[resume_service] update field %s: %v", path, err)
		return UserWrap(err, "更新字段失败")
	}

	s.current.Meta.UpdatedAt = time.Now()
	return nil
}

// RenderPreview renders the current resume to HTML for preview.
func (s *ResumeService) RenderPreview() (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.current == nil {
		log.Error("[resume_service] no resume loaded")
		return "", fmt.Errorf("no resume loaded")
	}
	return s.renderer.Render(s.current)
}

// AutoSave saves the current state to SQLite.
func (s *ResumeService) AutoSave() error {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.current == nil || s.currentID == "" || !s.persisted {
		log.Debug("[resume_service] AutoSave skipped: not persisted (currentID=%q, persisted=%v)", s.currentID, s.persisted)
		return nil
	}

	if err := s.store.Update(s.currentID, s.current); err != nil {
		log.Error("[resume_service] auto save resume: %v", err)
		return UserWrap(err, "自动保存失败")
	}
	log.Info("[resume_service] AutoSave: updated id=%s", s.currentID)
	return nil
}

// UpdateResumeMeta updates template-related metadata and re-renders.
func (s *ResumeService) UpdateResumeMeta(templateID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.current == nil {
		log.Error("[resume_service] no resume loaded")
		return UserMsg("未加载简历")
	}

	s.current.Meta.TemplateID = templateID
	s.current.Meta.UpdatedAt = time.Now()
	return nil
}

// ListResumes returns all non-deleted resumes ordered by updated_at descending.
func (s *ResumeService) ListResumes() ([]store.ResumeListItem, error) {
	return s.store.List()
}

// LoadResume loads a resume by ID and sets it as the current resume.
func (s *ResumeService) LoadResume(id string) (*model.Resume, error) {
	resume, err := s.store.GetByID(id)
	if err != nil {
		return nil, UserWrap(err, "加载简历失败")
	}

	s.mu.Lock()
	s.current = resume
	s.currentID = id
	s.persisted = true
	s.mu.Unlock()

	return resume, nil
}

// ExplicitSave is the ONLY exported method that persists to SQLite.
// It is called exclusively from the frontend when the user explicitly saves (Ctrl+S or save button).
// The unexported saveResume is not reachable from the Wails frontend binding.
func (s *ResumeService) ExplicitSave() error {
	log.Info("[resume_service] ExplicitSave: user-initiated save")
	return s.saveResume()
}

// saveResume persists the current resume to SQLite.
// On first save it creates a new row; on subsequent saves it updates the existing row.
// This method is UNEXPORTED — it cannot be called from the Wails frontend.
func (s *ResumeService) saveResume() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.current == nil {
		return UserMsg("未加载简历")
	}

	s.current.Meta.UpdatedAt = time.Now()

	if s.currentID == "" {
		log.Info("[resume_service] saveResume: CREATING new resume (first persist)")
		id, err := s.store.Create(s.current)
		if err != nil {
			return UserWrap(err, "创建简历失败")
		}
		s.currentID = id
		s.persisted = true
		log.Info("[resume_service] saveResume: created id=%s", id)
		return nil
	}

	log.Info("[resume_service] saveResume: UPDATING existing id=%s", s.currentID)
	s.persisted = true
	return s.store.Update(s.currentID, s.current)
}

// GetResumeByID loads a resume by ID without affecting the current resume state.
// Returns the raw resume data for frontend rendering.
func (s *ResumeService) GetResumeByID(id string) (*model.Resume, error) {
	return s.store.GetByID(id)
}

// DeleteResume soft-deletes a resume by ID.
func (s *ResumeService) DeleteResume(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.currentID == id {
		s.current = nil
		s.currentID = ""
		s.persisted = false
	}

	return s.store.SoftDelete(id)
}
