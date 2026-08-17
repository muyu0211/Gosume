package repo

import (
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"gosume/pkg/log"
	"gosume/pkg/resume/template"

	"github.com/fsnotify/fsnotify"
)

// TemplateRepo 基于 SQLite 管理模板的持久化（内置模板 + 用户模板）。
type TemplateRepo struct {
	db *sql.DB
}

// NewTemplateStore 创建 templates 表，并把 builtinFS 中的内置模板同步入库。
// builtinFS 为 nil 时跳过同步。
func NewTemplateStore(db *sql.DB, builtinFS fs.FS) (*TemplateRepo, error) {
	s := &TemplateRepo{db: db}
	if err := s.initSchema(); err != nil {
		return nil, fmt.Errorf("init template schema: %w", err)
	}

	if builtinFS != nil {
		if err := s.syncBuiltins(builtinFS); err != nil {
			return nil, fmt.Errorf("sync builtins: %w", err)
		}
	}

	log.Info("[template_store] init template store success")
	return s, nil
}

// Reopen 切换到新的数据库连接并重新同步内置模板，用于数据目录热切换。
func (s *TemplateRepo) Reopen(db *sql.DB, builtinFS fs.FS) error {
	s.db = db
	if err := s.initSchema(); err != nil {
		return fmt.Errorf("init template schema: %w", err)
	}
	if builtinFS != nil {
		if err := s.syncBuiltins(builtinFS); err != nil {
			return fmt.Errorf("sync builtins: %w", err)
		}
	}
	log.Info("[template_store] reopened template store")
	return nil
}

// initSchema 在表不存在时创建 templates 表及其索引。
func (s *TemplateRepo) initSchema() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS templates (
			id              TEXT PRIMARY KEY,
			meta            TEXT NOT NULL DEFAULT '{}',
			html            TEXT NOT NULL DEFAULT '',
			css             TEXT NOT NULL DEFAULT '',
			is_builtin      INTEGER NOT NULL DEFAULT 0,
			builtin_version TEXT NOT NULL DEFAULT '',
			created_at      TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
			is_deleted      INTEGER NOT NULL DEFAULT 0
		);
		CREATE INDEX IF NOT EXISTS idx_templates_builtin ON templates(is_builtin);
	`)
	return err
}

// syncBuiltins 把 builtinFS 中的内置模板同步入库。
//
// 以内容哈希（css + meta）判断是否有变更：库中无记录时插入；哈希变化或此前
// 被软删除时更新并恢复。单个模板解析失败仅告警跳过，不中断整体同步。
func (s *TemplateRepo) syncBuiltins(builtinFS fs.FS) error {
	entries, err := fs.ReadDir(builtinFS, "templates")
	if err != nil {
		return fmt.Errorf("read builtin templates dir: %w", err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		dirName := entry.Name()
		prefix := path.Join("templates", dirName)

		metaData, err := fs.ReadFile(builtinFS, path.Join(prefix, "template.json"))
		if err != nil {
			log.Warn("[template_store] skip %s: read template.json: %v", dirName, err)
			continue
		}

		var meta template.Meta
		if err := json.Unmarshal(metaData, &meta); err != nil {
			log.Warn("[template_store] skip %s: parse template.json: %v", dirName, err)
			continue
		}

		tmplID := meta.ID
		if tmplID == "" {
			log.Warn("[template_store] skip %s: empty id in template.json", dirName)
			continue
		}

		// Gosume 一期改造：内置模板不再读入/存储 HTML（统一 HTML 由应用内置）。
		cssData, _ := fs.ReadFile(builtinFS, path.Join(prefix, "styles.css"))

		metaJSON, err := json.Marshal(meta)
		if err != nil {
			return fmt.Errorf("marshal meta for %s: %w", tmplID, err)
		}

		contentHash := hashContent(cssData, metaJSON)

		var storedHash string
		var isDeleted int
		err = s.db.QueryRow(
			`SELECT builtin_version, is_deleted FROM templates WHERE id=? AND is_builtin=1`,
			tmplID,
		).Scan(&storedHash, &isDeleted)

		if err == sql.ErrNoRows {
			now := time.Now().UTC().Format(time.RFC3339)
			_, err = s.db.Exec(
				`INSERT INTO templates (id, meta, css, is_builtin, builtin_version, created_at, updated_at)
				 VALUES (?, ?, ?, 1, ?, ?, ?)`,
				tmplID, string(metaJSON), string(cssData), contentHash, now, now,
			)
			if err != nil {
				log.Error("[template_store] insert builtin %s: %v", tmplID, err)
			} else {
				log.Info("[template_store] inserted builtin template: %s (hash: %s)", tmplID, contentHash[:8])
			}
		} else if err != nil {
			log.Error("[template_store] query builtin %s: %v", tmplID, err)
		} else if storedHash != contentHash || isDeleted == 1 {
			now := time.Now().UTC().Format(time.RFC3339)
			_, err = s.db.Exec(
				`UPDATE templates SET meta=?, css=?, builtin_version=?, updated_at=?, is_deleted=0
				 WHERE id=? AND is_builtin=1`,
				string(metaJSON), string(cssData), contentHash, now, tmplID,
			)
			if err != nil {
				log.Error("[template_store] update builtin %s: %v", tmplID, err)
			} else {
				log.Info("[template_store] updated builtin template: %s (hash: %s)", tmplID, contentHash[:8])
			}
		}
	}

	return nil
}

// TemplateRow 是模板在数据库中的原始行表示。
type TemplateRow struct {
	ID             string
	Meta           string
	HTML           string
	CSS            string
	IsBuiltin      bool
	BuiltinVersion string
	CreatedAt      string
	UpdatedAt      string
}

// ListAll 返回所有未删除的模板，内置模板优先、其后按 ID 升序。
// 单条 meta 解析失败仅告警跳过，不影响其余模板。
func (s *TemplateRepo) ListAll() ([]*template.Template, error) {
	rows, err := s.db.Query(
		`SELECT id, meta, html, css, is_builtin FROM templates WHERE is_deleted=0 ORDER BY is_builtin DESC, id ASC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list templates: %w", err)
	}
	defer rows.Close()

	var templates []*template.Template
	for rows.Next() {
		var id, metaJSON, html, css string
		var isBuiltin int
		if err := rows.Scan(&id, &metaJSON, &html, &css, &isBuiltin); err != nil {
			return nil, fmt.Errorf("scan template row: %w", err)
		}

		var meta template.Meta
		if err := json.Unmarshal([]byte(metaJSON), &meta); err != nil {
			log.Warn("[template_store] unmarshal meta for %s: %v", id, err)
			continue
		}

		templates = append(templates, &template.Template{
			Meta:      meta,
			HTML:      html,
			CSS:       css,
			IsBuiltin: isBuiltin == 1,
		})
	}

	return templates, rows.Err()
}

