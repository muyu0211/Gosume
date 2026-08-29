package dto

// AppcastManifest 服务端 appcast.json 的根结构。
type AppcastManifest struct {
	Product   string                     `json:"product"`
	Channel   string                     `json:"channel"`
	Platforms map[string]AppcastPlatform `json:"platforms"`
}

// AppcastPlatform 单个平台的更新条目。
type AppcastPlatform struct {
	Version      string `json:"version"`
	ReleaseDate  string `json:"release_date"`
	NotesZh      string `json:"notes_zh"`
	NotesEn      string `json:"notes_en"`
	ArtifactType string `json:"artifact_type"`
	InstallerURL string `json:"installer_url"`
	SHA256       string `json:"sha256"`
	Mandatory    bool   `json:"mandatory"` // 预留（P3 强制更新），本期忽略
}

// UpdateMeta 记录已下载但尚未安装的更新包元信息。
type UpdateMeta struct {
	Version      string `json:"version"`       // 该包对应的服务端版本号
	ArtifactType string `json:"artifact_type"` // 更新包形态
	DownloadedAt string `json:"downloaded_at"` // 下载完成时间
}
