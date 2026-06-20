package service

import "strings"

// UserError wraps an error with a user-facing message.
// When returned from a Wails service method, its Error() output becomes
// the JS Error.message shown to users.
type UserError struct {
	Message string `json:"message"`
}

func (e *UserError) Error() string { return e.Message }

// UserMsg creates a new user-facing error from a message.
func UserMsg(msg string) error {
	return &UserError{Message: msg}
}

// UserWrap wraps an existing error with a user-facing message.
// Returns nil if err is nil. Returns the original if already a UserError.
func UserWrap(err error, userMsg string) error {
	if err == nil {
		return nil
	}
	if _, ok := err.(*UserError); ok {
		return err
	}
	return &UserError{Message: userMsg}
}

// IsCancel returns true if the error indicates the user cancelled a dialog.
func IsCancel(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "cancelled") || strings.Contains(err.Error(), "canceled")
}
