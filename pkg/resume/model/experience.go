package model

// Job 表示一条工作经历。
//
// Hidden 为可选标记，置为 true 时该条目不参与简历渲染（但不删除底层数据）。
// 使用指针 + omitempty 以兼容历史数据。
type Job struct {
	ID         string   `json:"id"`
	Company    string   `json:"company"`
	CompanyURL string   `json:"company_url,omitempty"`
	Title      string   `json:"title"`
	Location   string   `json:"location,omitempty"`
	StartDate  string   `json:"start_date"`
	EndDate    string   `json:"end_date,omitempty"`
	IsCurrent  bool     `json:"is_current"`
	Summary    string   `json:"summary,omitempty"`
	Highlights []string `json:"highlights,omitempty"`
	Keywords   []string `json:"keywords,omitempty"`
	Hidden     *bool    `json:"hidden,omitempty"`
}

// Internship 表示一条实习经历。
// Hidden 置为 true 时该条目不参与简历渲染。
type Internship struct {
	ID         string   `json:"id"`
	Company    string   `json:"company"`
	CompanyURL string   `json:"company_url,omitempty"`
	Title      string   `json:"title"`
	Location   string   `json:"location,omitempty"`
	StartDate  string   `json:"start_date"`
	EndDate    string   `json:"end_date,omitempty"`
	IsCurrent  bool     `json:"is_current"`
	Summary    string   `json:"summary,omitempty"`
	Highlights []string `json:"highlights,omitempty"`
	Keywords   []string `json:"keywords,omitempty"`
	Hidden     *bool    `json:"hidden,omitempty"`
}

// Project 表示一条项目经历。
// Hidden 置为 true 时该条目不参与简历渲染。
type Project struct {
	ID         string       `json:"id"`
	Name       string       `json:"name"`
	URL        string       `json:"url,omitempty"`
	Role       string       `json:"role,omitempty"`
	StartDate  string       `json:"start_date,omitempty"`
	EndDate    string       `json:"end_date,omitempty"`
	Summary    string       `json:"summary,omitempty"`
	Highlights []string     `json:"highlights,omitempty"`
	Keywords   []string     `json:"keywords,omitempty"`
	Extras     []ExtraField `json:"extras,omitempty"`
	Hidden     *bool        `json:"hidden,omitempty"`
}

// ExtraField 是挂在 Project 上的用户自定义键值对。
//
// 在通过 {{range .Extras}} 主动接入的模板中渲染为「标签: 值」一行。
// Value 为纯文本，其中的换行由 nl2br 渲染为 <br>。
type ExtraField struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Value string `json:"value"`
}
