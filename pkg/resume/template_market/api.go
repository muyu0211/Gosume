package template_market

import (
	"fmt"
	"net/url"
)

// 社区 API 路径统一管理。
//
// 所有路径均相对服务 target 基地址，且以 /api/v1 为前缀；
// 服务基地址由 config.yaml 中命名服务 gosume.CommunityService 的 target 指定。
//
//   - GET    /api/v1/templates?category=&keyword=&page=&page_size=  模板列表（分页 + 分类/关键字筛选）
//   - GET    /api/v1/templates/{id}                                  模板详情
//   - GET    /api/v1/templates/{id}/download                         模板包下载（zip 二进制）
//   - POST   /api/v1/templates                                     发布模板（multipart：meta + css）
//   - POST   /api/v1/templates/{id}/rating                         模板评分（JSON：{ "score": 1-5 }）
const (
	// apiTemplatesListPath 是模板列表与发布共用的路径。
	apiTemplatesListPath = "/api/v1/templates"
	// apiTemplateDetailPath 是模板详情路径，%s 为模板 ID。
	apiTemplateDetailPath = "/api/v1/templates/%s"
	// apiTemplateDownloadPath 是模板包下载路径，%s 为模板 ID。
	apiTemplateDownloadPath = "/api/v1/templates/%s/download"
	// apiTemplateRatingPath 是模板评分路径，%s 为模板 ID。
	apiTemplateRatingPath = "/api/v1/templates/%s/rating"
)

// buildTemplatePath 用模板 ID 替换动态路径中的占位符并做 URL 转义。
func buildTemplatePath(pattern, id string) string {
	return fmt.Sprintf(pattern, url.PathEscape(id))
}