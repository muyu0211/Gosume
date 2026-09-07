// Package autofill 提供「一键填入」的本地桥：在 127.0.0.1 起一个仅本机可访问的
// HTTP 服务，供浏览器扩展按需取走当前简历数据，写入招聘网站表单。
//
// 数据绝不出本机：扩展只向本桥取数，逐字段写入网页；简历不经过任何云端。
package autofill

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"gosume/pkg/log"
	"gosume/pkg/resume/model"
)

// Status 是本地桥的运行状态，部分字段对扩展可见（GetStatus）用于确认连接。
type Status struct {
	Running    bool   `json:"running"`
	Port       int    `json:"port"`
	Token      string `json:"token"`
	Version    string `json:"version"`
	ResumeName string `json:"resume_name,omitempty"`
	HasResume  bool   `json:"has_resume"`
}

// Bridge 在 127.0.0.1 上提供简历数据，供浏览器扩展读取。
type Bridge struct {
	mu       sync.RWMutex
	server   *http.Server
	port     int
	token    string
	version  string
	dataDir  string
	provider func() *model.Resume
}

// NewBridge 创建本地桥。provider 在每次请求当前简历时惰性调用，
// 因此闭包捕获的 ResumeService 可以稍后再注入，不造成初始化顺序耦合。
func NewBridge(dataDir, version string, provider func() *model.Resume) *Bridge {
	return &Bridge{dataDir: dataDir, version: version, provider: provider}
}

// Start 启动本地桥：加载/生成凭据、监听可用端口、注册路由。
func (b *Bridge) Start() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.server != nil {
		return nil
	}

	c := loadCreds(b.dataDir)
	ln, port, err := listenLoop(c.Port)
	if err != nil {
		return err
	}

	b.port = port
	b.token = c.Token
	saveCreds(b.dataDir, creds{Port: port, Token: c.Token})

	mux := http.NewServeMux()
	mux.HandleFunc("/api/status", b.handleStatus)
	mux.HandleFunc("/api/resume", b.handleResume)

	b.server = &http.Server{
		Handler:           b.withAuth(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		if err := b.server.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Errorf("[autofill] bridge serve: %v", err)
		}
	}()
	log.Infof("[autofill] bridge listening on 127.0.0.1:%d", port)
	return nil
}

// Stop 关闭本地桥。
func (b *Bridge) Stop() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.server != nil {
		_ = b.server.Close()
		b.server = nil
	}
}

// RotateToken 轮换凭据，并返回新的 token。
func (b *Bridge) RotateToken() Status {
	b.mu.Lock()
	b.token = newToken()
	saveCreds(b.dataDir, creds{Port: b.port, Token: b.token})
	st := b.statusLocked()
	b.mu.Unlock()
	return st
}

// Status 返回当前运行状态；无论是否已启动均可调用。
func (b *Bridge) Status() Status {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.statusLocked()
}

func (b *Bridge) statusLocked() Status {
	st := Status{Running: b.server != nil, Port: b.port, Token: b.token, Version: b.version}
	if b.provider != nil {
		if r := b.provider(); r != nil {
			st.HasResume = true
			st.ResumeName = r.Meta.Name
		}
	}
	return st
}

// handleStatus 返回连接探测信息（不含个人数据），扩展据此确认桥已就绪。
func (b *Bridge) handleStatus(w http.ResponseWriter, r *http.Request) {
	b.mu.RLock()
	st := Status{Running: true, Port: b.port, Version: b.version}
	b.mu.RUnlock()
	if b.provider != nil {
		if rv := b.provider(); rv != nil {
			st.HasResume = true
			st.ResumeName = rv.Meta.Name
		}
	}
	log.Debugf("[autofill] handleStatus: 连接探测 port=%d hasResume=%v", st.Port, st.HasResume)
	writeJSON(w, http.StatusOK, st)
}

// handleResume 返回当前简历的规范化数据（需要 Bearer 鉴权）。
func (b *Bridge) handleResume(w http.ResponseWriter, r *http.Request) {
	if b.provider == nil || b.provider() == nil {
		log.Warnf("[autofill] handleResume: 当前未加载简历")
		http.Error(w, `{"error":"no_resume_loaded"}`, http.StatusNotFound)
		return
	}
	resume := b.provider()
	log.Infof("[autofill] handleResume: 已向扩展提供简历 resume=%q", resume.Meta.Name)
	writeJSON(w, http.StatusOK, Normalize(resume))
}

// withAuth 对含个人数据的接口做 Bearer 鉴权；连接探测接口保持公开。
func (b *Bridge) withAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/resume" {
			b.mu.RLock()
			token := b.token
			b.mu.RUnlock()
			if token == "" || bearerToken(r) != token {
				log.Warnf("[autofill] withAuth: 鉴权失败（Bearer 缺失或不匹配）path=%s", r.URL.Path)
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	return ""
}

// writeJSON 统一写出 JSON 响应，设置防缓存头并关闭连接。
func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

// listenLoop 从 prefer 端口开始依次尝试绑定，返回首个可用监听器。
func listenLoop(prefer int) (net.Listener, int, error) {
	for p := prefer; p < prefer+100; p++ {
		ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p))
		if err == nil {
			return ln, p, nil
		}
	}
	return nil, 0, fmt.Errorf("autofill: no free port near %d", prefer)
}
