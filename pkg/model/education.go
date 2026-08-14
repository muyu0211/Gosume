package model

// Education represents an education background entry.
// Hidden is an optional flag that, when true, omits the entry from the rendered resume
// (without deleting the underlying data). Pointer + omitempty so legacy data stays
// backward-compatible.
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
