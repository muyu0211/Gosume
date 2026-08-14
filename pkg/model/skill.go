package model

// SkillGroup groups skills by category.
// Hidden is an optional flag that, when true, omits the entire group from the rendered resume.
type SkillGroup struct {
	ID       string  `json:"id"`
	Category string  `json:"category"`
	Items    []Skill `json:"items"`
	Hidden   *bool   `json:"hidden,omitempty"`
}

// Skill represents a single skill entry.
// Hidden is an optional flag that, when true, omits the skill from the rendered resume.
type Skill struct {
	Name   string `json:"name"`
	Level  int    `json:"level,omitempty"`
	Icon   string `json:"icon,omitempty"`
	Hidden *bool  `json:"hidden,omitempty"`
}

// Language represents a language proficiency entry.
// Hidden is an optional flag that, when true, omits the entry from the rendered resume.
type Language struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Level       string `json:"level"`
	Proficiency string `json:"proficiency,omitempty"`
	Hidden      *bool  `json:"hidden,omitempty"`
}

// Award represents an award or honor entry.
// Hidden is an optional flag that, when true, omits the entry from the rendered resume.
type Award struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Date    string `json:"date"`
	Issuer  string `json:"issuer,omitempty"`
	Summary string `json:"summary,omitempty"`
	Hidden  *bool  `json:"hidden,omitempty"`
}

// CustomSection represents a user-defined custom module.
// Hidden is an optional flag that, when true, omits the entire section from the rendered resume.
type CustomSection struct {
	ID     string       `json:"id"`
	Title  string       `json:"title"`
	Items  []CustomItem `json:"items"`
	Hidden *bool        `json:"hidden,omitempty"`
}

// CustomItem is an entry within a custom section.
// Hidden is an optional flag that, when true, omits the entry from the rendered resume.
type CustomItem struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Subtitle    string   `json:"subtitle,omitempty"`
	Date        string   `json:"date,omitempty"`
	Description string   `json:"description,omitempty"`
	Highlights  []string `json:"highlights,omitempty"`
	Hidden      *bool    `json:"hidden,omitempty"`
}
