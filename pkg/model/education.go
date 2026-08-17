package model

// Education 表示一条教育经历。
//
// Hidden 为可选标记，置为 true 时该条目不参与简历渲染（但不删除底层数据）。
// 使用指针 + omitempty 以兼容历史数据。
type Education struct {
	ID         string   `json:"id"`
	School     string   `json:"school"`
	Degree     string   `json:"degree"`
	Major      string   `json:"major"`
	Minor      string   `json:"minor,omitempty"`
	StartDate  string   `json:"start_date"`
	EndDate    string   `json:"end_date"`
	GPA        string   `json:"gpa,omitempty"`
	Courses    string   `json:"courses,omitempty"`
	Highlights []string `json:"highlights,omitempty"`
	Hidden     *bool    `json:"hidden,omitempty"`
}
