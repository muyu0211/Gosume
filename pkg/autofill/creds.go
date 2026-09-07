package autofill

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
)

// 本地桥默认端口（被占用时依次向上自增探测空闲端口）。
const defaultPort = 47621

// creds 是本地桥的持久化凭据，存放在数据目录内的 autofill.json。
//
// 端口与 token 跨启动保持稳定（避免用户每次启动都重新配对扩展），
// 需要时可通过 RotateToken 主动轮换。文件随数据目录存放。
type creds struct {
	Port  int    `json:"port"`
	Token string `json:"token"`
}

const credsFileName = "autofill.json"

// loadCreds 读取本地桥凭据；不存在或损坏时生成一组新凭据。
func loadCreds(dataDir string) creds {
	var c creds
	if raw, err := os.ReadFile(filepath.Join(dataDir, credsFileName)); err == nil {
		_ = json.Unmarshal(raw, &c)
	}
	if c.Token == "" {
		c.Token = newToken()
	}
	if c.Port == 0 {
		c.Port = defaultPort
	}
	return c
}

// saveCreds 原子落盘本地桥凭据。
func saveCreds(dataDir string, c creds) {
	b, _ := json.MarshalIndent(c, "", "  ")
	_ = os.MkdirAll(dataDir, 0755)
	path := filepath.Join(dataDir, credsFileName)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0644); err != nil {
		return
	}
	_ = os.Rename(tmp, path)
}

// newToken 生成 32 位十六进制随机 token，作为扩展访问简历数据的鉴权凭据。
func newToken() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}