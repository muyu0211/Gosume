package model

import (
	"encoding/json"
	"fmt"
)

// Migrate 把原始 JSON 反序列化为 Resume，并处理版本差异。
//
// 先只解析 version 字段，再按版本选择对应的解析逻辑；缺失或不支持的版本返回错误。
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
