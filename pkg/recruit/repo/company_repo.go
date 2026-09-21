package repo

import (
	"database/sql"
	"fmt"
	"gosume/pkg/log"
	recruitmodel "gosume/pkg/recruit/model"
	"strings"
	"time"

	"github.com/google/uuid"
)

// CompanyRepo 管理公司档案（job_company，norm 唯一键）。
type CompanyRepo struct {
	db *sql.DB
}

// NewCompanyRepo 复用共享数据库连接并初始化表结构。
func NewCompanyRepo(db *sql.DB) (*CompanyRepo, error) {
	r := &CompanyRepo{db: db}
	if err := r.initSchema(); err != nil {
		return nil, fmt.Errorf("init job_company: %w", err)
	}
	return r, nil
}

// Reopen 重新指向数据库连接（数据目录热切换）。
func (r *CompanyRepo) Reopen(db *sql.DB) error {
	r.db = db
	return r.initSchema()
}

func (r *CompanyRepo) initSchema() error {
	_, err := r.db.Exec(`
		CREATE TABLE IF NOT EXISTS job_company (
			id         TEXT PRIMARY KEY,
			name       TEXT NOT NULL DEFAULT '',
			norm       TEXT NOT NULL UNIQUE,
			aliases    TEXT NOT NULL DEFAULT '[]',
			website    TEXT NOT NULL DEFAULT '',
			career_url TEXT NOT NULL DEFAULT '',
			contact    TEXT NOT NULL DEFAULT '',
			note       TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_job_company_norm ON job_company(norm);
	`)
	return err
}

// List 返回全部公司档案（按创建时间升序）。
func (r *CompanyRepo) List() ([]recruitmodel.JobCompany, error) {
	rows, err := r.db.Query(`SELECT id, name, norm, aliases, website, career_url, contact, note, created_at, updated_at FROM job_company ORDER BY created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []recruitmodel.JobCompany{}
	for rows.Next() {
		var c recruitmodel.JobCompany
		if err := rows.Scan(&c.ID, &c.Name, &c.Norm, &c.Aliases, &c.Website, &c.CareerURL, &c.Contact, &c.Note, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// Get 按 id 取单条；不存在返回 nil。
func (r *CompanyRepo) Get(id string) (*recruitmodel.JobCompany, error) {
	var c recruitmodel.JobCompany
	err := r.db.QueryRow(`SELECT id, name, norm, aliases, website, career_url, contact, note, created_at, updated_at FROM job_company WHERE id = ?`, id).
		Scan(&c.ID, &c.Name, &c.Norm, &c.Aliases, &c.Website, &c.CareerURL, &c.Contact, &c.Note, &c.CreatedAt, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// GetByNorm 按归一化名取单条；不存在返回 nil。
func (r *CompanyRepo) GetByNorm(norm string) (*recruitmodel.JobCompany, error) {
	if strings.TrimSpace(norm) == "" {
		return nil, nil
	}
	var c recruitmodel.JobCompany
	err := r.db.QueryRow(`SELECT id, name, norm, aliases, website, career_url, contact, note, created_at, updated_at FROM job_company WHERE norm = ?`, norm).
		Scan(&c.ID, &c.Name, &c.Norm, &c.Aliases, &c.Website, &c.CareerURL, &c.Contact, &c.Note, &c.CreatedAt, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// Save 新建（id 为空）或更新公司档案。
func (r *CompanyRepo) Save(c *recruitmodel.JobCompany) error {
	now := time.Now().Format(time.RFC3339)
	if c.ID == "" {
		c.ID = uuid.NewString()
		c.CreatedAt = now
		c.UpdatedAt = now
		_, err := r.db.Exec(`INSERT INTO job_company (id, name, norm, aliases, website, career_url, contact, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			c.ID, c.Name, c.Norm, c.Aliases, c.Website, c.CareerURL, c.Contact, c.Note, c.CreatedAt, c.UpdatedAt)
		return err
	}
	c.UpdatedAt = now
	res, err := r.db.Exec(`UPDATE job_company SET name = ?, norm = ?, aliases = ?, website = ?, career_url = ?, contact = ?, note = ?, updated_at = ? WHERE id = ?`,
		c.Name, c.Norm, c.Aliases, c.Website, c.CareerURL, c.Contact, c.Note, c.UpdatedAt, c.ID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("company not found: %s", c.ID)
	}
	return nil
}

// Delete 物理删除（调用方保证该公司下无条目）。
func (r *CompanyRepo) Delete(id string) error {
	_, err := r.db.Exec(`DELETE FROM job_company WHERE id = ?`, id)
	if err != nil {
		log.Errorf("[company_repo] delete %s: %v", id, err)
	}
	return err
}
