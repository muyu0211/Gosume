package log

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestInitAndLog 验证初始化后各级别日志均写入文件，且级别标签与内容正确。
func TestInitAndLog(t *testing.T) {
	dir := t.TempDir()

	if err := Init(dir, "test", DEBUG, false); err != nil {
		t.Fatalf("Init: %v", err)
	}
	defer Close()

	Infof("hello %s", "world")
	Debugf("debug message")
	Warnf("warning %d", 42)
	Errorf("something went wrong: %v", os.ErrNotExist)

	Sync()

	files, err := os.ReadDir(filepath.Join(dir, "log"))
	if err != nil {
		t.Fatalf("read log dir: %v", err)
	}
	if len(files) != 1 {
		t.Fatalf("expected 1 log file, got %d", len(files))
	}

	data, err := os.ReadFile(filepath.Join(dir, "log", files[0].Name()))
	if err != nil {
		t.Fatalf("read log file: %v", err)
	}

	content := string(data)
	for _, want := range []string{"[INFO]", "[DEBUG]", "[WARN]", "[ERROR]", "hello world", "debug message", "warning 42", "file does not exist"} {
		if !strings.Contains(content, want) {
			t.Errorf("log missing %q\ncontent:\n%s", want, content)
		}
	}
}

// TestStdoutOnly 验证 dir 为空时只输出到标准输出，不产生日志文件。
func TestStdoutOnly(t *testing.T) {
	if err := Init("", "", INFO, true); err != nil {
		t.Fatalf("Init: %v", err)
	}
	defer Close()
	Infof("stdout test")
}

// TestMinLevel 验证低于 minLevel 的日志被过滤，不写入文件。
func TestMinLevel(t *testing.T) {
	dir := t.TempDir()

	if err := Init(dir, "test", WARN, false); err != nil {
		t.Fatalf("Init: %v", err)
	}
	defer Close()

	Debugf("should be filtered")
	Infof("should be filtered")
	Warnf("should appear")

	Sync()

	files, _ := os.ReadDir(filepath.Join(dir, "log"))
	data, _ := os.ReadFile(filepath.Join(dir, "log", files[0].Name()))
	content := string(data)

	if strings.Contains(content, "should be filtered") {
		t.Error("filtered messages should not appear in log")
	}
	if !strings.Contains(content, "should appear") {
		t.Error("warn message should appear in log")
	}
}

// TestSetLevel 验证运行时调整级别后，此前被过滤的级别开始生效。
func TestSetLevel(t *testing.T) {
	dir := t.TempDir()

	if err := Init(dir, "test", WARN, false); err != nil {
		t.Fatalf("Init: %v", err)
	}
	defer Close()

	Infof("should be filtered")
	if CurrentLevel() != WARN {
		t.Errorf("expected WARN level, got %v", CurrentLevel())
	}

	SetLevel(DEBUG)
	Infof("should now appear")
	if CurrentLevel() != DEBUG {
		t.Errorf("expected DEBUG level, got %v", CurrentLevel())
	}

	Sync()

	files, _ := os.ReadDir(filepath.Join(dir, "log"))
	data, _ := os.ReadFile(filepath.Join(dir, "log", files[0].Name()))
	content := string(data)

	if strings.Contains(content, "should be filtered") {
		t.Error("first message should be filtered")
	}
	if !strings.Contains(content, "should now appear") {
		t.Error("message after SetLevel should appear")
	}
}
