package log

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// Level re-exports zapcore.Level.
type Level = zapcore.Level

const (
	DEBUG  = zapcore.DebugLevel
	INFO   = zapcore.InfoLevel
	WARN   = zapcore.WarnLevel
	ERROR  = zapcore.ErrorLevel
	DPANIC = zapcore.DPanicLevel
	FATAL  = zapcore.FatalLevel
)

var (
	atom zap.AtomicLevel
	file *os.File
)

// Init initializes the global logger. Logs are written to dir/log/appName-YYYY-MM-DD.log.
// If dir is empty, logs are only written to stdout.
// Call Close() before the program exits to flush and close the log file.
func Init(dir, appName string, minLevel Level, stdout bool) error {
	atom = zap.NewAtomicLevelAt(minLevel)

	encoderConfig := zapcore.EncoderConfig{
		TimeKey:          "T",
		LevelKey:         "L",
		NameKey:          "N",
		CallerKey:        "C",
		MessageKey:       "M",
		StacktraceKey:    "S",
		LineEnding:       zapcore.DefaultLineEnding,
		EncodeLevel:      bracketedLevelEncoder,
		EncodeTime:       zapcore.TimeEncoderOfLayout("2006-01-02 15:04:05.000"),
		EncodeDuration:   zapcore.StringDurationEncoder,
		EncodeCaller:     zapcore.ShortCallerEncoder,
		ConsoleSeparator: " ",
	}

	var cores []zapcore.Core

	if dir != "" {
		logDir := filepath.Join(dir, "log")
		if err := os.MkdirAll(logDir, 0755); err != nil {
			return fmt.Errorf("create log dir: %w", err)
		}

		filename := time.Now().Format("2006-01-02") + ".log"
		if appName != "" {
			filename = appName + "-" + filename
		}

		var err error
		file, err = os.OpenFile(filepath.Join(logDir, filename), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			return fmt.Errorf("open log file: %w", err)
		}

		cores = append(cores, zapcore.NewCore(
			zapcore.NewConsoleEncoder(encoderConfig),
			zapcore.AddSync(file),
			atom,
		))
	}

	if stdout || len(cores) == 0 {
		cores = append(cores, zapcore.NewCore(
			zapcore.NewConsoleEncoder(encoderConfig),
			zapcore.AddSync(os.Stdout),
			atom,
		))
	}

	core := zapcore.NewTee(cores...)
	// AddCallerSkip(1) to skip our package-level wrapper functions (Info, Debug, etc.)
	// so the caller field points to user code, not log.go.
	logger := zap.New(core, zap.AddCaller(), zap.AddCallerSkip(1))

	zap.ReplaceGlobals(logger)
	return nil
}

// SetLevel dynamically changes the log level at runtime.
func SetLevel(lvl Level) {
	atom.SetLevel(lvl)
}

// CurrentLevel returns the current log level.
func CurrentLevel() Level {
	return atom.Level()
}

// Sync flushes buffered logs to disk.
func Sync() {
	_ = zap.L().Sync()
}

// Close flushes and closes the log file. Must be called before exit.
func Close() {
	Sync()
	if file != nil {
		file.Close()
		file = nil
	}
}

// Debug logs a debug message.
func Debug(format string, v ...any) {
	zap.S().Debugf(format, v...)
}

// Info logs an info message.
func Info(format string, v ...any) {
	zap.S().Infof(format, v...)
}

// Warn logs a warning message.
func Warn(format string, v ...any) {
	zap.S().Warnf(format, v...)
}

// Error logs an error message.
func Error(format string, v ...any) {
	zap.S().Errorf(format, v...)
}

// DPanic logs at DPanic level — panics in development, errors in production.
func DPanic(format string, v ...any) {
	zap.S().DPanicf(format, v...)
}

// Fatal logs a fatal message, syncs, and calls os.Exit(1).
func Fatal(format string, v ...any) {
	zap.S().Fatalf(format, v...)
}

func bracketedLevelEncoder(l zapcore.Level, enc zapcore.PrimitiveArrayEncoder) {
	enc.AppendString("[" + l.CapitalString() + "]")
}
