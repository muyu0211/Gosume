package event

import (
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	EXPORT_PROGRESS        = "export:progress"
	EXPORT_COMPLETED       = "export:completed"
	FILE_OPENED            = "file:opened"
	FILE_SAVED             = "file:saved"
	CONFIG_DATADIR_CHANGED = "config:datadir-changed"
)

// application.RegisterEvent[int]("export:progress")
// application.RegisterEvent[string]("export:completed")
// application.RegisterEvent[string]("file:opened")
// application.RegisterEvent[string]("file:saved")
// application.RegisterEvent[string]("config:datadir-changed")

type EventManager struct {
	eventMap map[string]interface{}
	mu       sync.RWMutex
}

var EventMgr *EventManager

// AddEvent 添加事件
func AddEvent(event string, data interface{}) {
	// 惰性初始化
	if EventMgr == nil {
		EventMgr = &EventManager{
			eventMap: make(map[string]interface{}),
		}
	}

	EventMgr.mu.Lock()
	defer EventMgr.mu.Unlock()
	EventMgr.eventMap[event] = data
}

// registerEvents 注册后端向前端发送的 Wails 事件及其数据类型。
func RegisterEvents() {
	EventMgr.mu.RLock()
	defer EventMgr.mu.RUnlock()
	for k, v := range EventMgr.eventMap {
		switch v.(type) {
		case int:
			application.RegisterEvent[int](k)
		case string:
			application.RegisterEvent[string](k)
		}
	}
}
