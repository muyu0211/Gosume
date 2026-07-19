package model

// Education represents an education background entry.
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
}
