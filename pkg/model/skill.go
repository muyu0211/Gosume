package model

// SkillGroup groups skills by category.
type SkillGroup struct {
	ID       string  `json:"id"`
	Category string  `json:"category"`
	Items    []Skill `json:"items"`
}

// Skill represents a single skill entry.
type Skill struct {
	Name  string `json:"name"`
	Level int    `json:"level,omitempty"`
	Icon  string `json:"icon,omitempty"`
}

// Language represents a language proficiency entry.
type Language struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Level       string `json:"level"`
	Proficiency string `json:"proficiency,omitempty"`
}

// Award represents an award or honor entry.
type Award struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Date    string `json:"date"`
	Issuer  string `json:"issuer,omitempty"`
	Summary string `json:"summary,omitempty"`
}

// CustomSection represents a user-defined custom module.
type CustomSection struct {
	ID    string       `json:"id"`
	Title string       `json:"title"`
	Items []CustomItem `json:"items"`
}

// CustomItem is an entry within a custom section.
type CustomItem struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Subtitle    string   `json:"subtitle,omitempty"`
	Date        string   `json:"date,omitempty"`
	Description string   `json:"description,omitempty"`
	Highlights  []string `json:"highlights,omitempty"`
}
