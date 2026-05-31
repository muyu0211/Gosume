package log

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInitAndLog(t *testing.T) {
	dir := t.TempDir()

	if err := Init(dir, "test", DEBUG, false); err != nil {
		t.Fatalf("Init: %v", err)
	}
	defer Close()

	Info("hello %s", "world")
	Debug("debug message")
	Warn("warning %d", 42)
	Error("something went wrong: %v", os.ErrNotExist)

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

func TestStdoutOnly(t *testing.T) {
	if err := Init("", "", INFO, true); err != nil {
		t.Fatalf("Init: %v", err)
	}
	defer Close()
	Info("stdout test")
}

func TestMinLevel(t *testing.T) {
	dir := t.TempDir()

	if err := Init(dir, "test", WARN, false); err != nil {
		t.Fatalf("Init: %v", err)
	}
	defer Close()

	Debug("should be filtered")
	Info("should be filtered")
	Warn("should appear")

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

func TestSetLevel(t *testing.T) {
	dir := t.TempDir()

	if err := Init(dir, "test", WARN, false); err != nil {
		t.Fatalf("Init: %v", err)
	}
	defer Close()

	Info("should be filtered")
	if CurrentLevel() != WARN {
		t.Errorf("expected WARN level, got %v", CurrentLevel())
	}

	SetLevel(DEBUG)
	Info("should now appear")
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
