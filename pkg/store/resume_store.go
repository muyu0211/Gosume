package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"gosume/pkg/log"
	"path/filepath"
	"time"

	"gosume/pkg/model"

	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

// ResumeListItem is a lightweight summary of a resume row.
type ResumeListItem struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	TemplateID string    `json:"template_id"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// ResumeStore manages resume persistence via SQLite.
type ResumeStore struct {
	db *sql.DB
}

// NewResumeStore opens or creates the SQLite database at {dataDir}/gosume.db.
func NewResumeStore(dataDir string) (*ResumeStore, error) {
	dbPath := filepath.Join(dataDir, "gosume.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	// 设置sqlite3参数
	pragmas := []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA foreign_keys=ON",
		"PRAGMA busy_timeout=5000",
	}
	for _, p := range pragmas {
		if _, err := db.Exec(p); err != nil {
			log.Error("[resume_store] pragma %s error: %v", p, err)
			return nil, fmt.Errorf("pragma %s: %w", p, err)
		}
	}

	// 初始化存储层
	store := &ResumeStore{db: db}
	if err := store.initSchema(); err != nil {
		db.Close()
		log.Error("[resume_store] init schema error: %v", err)
		return nil, fmt.Errorf("init schema: %w", err)
	}

	log.Info("[resume_store] init resume store success")
	return store, nil
}

// Close closes the database.
func (s *ResumeStore) Close() error {
	return s.db.Close()
}

// initSchema creates the resumes table if it doesn't exist.
func (s *ResumeStore) initSchema() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS resumes (
			id           TEXT PRIMARY KEY,
			name         TEXT NOT NULL DEFAULT '',
			template_id  TEXT NOT NULL DEFAULT '',
			data         TEXT NOT NULL DEFAULT '{}',
			created_at   TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
			is_deleted   INTEGER NOT NULL DEFAULT 0
		);
		CREATE INDEX IF NOT EXISTS idx_resumes_updated ON resumes(updated_at DESC);
	`)
	return err
}

// nameFromResume returns the name to use for a resume.
func (s *ResumeStore) nameFromResume(resume *model.Resume) string {
	if resume.Meta.Name != "" {
		return resume.Meta.Name
	}
	if resume.Personal.FullName != "" {
		return resume.Personal.FullName
	}
	return "未命名简历"
}

// Create inserts a new resume row and returns the generated UUID.
func (s *ResumeStore) Create(resume *model.Resume) (string, error) {
	id := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)

	data, err := json.Marshal(resume)
	if err != nil {
		return "", fmt.Errorf("marshal resume: %w", err)
	}

	name := s.nameFromResume(resume)

	_, err = s.db.Exec(
		`INSERT INTO resumes (id, name, template_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		id, name, resume.Meta.TemplateID, string(data), now, now,
	)
	if err != nil {
		return "", fmt.Errorf("insert resume: %w", err)
	}

	log.Info("[resume_store] DB INSERT: id=%s name=%q template=%s", id, name, resume.Meta.TemplateID)
	return id, nil
}

// Update overwrites the data, name, template_id, and updated_at for an existing resume.
func (s *ResumeStore) Update(id string, resume *model.Resume) error {
	data, err := json.Marshal(resume)
	if err != nil {
		return fmt.Errorf("marshal resume: %w", err)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	name := s.nameFromResume(resume)

	result, err := s.db.Exec(
		`UPDATE resumes SET data=?, name=?, template_id=?, updated_at=? WHERE id=? AND is_deleted=0`,
		string(data), name, resume.Meta.TemplateID, now, id,
	)
	if err != nil {
		return fmt.Errorf("update resume: %w", err)
	}

	n, _ := result.RowsAffected()
	if n == 0 {
		return fmt.Errorf("resume %s not found", id)
	}
	log.Info("[resume_store] update resume success, id: %s", id)
	return nil
}

// GetByID loads the full resume from the data column.
func (s *ResumeStore) GetByID(id string) (*model.Resume, error) {
	var raw string
	err := s.db.QueryRow(
		`SELECT data FROM resumes WHERE id=? AND is_deleted=0`, id,
	).Scan(&raw)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("resume %s not found", id)
		}
		return nil, fmt.Errorf("query resume: %w", err)
	}

	return model.Migrate([]byte(raw))
}

// List returns all non-deleted resumes ordered by updated_at descending.
func (s *ResumeStore) List() ([]ResumeListItem, error) {
	rows, err := s.db.Query(
		`SELECT id, name, template_id, updated_at FROM resumes WHERE is_deleted=0 ORDER BY updated_at DESC LIMIT 100`,
	)
	if err != nil {
		return nil, fmt.Errorf("list resumes: %w", err)
	}
	defer rows.Close()

	var items []ResumeListItem
	for rows.Next() {
		var item ResumeListItem
		var updatedAt string
		if err := rows.Scan(&item.ID, &item.Name, &item.TemplateID, &updatedAt); err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}
		item.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)
		items = append(items, item)
	}

	return items, rows.Err()
}

// SoftDelete marks a resume as deleted.
func (s *ResumeStore) SoftDelete(id string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	result, err := s.db.Exec(
		`UPDATE resumes SET is_deleted=1, updated_at=? WHERE id=? AND is_deleted=0`,
		now, id,
	)
	if err != nil {
		return fmt.Errorf("delete resume: %w", err)
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return fmt.Errorf("resume %s not found", id)
	}
	return nil
}

// Reopen closes the current database and opens a new one at the given data directory.
func (s *ResumeStore) Reopen(dataDir string) error {
	if s.db != nil {
		if err := s.db.Close(); err != nil {
			log.Error("[resume_store] close old db: %v", err)
		}
	}

	dbPath := filepath.Join(dataDir, "gosume.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return fmt.Errorf("open sqlite: %w", err)
	}

	pragmas := []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA foreign_keys=ON",
		"PRAGMA busy_timeout=5000",
	}
	for _, p := range pragmas {
		if _, err := db.Exec(p); err != nil {
			db.Close()
			return fmt.Errorf("pragma %s: %w", p, err)
		}
	}

	s.db = db
	if err := s.initSchema(); err != nil {
		db.Close()
		return fmt.Errorf("init schema: %w", err)
	}

	log.Info("[resume_store] reopened at %s", dataDir)
	return nil
}
