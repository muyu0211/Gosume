package service

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gosume/pkg/log"
	"gosume/pkg/util"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// ToolService 提供简历相关的独立工具（证件照等）的后端能力。
//
// 与浏览器原生下载（WebView2 下载栏）不同，本服务通过系统原生保存对话框选择
// 落地位置并写盘，保持与导出组件一致的桌面体验。
type ToolService struct {
	app *application.App
}

// ServiceName 返回服务名，供 Wails 绑定与前端调用使用。
func (s *ToolService) ServiceName() string {
	return "ToolService"
}

// Inject 注入依赖。
func (s *ToolService) Inject(app *application.App) {
	s.app = app
}

// SaveImage 把前端处理后的图片数据（base64）经原生保存对话框写入用户指定路径。
//
// 参数：
//   - dataBase64：图片的 base64 负载（不含 data URI 前缀）
//   - format：图片格式，jpg 或 png，用于决定扩展名与过滤
//   - defaultName：保存对话框的默认文件名（不含扩展名）
//
// 成功返回最终保存路径（data 为字符串）；用户取消保存时返回 data 为空字符串。
func (s *ToolService) SaveImage(dataBase64 string, format string, defaultName string) *util.Response {
	suffix, filterName, pattern := imageFormat(format)
	if suffix == "" {
		return util.DoRsp(util.ErrCode, "不支持的图片格式", nil)
	}

	data, err := base64.StdEncoding.DecodeString(dataBase64)
	if err != nil {
		log.Errorf("[tool_service] SaveImage 解码图片数据失败: %v", err)
		return util.DoRsp(util.ErrCode, "图片编码无效", nil)
	}

	name := util.SanitizeFilename(defaultName)
	if name == "" {
		name = "证件照"
	}
	filePath, err := s.app.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:    "保存图片",
		Filename: fmt.Sprintf("%s.%s", name, suffix),
		Filters: []application.FileFilter{
			{DisplayName: filterName, Pattern: pattern},
		},
	}).PromptForSingleSelection()
	if err != nil {
		// 用户主动取消对话框
		if util.IsCancel(err) {
			return util.DoRsp(util.SuccCode, "", "")
		}
		log.Errorf("[tool_service] SaveImage 打开保存对话框失败: %v", err)
		return util.DoRsp(util.ErrCode, "打开保存对话框失败", nil)
	}
	if filePath == "" {
		return util.DoRsp(util.SuccCode, "", "")
	}

	// 用户可能手动去掉了扩展名，兜底补全
	if !strings.HasSuffix(strings.ToLower(filePath), "."+suffix) {
		filePath = filePath + "." + suffix
	}

	if err := os.WriteFile(filePath, data, 0644); err != nil {
		log.Errorf("[tool_service] SaveImage 写入文件失败: %v", err)
		return util.DoRsp(util.ErrCode, "保存图片失败", nil)
	}

	log.Infof("[tool_service] SaveImage 已保存 %s", filePath)
	return util.DoRsp(util.SuccCode, "", filePath)
}

// imageFormat 返回图片格式对应的扩展名、过滤器显示名与通配符。
func imageFormat(format string) (suffix, filterName, pattern string) {
	switch strings.ToLower(format) {
	case "jpg", "jpeg":
		return "jpg", "JPEG 图片 (*.jpg)", "*.jpg;*.jpeg"
	case "png":
		return "png", "PNG 图片 (*.png)", "*.png"
	default:
		return "", "", ""
	}
}

// imageMimeByExt 返回扩展名对应的 MIME 类型；不支持的扩展名返回空串。
func imageMimeByExt(ext string) string {
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	default:
		return ""
	}
}

// ImageFile 是 ReadImageAsBase64 的返回负载：图片文件的内容与元信息。
type ImageFile struct {
	Name string `json:"name"`
	Mime string `json:"mime"`
	Size int64  `json:"size"`
	Data string `json:"data"` // 图片字节的 base64（不含 data URI 前缀）
}

// ReadImageAsBase64 读取本地图片文件并返回 base64 内容，供头像等场景
// 在自绘文件选择模态中按路径取图。只接受普通图片文件且不超过 maxBytes
// （≤0 时按 3 MB 处理，与头像上传约束一致）；不做任何格式转换。
func (s *ToolService) ReadImageAsBase64(path string, maxBytes int64) *util.Response {
	p, err := util.NormalizeFilePath(path)
	if err != nil {
		return util.DoRsp(util.ErrCode, "图片路径无效", nil)
	}
	ext := filepath.Ext(p)
	mime := imageMimeByExt(ext)
	if mime == "" {
		return util.DoRsp(util.ErrCode, "仅支持 JPG / PNG / WebP 格式图片", nil)
	}

	info, err := os.Stat(p)
	if err != nil {
		log.Errorf("[tool_service] ReadImageAsBase64: 读取文件失败 %s: %v", p, err)
		return util.DoRsp(util.ErrCode, "文件不存在或无法读取", nil)
	}
	if !info.Mode().IsRegular() {
		return util.DoRsp(util.ErrCode, "请选择图片文件", nil)
	}
	limit := maxBytes
	if limit <= 0 {
		limit = 3 << 20
	}
	if info.Size() > limit {
		return util.DoRsp(util.ErrCode, "图片不能超过 3 MB", nil)
	}

	data, err := os.ReadFile(p)
	if err != nil {
		log.Errorf("[tool_service] ReadImageAsBase64: 读取文件失败 %s: %v", p, err)
		return util.DoRsp(util.ErrCode, "读取文件失败", nil)
	}

	log.Infof("[tool_service] ReadImageAsBase64: 已读取图片 %s (%d bytes)", p, info.Size())
	return util.DoRsp(util.SuccCode, "成功", &ImageFile{
		Name: filepath.Base(p),
		Mime: mime,
		Size: info.Size(),
		Data: base64.StdEncoding.EncodeToString(data),
	})
}