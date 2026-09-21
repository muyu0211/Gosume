package repo

import (
	"database/sql"
	"encoding/json"
	"fmt"
	recruitmodel "gosume/pkg/recruit/model"
	"time"

	"github.com/google/uuid"
)

// JobRepo 管理求职进程条目（job_process）。
// 排序、指纹判定、分区等业务语义在 service 层（前端 grouping 与 Mock 行为为准）。
type JobRepo struct {
	db *sql.DB
}

// NewJobRepo 复用共享数据库连接并初始化表结构。
func NewJobRepo(db *sql.DB) (*JobRepo, error) {
	r := &JobRepo{db: db}
	if err := r.initSchema(); err != nil {
		return nil, fmt.Errorf("init job_process: %w", err)
	}
	return r, nil
}

// Reopen 重新指向数据库连接（数据目录热切换）。
func (r *JobRepo) Reopen(db *sql.DB) error {
	r.db = db
	return r.initSchema()
}

func (r *JobRepo) initSchema() error {
	// ⚠ 新表不再建 kind 列；旧库已有的 kind 列与 idx_job_kind 索引保留不动
	// （本仓库代码不再读写，避免 DROP COLUMN 迁移风险）。
	_, err := r.db.Exec(`
		CREATE TABLE IF NOT EXISTS job_process (
			id            TEXT PRIMARY KEY,
			company       TEXT NOT NULL DEFAULT '',
			company_norm  TEXT NOT NULL DEFAULT '',
			company_id    TEXT,
			parent_id     TEXT,
			position      TEXT NOT NULL DEFAULT '',
			stage         TEXT NOT NULL DEFAULT 'other',
			round_no      INTEGER NOT NULL DEFAULT 0,
			event_time    TEXT,
			event_end     TEXT,
			deadline      TEXT,
			all_day       INTEGER NOT NULL DEFAULT 0,
			time_basis    TEXT,
			link          TEXT NOT NULL DEFAULT '',
			location      TEXT NOT NULL DEFAULT '',
			online        INTEGER NOT NULL DEFAULT 0,
			source        TEXT NOT NULL DEFAULT 'manual',
			status        TEXT NOT NULL DEFAULT 'pending',
			note          TEXT NOT NULL DEFAULT '',
			raw_text      TEXT,
			confidence    TEXT NOT NULL DEFAULT '{}',
			created_at    TEXT NOT NULL,
			updated_at    TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_job_arrive  ON job_process(COALESCE(event_time, deadline));
		CREATE INDEX IF NOT EXISTS idx_job_status  ON job_process(status);
		CREATE INDEX IF NOT EXISTS idx_job_company ON job_process(company_norm);
		CREATE INDEX IF NOT EXISTS idx_job_parent  ON job_process(parent_id);
		CREATE INDEX IF NOT EXISTS idx_job_comp    ON job_process(company_id);
		CREATE INDEX IF NOT EXISTS idx_job_updated ON job_process(updated_at DESC);
	`)
	return err
}

const jobCols = `id, company, company_norm, company_id, parent_id, position, stage, round_no,
	event_time, event_end, deadline, all_day, time_basis, link, location, online, source, status, note,
	raw_text, confidence, created_at, updated_at`

// scanJob 把一行扫描为 JobProcess；可空列经 COALESCE 归一为 NULL 语义。
func scanJob(scan func(...any) error) (recruitmodel.JobProcess, error) {
	var j recruitmodel.JobProcess
	var companyID, parentID, eventTime, eventEnd, deadline, timeBasis, rawText sql.NullString
	var allDay, online int
	var conf string
	if err := scan(&j.ID, &j.Company, &j.CompanyNorm, &companyID, &parentID, &j.Position, &j.Stage, &j.RoundNo,
		&eventTime, &eventEnd, &deadline, &allDay, &timeBasis, &j.Link, &j.Location, &online, &j.Source, &j.Status, &j.Note,
		&rawText, &conf, &j.CreatedAt, &j.UpdatedAt); err != nil {
		return j, err
	}
	if companyID.Valid {
		s := companyID.String
		j.CompanyID = &s
	}
	if parentID.Valid {
		s := parentID.String
		j.ParentID = &s
	}
	if eventTime.Valid {
		s := eventTime.String
		j.EventTime = &s
	}
	if eventEnd.Valid {
		s := eventEnd.String
		j.EventEnd = &s
	}
	if deadline.Valid {
		s := deadline.String
		j.Deadline = &s
	}
	if timeBasis.Valid {
		s := timeBasis.String
		j.TimeBasis = &s
	}
	if rawText.Valid {
		s := rawText.String
		j.RawText = &s
	}
	j.AllDay = allDay != 0
	j.Online = online != 0
	j.Confidence = map[string]string{}
	if conf != "" {
		_ = json.Unmarshal([]byte(conf), &j.Confidence) // 脏数据降级为空表，不抛错
	}
	return j, nil
}

