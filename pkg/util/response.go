package util

import (
	"encoding/json"
	"fmt"
	"strings"
)

type RspCode uint32

// 统一响应码。约定 0 为成功，非 0 为失败。
const (
	SuccCode RspCode = 0   // 成功
	WarnCode RspCode = 300 // 警告
	ErrCode  RspCode = 500 // 失败
)

// Response 是所有 Wails 服务方法统一的返回结构。
//
// 服务方法不再返回 error，而是返回 *Response：
//   - 成功：Code == SuccCode，Data 携带业务数据；
//   - 失败：Code == ErrCode，Message 为面向用户的错误消息（中文、无技术细节）。
//
// 前端统一解析 code 判断成功与否，message 用于提示，data 为业务负载。
type Response struct {
	Code    RspCode `json:"code"`
	Message string  `json:"message"`
	Data    any     `json:"data,omitempty"`
}

// IsSuccess 判断响应是否成功（Code == SuccCode）。
// 空指针视为失败，避免调用方因未判空而误判。
func (r *Response) IsSuccess() bool {
	return r != nil && r.Code == SuccCode
}

// Error 实现 error 接口，返回面向用户的消息。
//
// 保留此实现以便 Response 在需要 error 的场合（日志、降级、兼容旧调用）
// 仍可直接使用；其 Error() 输出会直接成为前端 JS 的 Error.message。
func (r *Response) Error() string {
	if r == nil {
		return ""
	}
	return r.Message
}

// DoRsp 构造响应，携带业务数据 data。
// data 为 nil 时（如仅确认操作成功）响应体不含 data 字段。
func DoRsp(code RspCode, msg string, data any) *Response {
	return &Response{Code: code, Message: msg, Data: data}
}

// IsCancel 判断错误是否表示用户主动取消了对话框操作。
// 此类情况不应向前端弹出错误提示（应视为正常返回 nil）。
func IsCancel(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "cancelled") || strings.Contains(err.Error(), "canceled")
}

// ParseData 从统一响应包裹（util.Response）中提取 data 并反序列化到目标类型。
func ParseData[T any](r *Response) (T, error) {
	var zero T
	if r == nil {
		return zero, fmt.Errorf("空响应")
	}
	if r.Code != SuccCode {
		return zero, fmt.Errorf("服务错误: %s", r.Message)
	}
	b, err := json.Marshal(r.Data)
	if err != nil {
		return zero, fmt.Errorf("数据序列化失败: %w", err)
	}
	if err := json.Unmarshal(b, &zero); err != nil {
		return zero, fmt.Errorf("数据解析失败: %w", err)
	}
	return zero, nil
}
