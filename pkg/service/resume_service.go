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

// NewResume creates a new blank resume, persists it to SQLite, and returns it.
func (s *ResumeService) NewResume(templateID string, language string) (*model.Resume, error) {
	now := time.Now()
	resume := &model.Resume{
		Version: "1.0",
		Meta: model.ResumeMeta{
			TemplateID: templateID,
			Language:   language,
			FontSize:   10,
			PageMargin: "normal",
			CreatedAt:  now,
			UpdatedAt:  now,
		},
		Personal: model.Personal{},
	}

	id, err := s.store.Create(resume)
	if err != nil {
		return nil, fmt.Errorf("create resume: %w", err)
	}

	s.mu.Lock()
	s.current = resume
	s.currentID = id
	s.mu.Unlock()

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

// SetResume replaces the current resume and persists it to SQLite.
func (s *ResumeService) SetResume(resume *model.Resume) {
	s.mu.Lock()
	defer s.mu.Unlock()

	resume.Meta.UpdatedAt = time.Now()
	id, err := s.store.Create(resume)
	if err != nil {
		s.current = resume
		s.currentID = ""
		return
	}
	s.current = resume
	s.currentID = id
}

// UpdateField updates a field in the current resume by path.
func (s *ResumeService) UpdateField(path string, value json.RawMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.current == nil {
		log.Error("[resume_service] no resume loaded")
		return fmt.Errorf("no resume loaded")
	}

	if err := model.SetFieldByPath(s.current, path, value); err != nil {
		log.Error("[resume_service] update field %s: %v", path, err)
		return fmt.Errorf("update field %s: %w", path, err)
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

	if s.current == nil || s.currentID == "" {
		return nil
	}

	if err := s.store.Update(s.currentID, s.current); err != nil {
		log.Error("[resume_service] auto save resume: %v", err)
		return fmt.Errorf("auto save resume: %w", err)
	}
	return nil
}

// UpdateResumeMeta updates template-related metadata and re-renders.
func (s *ResumeService) UpdateResumeMeta(templateID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.current == nil {
		log.Error("[resume_service] no resume loaded")
		return fmt.Errorf("no resume loaded")
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
		return nil, fmt.Errorf("load resume: %w", err)
	}

	s.mu.Lock()
	s.current = resume
	s.currentID = id
	s.mu.Unlock()

	return resume, nil
}

// SaveResume persists the current resume to SQLite.
func (s *ResumeService) SaveResume() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.current == nil {
		return fmt.Errorf("no resume loaded")
	}
	if s.currentID == "" {
		return fmt.Errorf("no resume ID — call NewResume first")
	}

	s.current.Meta.UpdatedAt = time.Now()
	return s.store.Update(s.currentID, s.current)
}

// DeleteResume soft-deletes a resume by ID.
func (s *ResumeService) DeleteResume(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.currentID == id {
		s.current = nil
		s.currentID = ""
	}

	return s.store.SoftDelete(id)
}
