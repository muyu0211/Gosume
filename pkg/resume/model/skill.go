package model

// SkillGroup 按类别对技能分组。
// Hidden 置为 true 时整个分组不参与简历渲染。
type SkillGroup struct {
	ID       string  `json:"id"`
	Category string  `json:"category"`
	Items    []Skill `json:"items"`
	Hidden   *bool   `json:"hidden,omitempty"`
}

// Skill 表示一项技能。
// Hidden 置为 true 时该技能不参与简历渲染。
type Skill struct {
	Name   string `json:"name"`
	Level  int    `json:"level,omitempty"`
	Icon   string `json:"icon,omitempty"`
	Hidden *bool  `json:"hidden,omitempty"`
}

// Language 表示一条语言能力。
// Hidden 置为 true 时该条目不参与简历渲染。
type Language struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Level       string `json:"level"`
	Proficiency string `json:"proficiency,omitempty"`
	Hidden      *bool  `json:"hidden,omitempty"`
}

// Award 表示一条获奖或荣誉。
// Hidden 置为 true 时该条目不参与简历渲染。
type Award struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Date    string `json:"date"`
	Issuer  string `json:"issuer,omitempty"`
	Summary string `json:"summary,omitempty"`
	Hidden  *bool  `json:"hidden,omitempty"`
}

// CustomSection 表示用户自定义模块。
// Hidden 置为 true 时整个模块不参与简历渲染。
type CustomSection struct {
	ID     string       `json:"id"`
	Title  string       `json:"title"`
	Items  []CustomItem `json:"items"`
	Hidden *bool        `json:"hidden,omitempty"`
}

// CustomItem 是自定义模块中的一个条目。
// Hidden 置为 true 时该条目不参与简历渲染。
type CustomItem struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Subtitle    string   `json:"subtitle,omitempty"`
	Date        string   `json:"date,omitempty"`
	Description string   `json:"description,omitempty"`
	Highlights  []string `json:"highlights,omitempty"`
	Hidden      *bool    `json:"hidden,omitempty"`
}
