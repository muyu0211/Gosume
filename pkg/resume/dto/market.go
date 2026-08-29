package dto

// CommunityTemplate 是社区模板列表/详情返回的模板视图。
type CommunityTemplate struct {
	ID              string              `json:"id"`
	Name            string              `json:"name"`
	NameEn          string              `json:"name_en"`
	Version         string              `json:"version"`
	Author          Author              `json:"author"`
	Description     string              `json:"description"`
	Category        string              `json:"category"`
	Tags            []string            `json:"tags"`
	PaperSize       string              `json:"paper_size"`
	Orientations    []string            `json:"orientations"`
	PageCount       PageCount           `json:"page_count"`
	Colors          *TemplateColors     `json:"colors,omitempty"`
	ThumbnailURL    string              `json:"thumbnail_url"`
	DownloadCount   int                 `json:"download_count"`
	Rating          float64             `json:"rating"`
	RatingCount     int                 `json:"rating_count"`
	PublishedAt     string              `json:"published_at"`
	PublishedByName string              `json:"published_by_name"`
	IsInstalled     bool                `json:"is_installed"` // 客户端计算：本地是否已安装同 ID 模板
}

// CommunityTemplateList 是模板列表接口的分页返回。
type CommunityTemplateList struct {
	Total    int                 `json:"total"`
	Page     int                 `json:"page"`
	PageSize int                 `json:"page_size"`
	Items    []CommunityTemplate `json:"items"`
}

// CommunityInfo 描述社区服务的配置与可用性，供前端决定是否展示社区入口提示。
type CommunityInfo struct {
	Endpoint   string `json:"endpoint"`   // 服务基地址（（可能为空，未配置）
	Configured bool   `json:"configured"` // 是否已配置社区服务
}

// DownloadTemplateResponse 是社区模板下载并安装到本地后的返回结果。
type DownloadTemplateResponse struct {
	TemplateID string `json:"template_id"`
	Name       string `json:"name"`
	Version    string `json:"version"`
}

// PublishTemplateRequest 是发布模板的多部分表单字段（content 类型为 multipart/form-data）。
type PublishTemplateRequest struct {
	Meta string `json:"meta"` // dto.TemplateMeta 的 JSON 字符串
	CSS  string `json:"css"`  // 模板样式内容
}

// PublishTemplateResponse 是发布模板成功后的返回。
type PublishTemplateResponse struct {
	ID string `json:"id"`
}

// RateTemplateRequest 是模板评分请求体。
type RateTemplateRequest struct {
	Score int `json:"score"` // 1-5
}
