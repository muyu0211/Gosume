package repo

import (
	"database/sql"
	"fmt"
	"gosume/pkg/log"
)

// JobSettings 求职进程模块设置（PRD：job_settings 表）。
// JSON 字段名与前端 types/recruit.ts 的 JobSettings 对齐。
type JobSettings struct {
	NearThresholdHours int  `json:"nearThresholdHours"`
	SaveRawText        bool `json:"saveRawText"`
}

// DefaultJobSettings 首次使用（表为空）时的默认值。
var DefaultJobSettings = JobSettings{NearThresholdHours: 48, SaveRawText: false}

// SettingsRepo 基于共享 gosume.db 连接管理 job_settings 单行表。
// 单行约束（id = 1）由表定义保证，读写都只针对这一行。
type SettingsRepo struct {
	db *sql.DB
}

// NewSettingsRepo 复用已有数据库连接并初始化表结构。
func NewSettingsRepo(db *sql.DB) (*SettingsRepo, error) {
	r := &SettingsRepo{db: db}
	if err := r.initSchema(); err != nil {
		return nil, fmt.Errorf("init job_settings: %w", err)
	}
	log.Infof("[settings_repo] init job_settings success")
	return r, nil
}

// initSchema 在表不存在时创建 job_settings 单行表。
func (r *SettingsRepo) initSchema() error {
	_, err := r.db.Exec(`
		CREATE TABLE IF NOT EXISTS job_settings (
			id                   INTEGER PRIMARY KEY CHECK (id = 1),
			near_threshold_hours INTEGER NOT NULL DEFAULT 48,
			save_raw_text        INTEGER NOT NULL DEFAULT 0
		);
	`)
	return err
}

// Get 读取设置；表为空（首次使用）或读取失败时返回默认值。
func (r *SettingsRepo) Get() JobSettings {
	var s JobSettings
	var raw int
	err := r.db.QueryRow(`SELECT near_threshold_hours, save_raw_text FROM job_settings WHERE id = 1`).
		Scan(&s.NearThresholdHours, &raw)
	if err != nil {
		if err != sql.ErrNoRows {
			log.Errorf("[settings_repo] get job settings: %v", err)
		}
		return DefaultJobSettings
	}
	s.SaveRawText = raw != 0
	return s
}

// Save 覆盖写入设置（单行 UPSERT）。
func (r *SettingsRepo) Save(s JobSettings) error {
	raw := 0
	if s.SaveRawText {
		raw = 1
	}
	_, err := r.db.Exec(`
		INSERT INTO job_settings (id, near_threshold_hours, save_raw_text) VALUES (1, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			near_threshold_hours = excluded.near_threshold_hours,
			save_raw_text        = excluded.save_raw_text
	`, s.NearThresholdHours, raw)
	if err != nil {
		return fmt.Errorf("save job settings: %w", err)
	}
	return nil
}
