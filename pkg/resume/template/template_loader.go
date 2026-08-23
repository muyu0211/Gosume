package template

import "gosume/pkg/resume/dto"

// TemplateStore 是模板持久化能力的抽象接口，由 store.TemplateStore 实现。
type TemplateStore interface {
	ListAll() ([]*dto.Template, error)
	GetByID(id string) (*dto.Template, error)
}

// Loader 基于 TemplateStore 加载模板。
type Loader struct {
	store TemplateStore
}

// NewLoader 创建由 TemplateStore 支撑的模板加载器。
func NewLoader(store TemplateStore) *Loader {
	return &Loader{store: store}
}

// LoadAll 加载全部模板（内置 + 用户创建）。
func (l *Loader) LoadAll() ([]*dto.Template, error) {
	return l.store.ListAll()
}

// LoadByID 按 ID 加载单个模板。
func (l *Loader) LoadByID(id string) (*dto.Template, error) {
	return l.store.GetByID(id)
}

// Error 是模板相关的错误类型，携带错误码便于前端区分处理。
type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Error 实现 error 接口，输出格式为 [错误码] 消息。
func (e *Error) Error() string { return "[" + e.Code + "] " + e.Message }
