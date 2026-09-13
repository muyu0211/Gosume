package model

// Personal 保存用户的个人信息与联系方式。
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
	Birthday     string `json:"birthday,omitempty"`
	Gender       string `json:"gender,omitempty"`
	JobTitle     string `json:"job_title,omitempty"`
	YearsOfExp   int    `json:"years_of_exp,omitempty"`

	// 国央企求职场景的常见档案字段（全部可选，缺省不落盘，旧数据天然兼容）。
	NativePlace    string `json:"native_place,omitempty"`     // 籍贯
	Ethnicity      string `json:"ethnicity,omitempty"`        // 民族
	PoliticalStatus string `json:"political_status,omitempty"` // 政治面貌
	PartyJoinDate  string `json:"party_join_date,omitempty"`  // 入党/入团时间
	MaritalStatus  string `json:"marital_status,omitempty"`   // 婚姻状况
	HouseholdReg   string `json:"household_registration,omitempty"` // 户口所在地
	CurrentResidence string `json:"current_residence,omitempty"`    // 现居住地
	TitleRank      string `json:"title_rank,omitempty"`       // 职称/职级
	Age            int    `json:"age,omitempty"`              // 年龄

	// Extras 用户自定义键值对（字段名/字段值由用户自行输入），与 Project.Extras 同构。
	Extras []ExtraField `json:"extras,omitempty"`
}
