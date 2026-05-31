package model

import (
	"encoding/json"
	"fmt"
)

// Migrate deserializes raw JSON into a Resume, handling version differences.
func Migrate(rawJSON []byte) (*Resume, error) {
	var versionInfo struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(rawJSON, &versionInfo); err != nil {
		return nil, fmt.Errorf("parse version: %w", err)
	}

	switch versionInfo.Version {
	case "1.0":
		var r Resume
		if err := json.Unmarshal(rawJSON, &r); err != nil {
			return nil, fmt.Errorf("unmarshal v1.0: %w", err)
		}
		return &r, nil
	case "":
		return nil, fmt.Errorf("missing version field, cannot migrate")
	default:
		return nil, fmt.Errorf("unsupported data version: %s", versionInfo.Version)
	}
}
