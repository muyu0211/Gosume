package service

import "strings"

// UserError 是携带用户可读消息的错误类型。
//
// 从 Wails 服务方法返回时，其 Error() 输出会直接成为前端 JS 的
// Error.message，因此消息内容应面向最终用户（中文、无技术细节）。
type UserError struct {
	Message string `json:"message"`
}

// Error 实现 error 接口，返回面向用户的消息。
func (e *UserError) Error() string { return e.Message }

// UserMsg 由一段消息文本创建面向用户的错误。
func UserMsg(msg string) error {
	return &UserError{Message: msg}
}

// UserWrap 用面向用户的消息包装底层错误。
//
// err 为 nil 时返回 nil；err 本身已是 UserError 时原样返回，
// 以保留更内层已经准备好的用户消息。
func UserWrap(err error, userMsg string) error {
	if err == nil {
		return nil
	}
	if _, ok := err.(*UserError); ok {
		return err
	}
	return &UserError{Message: userMsg}
}

// IsCancel 判断错误是否表示用户主动取消了对话框操作。
// 此类情况不应向前端弹出错误提示。
func IsCancel(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "cancelled") || strings.Contains(err.Error(), "canceled")
}