// GetByID 按 ID 查询单个模板；不存在时返回 TEMPLATE_NOT_FOUND 错误。
func (s *TemplateRepo) GetByID(id string) (*template.Template, error) {
	var metaJSON, html, css string
	var isBuiltin int
	err := s.db.QueryRow(
		`SELECT meta, html, css, is_builtin FROM templates WHERE id=? AND is_deleted=0`,
		id,
	).Scan(&metaJSON, &html, &css, &isBuiltin)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, &template.Error{Code: "TEMPLATE_NOT_FOUND", Message: "template not found: " + id}
		}
		return nil, fmt.Errorf("query template: %w", err)
	}

	var meta template.Meta
	if err := json.Unmarshal([]byte(metaJSON), &meta); err != nil {
		return nil, fmt.Errorf("unmarshal meta: %w", err)
	}

	return &template.Template{
		Meta:      meta,
		HTML:      html,
		CSS:       css,
		IsBuiltin: isBuiltin == 1,
	}, nil
}

// Create 插入一个用户模板。
// Gosume 一期改造：不再接收 HTML，模板只保存 meta + css。
func (s *TemplateRepo) Create(meta template.Meta, css string) error {
	metaJSON, err := json.Marshal(meta)
	if err != nil {
		return fmt.Errorf("marshal meta: %w", err)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err = s.db.Exec(
		`INSERT INTO templates (id, meta, css, is_builtin, created_at, updated_at)
		 VALUES (?, ?, ?, 0, ?, ?)`,
		meta.ID, string(metaJSON), css, now, now,
	)
	if err != nil {
		return fmt.Errorf("insert template: %w", err)
	}
	log.Info("[template_store] created user template: %s", meta.ID)
	return nil
}

// Update 修改用户模板；内置模板不可修改，命中 0 行时返回 TEMPLATE_NOT_FOUND。
func (s *TemplateRepo) Update(id string, meta template.Meta, css string) error {
	metaJSON, err := json.Marshal(meta)
	if err != nil {
		return fmt.Errorf("marshal meta: %w", err)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	result, err := s.db.Exec(
		`UPDATE templates SET meta=?, css=?, updated_at=? WHERE id=? AND is_builtin=0 AND is_deleted=0`,
		string(metaJSON), css, now, id,
	)
	if err != nil {
		return fmt.Errorf("update template: %w", err)
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return &template.Error{Code: "TEMPLATE_NOT_FOUND", Message: "template not found or is built-in: " + id}
	}
	log.Info("[template_store] updated user template: %s", id)
	return nil
}

// SoftDelete 软删除用户模板；内置模板不可删除，命中 0 行时返回 TEMPLATE_NOT_FOUND。
func (s *TemplateRepo) SoftDelete(id string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	result, err := s.db.Exec(
		`UPDATE templates SET is_deleted=1, updated_at=? WHERE id=? AND is_builtin=0 AND is_deleted=0`,
		now, id,
	)
	if err != nil {
		return fmt.Errorf("delete template: %w", err)
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return &template.Error{Code: "TEMPLATE_NOT_FOUND", Message: "template not found or is built-in: " + id}
	}
	log.Info("[template_store] deleted user template: %s", id)
	return nil
}

// ImportFromFilesystem 从目录导入历史的文件式模板，返回成功导入的数量。
// 已存在于库中的 ID 会被跳过；目录不存在时返回 (0, nil)。
func (s *TemplateRepo) ImportFromFilesystem(dir string) (int, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0, nil
	}

	imported := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		tmplDir := entry.Name()
		metaPath := filepath.Join(dir, tmplDir, "template.json")
		cssPath := filepath.Join(dir, tmplDir, "styles.css")

		metaData, err := os.ReadFile(metaPath)
		if err != nil {
			continue
		}

		var meta template.Meta
		if err := json.Unmarshal(metaData, &meta); err != nil {
			continue
		}

		// 库中已存在则跳过
		existing, _ := s.GetByID(meta.ID)
		if existing != nil {
			continue
		}

		cssData, _ := os.ReadFile(cssPath)

		if err := s.Create(meta, string(cssData)); err != nil {
			log.Warn("[template_store] import %s: %v", meta.ID, err)
			continue
		}
		imported++
	}

	return imported, nil
}

