package model

// Personal holds the user's personal and contact information.
type Personal struct {
	FullName     string `json:"full_name"`
	EnglishName  string `json:"english_name,omitempty"`
	Email        string `json:"email,omitempty"`
	Phone        string `json:"phone,omitempty"`
	Wechat       string `json:"wechat,omitempty"`
	QQ           string `json:"qq,omitempty"`
	Location     string `json:"location,omitempty"`
	Website      string `json:"website,omitempty"`
	LinkedIn     string `json:"linkedin,omitempty"`
	GitHub       string `json:"github,omitempty"`
	Avatar       string `json:"avatar,omitempty"`
	AvatarWidth  int    `json:"avatar_width,omitempty"`
	AvatarHeight int    `json:"avatar_height,omitempty"`
	Birthday     string `json:"birthday,omitempty"`
	Gender       string `json:"gender,omitempty"`
	JobTitle     string `json:"job_title,omitempty"`
	YearsOfExp   int    `json:"years_of_exp,omitempty"`
}
