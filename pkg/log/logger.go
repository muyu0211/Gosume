package log

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// Level 是 zapcore.Level 的再导出别名，调用方无需直接依赖 zap。
type Level = zapcore.Level

// 日志级别，由低到高。
const (
	DEBUG  = zapcore.DebugLevel
	INFO   = zapcore.InfoLevel
	WARN   = zapcore.WarnLevel
	ERROR  = zapcore.ErrorLevel
	DPANIC = zapcore.DPanicLevel
	FATAL  = zapcore.FatalLevel
)

var (
	// atom 保存可动态调整的日志级别，供 SetLevel 运行时修改。
	atom zap.AtomicLevel
	// file 是当前打开的日志文件句柄，Close 时释放。
	file *os.File
)

// Init 初始化全局 logger，日志写入 dir/log/appName-YYYY-MM-DD.log。程序退出前需调用 Close 刷盘并关闭文件。
//
// 参数：
//   - dir：数据目录；为空时只输出到标准输出
//   - appName：日志文件名前缀；为空时文件名仅含日期
//   - minLevel：最低输出级别，低于该级别的日志被丢弃
//   - stdout：是否同时输出到标准输出
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

	logger := zap.New(zapcore.NewTee(cores...), zap.AddCaller(), zap.AddCallerSkip(1))

	zap.ReplaceGlobals(logger)
	return nil
}

// SetLevel 运行时动态调整日志级别。
func SetLevel(lvl Level) {
	atom.SetLevel(lvl)
}

// CurrentLevel 返回当前日志级别。
func CurrentLevel() Level {
	return atom.Level()
}

// Sync 将缓冲中的日志刷写到磁盘。
func Sync() {
	_ = zap.L().Sync()
}

// Close 刷盘并关闭日志文件，程序退出前必须调用。
func Close() {
	Sync()
	if file != nil {
		file.Close()
		file = nil
	}
}

// Debug 输出 DEBUG 级别日志，format/v 语义同 fmt.Printf。
func Debug(format string, v ...any) {
	zap.S().Debugf(format, v...)
}

// Info 输出 INFO 级别日志，format/v 语义同 fmt.Printf。
func Info(format string, v ...any) {
	zap.S().Infof(format, v...)
}

// Warn 输出 WARN 级别日志，format/v 语义同 fmt.Printf。
func Warn(format string, v ...any) {
	zap.S().Warnf(format, v...)
}

// Error 输出 ERROR 级别日志，format/v 语义同 fmt.Printf。
func Error(format string, v ...any) {
	zap.S().Errorf(format, v...)
}

// DPanic 输出 DPANIC 级别日志：开发模式下 panic，生产模式下仅记录为错误。
func DPanic(format string, v ...any) {
	zap.S().DPanicf(format, v...)
}

// Fatal 输出 FATAL 级别日志，刷盘后调用 os.Exit(1)。
func Fatal(format string, v ...any) {
	zap.S().Fatalf(format, v...)
}

// bracketedLevelEncoder 把级别编码为带方括号的大写形式，如 [INFO]。
func bracketedLevelEncoder(l zapcore.Level, enc zapcore.PrimitiveArrayEncoder) {
	enc.AppendString("[" + l.CapitalString() + "]")
}
