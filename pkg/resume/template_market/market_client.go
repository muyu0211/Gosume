package template_market

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"gosume/pkg/config"
	"gosume/pkg/remote"
	ghttp "gosume/pkg/remote/http"
	"gosume/pkg/resume/dto"
	"gosume/pkg/util"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	// CommunityServiceName 是 config.yaml 中社区服务的命名服务名。
	CommunityServiceName = "gosume.CommunityService"
	// MaxCommunityPackageSize 限制社区模板包的下载体积（20MB），
	// 本地导入阶段仍按现有解压上限（10MB）二次校验。
	MaxCommunityPackageSize = 20 << 20
	// requestTimeoutSec 是社区 JSON 接口的默认超时。
	requestTimeoutSec = 5
)

// Client 是模板社区服务端的 HTTP 客户端封装。
//
// 复用项目统一 remote 客户端基建：JSON 请求走 ghttp 门面，
// 二进制下载走 DoNotParse 流式读取，multipart 上传走底层标准库客户端。
type Client struct {
	cli      ghttp.Clients // 统一请求门面
	endpoint string        // 服务基地址（去尾部斜杠）
}

// NewClient 创建社区服务客户端；config.yaml 未配置社区服务时返回错误。
func NewClient() (*Client, error) {
	svc, ok := remote.GetService(CommunityServiceName)
	if !ok {
		return nil, fmt.Errorf("社区服务未配置: %s", CommunityServiceName)
	}
	return &Client{
		cli:      ghttp.NewStdHttpClient(CommunityServiceName),
		endpoint: strings.TrimRight(svc.Target, "/"),
	}, nil
}

// Endpoint 返回社区服务基地址（已去除尾部斜杠）。
func (c *Client) Endpoint() string { return c.endpoint }

// ListTemplates 分页拉取社区模板列表，支持分类与关键字筛选。
func (c *Client) ListTemplates(ctx context.Context, category, keyword string, page, pageSize int) (*dto.CommunityTemplateList, error) {
	var resp util.Response
	opts := []ghttp.Option{ghttp.WithTimeout(requestTimeoutSec * time.Second)}
	if category != "" {
		opts = append(opts, ghttp.WithQueryParam("category", category))
	}
	if keyword != "" {
		opts = append(opts, ghttp.WithQueryParam("keyword", keyword))
	}
	opts = append(opts,
		ghttp.WithQueryParam("page", strconv.Itoa(page)),
		ghttp.WithQueryParam("page_size", strconv.Itoa(pageSize)),
	)

	if _, err := c.cli.Get(ctx, apiTemplatesListPath, &resp, opts...); err != nil {
		return nil, err
	}
	list, err := util.ParseData[dto.CommunityTemplateList](&resp)
	if err != nil {
		return nil, err
	}
	return &list, nil
}

// GetTemplate 拉取单个社区模板详情。
func (c *Client) GetTemplate(ctx context.Context, id string) (*dto.CommunityTemplate, error) {
	var resp util.Response
	if _, err := c.cli.Get(ctx, buildTemplatePath(apiTemplateDetailPath, id), &resp,
		ghttp.WithTimeout(requestTimeoutSec*time.Second)); err != nil {
		return nil, err
	}
	tmpl, err := util.ParseData[dto.CommunityTemplate](&resp)
	if err != nil {
		return nil, err
	}
	return &tmpl, nil
}

// DownloadTemplate 下载社区模板包（zip 二进制），并限制响应体积上限。
// 返回的字节流由调用方写入临时文件后走现有模板包导入校验。
func (c *Client) DownloadTemplate(ctx context.Context, id string) ([]byte, error) {
	resp, err := c.cli.Get(ctx, buildTemplatePath(apiTemplateDownloadPath, id), nil,
		ghttp.WithTimeout(60*time.Second),
		ghttp.WithDoNotParse(),
	)
	if err != nil {
		return nil, err
	}
	defer resp.Body().Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body(), MaxCommunityPackageSize+1))
	if err != nil {
		return nil, fmt.Errorf("读取模板包失败: %w", err)
	}
	if len(data) > MaxCommunityPackageSize {
		return nil, fmt.Errorf("社区模板包过大（超过 %d 字节）", MaxCommunityPackageSize)
	}
	return data, nil
}

// PublishTemplate 把本地模板发布到社区。
// 以 multipart/form-data 提交 meta（模板元数据 JSON）与 css（样式内容）。
func (c *Client) PublishTemplate(ctx context.Context, metaJSON, css string) (*dto.PublishTemplateResponse, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	if err := mw.WriteField("meta", metaJSON); err != nil {
		return nil, err
	}
	if err := mw.WriteField("css", css); err != nil {
		return nil, err
	}
	if err := mw.Close(); err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint+apiTemplatesListPath, &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if app := config.GlobalConfig.App; app.Name != "" && app.Version != "" {
		req.Header.Set("User-Agent", fmt.Sprintf("%s/%s", app.Name, app.Version))
	}

	raw, ok := c.cli.(interface{ Raw() *http.Client })
	if !ok {
		return nil, fmt.Errorf("社区客户端不支持文件上传")
	}
	res, err := raw.Raw().Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", res.StatusCode, res.Status)
	}
	var resp util.Response
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("解析社区响应失败: %w", err)
	}
	publish, err := util.ParseData[dto.PublishTemplateResponse](&resp)
	if err != nil {
		return nil, err
	}
	return &publish, nil
}

// RateTemplate 提交对某个社区模板的评分（1-5 星）。
func (c *Client) RateTemplate(ctx context.Context, id string, score int) error {
	var resp util.Response
	_, err := c.cli.Post(ctx,
		buildTemplatePath(apiTemplateRatingPath, id),
		&dto.RateTemplateRequest{Score: score},
		&resp,
		ghttp.WithTimeout(requestTimeoutSec*time.Second),
	)
	if err != nil {
		return err
	}
	if _, err := util.ParseData[struct{}](&resp); err != nil {
		return err
	}
	return nil
}
