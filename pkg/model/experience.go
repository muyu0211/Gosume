package model

// Job represents a work experience entry.
// Hidden is an optional flag that, when true, omits the entry from the rendered resume
// (without deleting the underlying data). Pointer + omitempty so legacy data stays
// backward-compatible.
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

// Internship represents an internship experience entry.
// Hidden is an optional flag that, when true, omits the entry from the rendered resume.
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

// Project represents a project experience entry.
// Hidden is an optional flag that, when true, omits the entry from the rendered resume.
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

// ExtraField is a user-defined key/value pair attached to a Project.
// Renders as a labeled line (Label: Value) in templates that opt in via
// {{range .Extras}}. Value is plain text; newlines render as <br> via nl2br.
type ExtraField struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Value string `json:"value"`
}
