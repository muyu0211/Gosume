package store

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
	"gosume/pkg/template"

	"github.com/fsnotify/fsnotify"
)

// TemplateStore manages template persistence via SQLite.
type TemplateStore struct {
	db *sql.DB
}

// NewTemplateStore creates the templates table and syncs built-in templates from embedFS.
func NewTemplateStore(db *sql.DB, builtinFS fs.FS) (*TemplateStore, error) {
	s := &TemplateStore{db: db}
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

// Reopen re-syncs built-in templates against a new DB connection (used on data-dir change).
func (s *TemplateStore) Reopen(db *sql.DB, builtinFS fs.FS) error {
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

func (s *TemplateStore) initSchema() error {
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

// syncBuiltins syncs built-in templates from embedFS.
func (s *TemplateStore) syncBuiltins(builtinFS fs.FS) error {
	entries, err := fs.ReadDir(builtinFS, "templates")
	if err != nil {
		return fmt.Errorf("read builtin templates dir: %w", err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		tmplID := entry.Name()
		prefix := path.Join("templates", tmplID)

		metaData, err := fs.ReadFile(builtinFS, path.Join(prefix, "template.json"))
		if err != nil {
			log.Warn("[template_store] skip %s: read template.json: %v", tmplID, err)
			continue
		}

		var meta template.Meta
		if err := json.Unmarshal(metaData, &meta); err != nil {
			log.Warn("[template_store] skip %s: parse template.json: %v", tmplID, err)
			continue
		}

		htmlData, _ := fs.ReadFile(builtinFS, path.Join(prefix, "template.html"))
		cssData, _ := fs.ReadFile(builtinFS, path.Join(prefix, "styles.css"))

		metaJSON, err := json.Marshal(meta)
		if err != nil {
			return fmt.Errorf("marshal meta for %s: %w", tmplID, err)
		}

		contentHash := hashContent(htmlData, cssData, metaJSON)

		var storedHash string
		var isDeleted int
		err = s.db.QueryRow(
			`SELECT builtin_version, is_deleted FROM templates WHERE id=? AND is_builtin=1`,
			tmplID,
		).Scan(&storedHash, &isDeleted)

		if err == sql.ErrNoRows {
			now := time.Now().UTC().Format(time.RFC3339)
			_, err = s.db.Exec(
				`INSERT INTO templates (id, meta, html, css, is_builtin, builtin_version, created_at, updated_at)
				 VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
				tmplID, string(metaJSON), string(htmlData), string(cssData), contentHash, now, now,
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
				`UPDATE templates SET meta=?, html=?, css=?, builtin_version=?, updated_at=?, is_deleted=0
				 WHERE id=? AND is_builtin=1`,
				string(metaJSON), string(htmlData), string(cssData), contentHash, now, tmplID,
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

// TemplateRow is the raw database representation.
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

// ListAll returns all non-deleted templates.
func (s *TemplateStore) ListAll() ([]*template.Template, error) {
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

// GetByID returns a single template by ID.
func (s *TemplateStore) GetByID(id string) (*template.Template, error) {
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

// Create inserts a new user template.
func (s *TemplateStore) Create(meta template.Meta, html, css string) error {
	metaJSON, err := json.Marshal(meta)
	if err != nil {
		return fmt.Errorf("marshal meta: %w", err)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err = s.db.Exec(
		`INSERT INTO templates (id, meta, html, css, is_builtin, created_at, updated_at)
		 VALUES (?, ?, ?, ?, 0, ?, ?)`,
		meta.ID, string(metaJSON), html, css, now, now,
	)
	if err != nil {
		return fmt.Errorf("insert template: %w", err)
	}
	log.Info("[template_store] created user template: %s", meta.ID)
	return nil
}

// Update modifies a user template (built-in templates are immutable).
func (s *TemplateStore) Update(id string, meta template.Meta, html, css string) error {
	metaJSON, err := json.Marshal(meta)
	if err != nil {
		return fmt.Errorf("marshal meta: %w", err)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	result, err := s.db.Exec(
		`UPDATE templates SET meta=?, html=?, css=?, updated_at=? WHERE id=? AND is_builtin=0 AND is_deleted=0`,
		string(metaJSON), html, css, now, id,
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

// SoftDelete marks a user template as deleted.
func (s *TemplateStore) SoftDelete(id string) error {
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

// ImportFromFilesystem imports legacy file-based templates from a directory.
// Returns the number of imported templates. Skips IDs that already exist.
func (s *TemplateStore) ImportFromFilesystem(dir string) (int, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0, nil // directory doesn't exist, nothing to import
	}

	imported := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		tmplDir := entry.Name()
		metaPath := filepath.Join(dir, tmplDir, "template.json")
		htmlPath := filepath.Join(dir, tmplDir, "template.html")
		cssPath := filepath.Join(dir, tmplDir, "styles.css")

		metaData, err := os.ReadFile(metaPath)
		if err != nil {
			continue
		}

		var meta template.Meta
		if err := json.Unmarshal(metaData, &meta); err != nil {
			continue
		}

		// Skip if already exists in DB
		existing, _ := s.GetByID(meta.ID)
		if existing != nil {
			continue
		}

		htmlData, _ := os.ReadFile(htmlPath)
		cssData, _ := os.ReadFile(cssPath)

		if err := s.Create(meta, string(htmlData), string(cssData)); err != nil {
			log.Warn("[template_store] import %s: %v", meta.ID, err)
			continue
		}
		imported++
	}

	return imported, nil
}

// ReloadFromDir reads templates from a filesystem directory and upserts them into the DB.
// This overwrites existing templates regardless of is_builtin — intended for dev hot-reload.
func (s *TemplateStore) ReloadFromDir(dir string) error {
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
		htmlPath := filepath.Join(dir, tmplDir, "template.html")
		cssPath := filepath.Join(dir, tmplDir, "styles.css")

		metaData, err := os.ReadFile(metaPath)
		if err != nil {
			continue
		}

		var meta template.Meta
		if err := json.Unmarshal(metaData, &meta); err != nil {
			continue
		}

		htmlData, _ := os.ReadFile(htmlPath)
		cssData, _ := os.ReadFile(cssPath)

		metaJSON, err := json.Marshal(meta)
		if err != nil {
			continue
		}

		now := time.Now().UTC().Format(time.RFC3339)

		// Upsert: try update first, then insert if not exists
		result, err := s.db.Exec(
			`UPDATE templates SET meta=?, html=?, css=?, updated_at=? WHERE id=?`,
			string(metaJSON), string(htmlData), string(cssData), now, meta.ID,
		)
		if err != nil {
			log.Warn("[template_store] reload update %s: %v", meta.ID, err)
			continue
		}

		n, _ := result.RowsAffected()
		if n == 0 {
			_, err = s.db.Exec(
				`INSERT INTO templates (id, meta, html, css, is_builtin, created_at, updated_at)
				 VALUES (?, ?, ?, ?, 1, ?, ?)`,
				meta.ID, string(metaJSON), string(htmlData), string(cssData), now, now,
			)
			if err != nil {
				log.Warn("[template_store] reload insert %s: %v", meta.ID, err)
			}
		}
	}

	log.Info("[template_store] hot-reload complete from %s", dir)
	return nil
}

// WatchDir watches a templates directory for file changes and reloads on change.
// Runs in a goroutine. Returns a stop channel — close it to stop watching.
func (s *TemplateStore) WatchDir(dir string) (chan struct{}, error) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, fmt.Errorf("create watcher: %w", err)
	}

	// Watch root and all subdirectories
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
				// Only trigger on template file changes
				name := filepath.Base(event.Name)
				if !strings.HasSuffix(name, ".html") && !strings.HasSuffix(name, ".css") && !strings.HasSuffix(name, ".json") {
					continue
				}
				if event.Op&(fsnotify.Write|fsnotify.Create) == 0 {
					continue
				}
				// Debounce: reset timer on each event, reload after 300ms of inactivity
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

func hashContent(html, css, metaJSON []byte) string {
	h := sha256.New()
	h.Write(html)
	h.Write(css)
	h.Write(metaJSON)
	return fmt.Sprintf("%x", h.Sum(nil))
}