// List 返回全量条目（按 updated_at 降序，与 Mock 一致）。
func (r *JobRepo) List() ([]recruitmodel.JobProcess, error) {
	rows, err := r.db.Query(`SELECT ` + jobCols + ` FROM job_process ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []recruitmodel.JobProcess{}
	for rows.Next() {
		j, err := scanJob(rows.Scan)
		if err != nil {
			return nil, err
		}
		out = append(out, j)
	}
	return out, rows.Err()
}

// Get 按 id 取单条；不存在返回 nil。
func (r *JobRepo) Get(id string) (*recruitmodel.JobProcess, error) {
	row := r.db.QueryRow(`SELECT `+jobCols+` FROM job_process WHERE id = ?`, id)
	j, err := scanJob(row.Scan)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &j, nil
}

// Create 插入条目（id/created_at/updated_at 为空时由后端生成）。
func (r *JobRepo) Create(j *recruitmodel.JobProcess) error {
	now := time.Now().Format(time.RFC3339)
	if j.ID == "" {
		j.ID = uuid.NewString()
	}
	j.CreatedAt = now
	j.UpdatedAt = now
	conf, _ := json.Marshal(j.Confidence)
	_, err := r.db.Exec(`INSERT INTO job_process (`+jobCols+`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		j.ID, j.Company, j.CompanyNorm, j.CompanyID, j.ParentID, j.Position, j.Stage, j.RoundNo,
		j.EventTime, j.EventEnd, j.Deadline, j.AllDay, j.TimeBasis, j.Link, j.Location, j.Online, j.Source, j.Status, j.Note,
		j.RawText, string(conf), j.CreatedAt, j.UpdatedAt)
	return err
}

// Update 全量更新（updated_at 刷新）；条目不存在返回错误。
func (r *JobRepo) Update(j *recruitmodel.JobProcess) error {
	j.UpdatedAt = time.Now().Format(time.RFC3339)
	conf, _ := json.Marshal(j.Confidence)
	res, err := r.db.Exec(`UPDATE job_process SET company = ?, company_norm = ?, company_id = ?, parent_id = ?, position = ?, stage = ?, round_no = ?,
		event_time = ?, event_end = ?, deadline = ?, all_day = ?, time_basis = ?, link = ?, location = ?, online = ?, source = ?, status = ?, note = ?,
		raw_text = ?, confidence = ?, updated_at = ? WHERE id = ?`,
		j.Company, j.CompanyNorm, j.CompanyID, j.ParentID, j.Position, j.Stage, j.RoundNo,
		j.EventTime, j.EventEnd, j.Deadline, j.AllDay, j.TimeBasis, j.Link, j.Location, j.Online, j.Source, j.Status, j.Note,
		j.RawText, string(conf), j.UpdatedAt, j.ID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("条目不存在")
	}
	return nil
}

// Delete 物理删除单条。
func (r *JobRepo) Delete(id string) error {
	_, err := r.db.Exec(`DELETE FROM job_process WHERE id = ?`, id)
	return err
}

// ClearParent 解除某 apply 下全部子通知的关联，返回解除条数。
func (r *JobRepo) ClearParent(parentID string) (int64, error) {
	res, err := r.db.Exec(`UPDATE job_process SET parent_id = NULL WHERE parent_id = ?`, parentID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// DeleteByParent 级联删除某 apply 下全部子通知，返回删除条数。
func (r *JobRepo) DeleteByParent(parentID string) (int64, error) {
	res, err := r.db.Exec(`DELETE FROM job_process WHERE parent_id = ?`, parentID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// SetStatus 更新状态（updated_at 刷新）。
func (r *JobRepo) SetStatus(id, status string) error {
	res, err := r.db.Exec(`UPDATE job_process SET status = ?, updated_at = ? WHERE id = ?`, status, time.Now().Format(time.RFC3339), id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("条目不存在")
	}
	return nil
}

// CountByCompany 统计归属某公司的条目数（norm 或 company_id 命中其一即可）。
func (r *JobRepo) CountByCompany(norm, companyID string) (int, error) {
	var n int
	err := r.db.QueryRow(`SELECT COUNT(*) FROM job_process WHERE company_norm = ? OR company_id = ?`, norm, companyID).Scan(&n)
	return n, err
}
