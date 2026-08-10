package model

// Job represents a work experience entry.
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
}

// Internship represents an internship experience entry.
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
}

// Project represents a project experience entry.
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
}

// ExtraField is a user-defined key/value pair attached to a Project.
// Renders as a labeled line (Label: Value) in templates that opt in via
// {{range .Extras}}. Value is plain text; newlines render as <br> via nl2br.
type ExtraField struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Value string `json:"value"`
}