// ReloadFromDir 从文件系统目录读取模板并 upsert 入库。
// 不区分 is_builtin 一律覆盖，仅用于开发期热重载。
func (s *TemplateRepo) ReloadFromDir(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		tmplDir := entry.Name()
		metaPath := filepath.Join(dir, tmplDir, "template.json")
		cssPath := filepath.Join(dir, tmplDir, "styles.css")

		metaData, err := os.ReadFile(metaPath)
		if err != nil {
			continue
		}

		var meta template.Meta
		if err := json.Unmarshal(metaData, &meta); err != nil {
			continue
		}

		cssData, _ := os.ReadFile(cssPath)

		metaJSON, err := json.Marshal(meta)
		if err != nil {
			continue
		}

		now := time.Now().UTC().Format(time.RFC3339)

		result, err := s.db.Exec(
			`UPDATE templates SET meta=?, css=?, updated_at=? WHERE id=?`,
			string(metaJSON), string(cssData), now, meta.ID,
		)
		if err != nil {
			log.Warn("[template_store] reload update %s: %v", meta.ID, err)
			continue
		}

		n, _ := result.RowsAffected()
		if n == 0 {
			_, err = s.db.Exec(
				`INSERT INTO templates (id, meta, css, is_builtin, created_at, updated_at)
				 VALUES (?, ?, ?, 1, ?, ?)`,
				meta.ID, string(metaJSON), string(cssData), now, now,
			)
			if err != nil {
				log.Warn("[template_store] reload insert %s: %v", meta.ID, err)
			}
		}
	}

	log.Info("[template_store] hot-reload complete from %s", dir)
	return nil
}

// WatchDir 监听模板目录的文件变化并自动热重载。
//
// 监听在独立 goroutine 中运行；返回的 stop 通道被 close 时停止监听。
// 仅 .html/.css/.json 的写入与创建事件会触发重载，并做 300ms 防抖。
func (s *TemplateRepo) WatchDir(dir string) (chan struct{}, error) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, fmt.Errorf("create watcher: %w", err)
	}

	// 同时监听根目录与各子目录
	if err := watcher.Add(dir); err != nil {
		watcher.Close()
		return nil, fmt.Errorf("watch %s: %w", dir, err)
	}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if e.IsDir() {
			watcher.Add(filepath.Join(dir, e.Name()))
		}
	}

	stop := make(chan struct{})
	go func() {
		defer watcher.Close()
		timer := time.NewTimer(0)
		if !timer.Stop() {
			<-timer.C
		}

		for {
			select {
			case <-stop:
				return
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}
				// 仅模板相关文件的变更才触发
				name := filepath.Base(event.Name)
				if !strings.HasSuffix(name, ".html") && !strings.HasSuffix(name, ".css") && !strings.HasSuffix(name, ".json") {
					continue
				}
				if event.Op&(fsnotify.Write|fsnotify.Create) == 0 {
					continue
				}
				// 防抖：每次事件重置定时器，静默 300ms 后才真正重载
				timer.Reset(300 * time.Millisecond)
			case <-timer.C:
				if err := s.ReloadFromDir(dir); err != nil {
					log.Warn("[template_store] watch reload: %v", err)
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				log.Warn("[template_store] watcher error: %v", err)
			}
		}
	}()

	log.Info("[template_store] watching %s for template changes", dir)
	return stop, nil
}

// hashContent 计算内置模板内容哈希（Gosume 一期改造：只包含 css + meta，
// 不再包含 html —— 模板变更以样式/元数据为准）。
func hashContent(css, metaJSON []byte) string {
	h := sha256.New()
	h.Write(css)
	h.Write(css)
	h.Write(metaJSON)
	return fmt.Sprintf("%x", h.Sum(nil))
}
