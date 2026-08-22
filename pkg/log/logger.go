package log

import (
	"context"
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

// ctxKey 是日志上下文字段的 key 类型，使用私有空结构体避免与其它包
// 的字符串 key 冲突。
type ctxKey struct{}

// 从 context.Context 中提取的约定字段 key。调用方通过 ctx.WithValue 写入，
// 再经 WithCtx 自动绑定到日志字段。
var (
	// ctxTraceID 对应链路追踪 ID。
	ctxTraceID = ctxKey{}
	// ctxUserID 对应用户 ID。
	ctxUserID = ctxKey{}
)

// withCtx 返回一个携带了 ctx 中约定字段的 logger。
//
// 从 ctx 提取 trace_id / user_id 等字段，通过 zap.L().With(...) 绑定，
// 之后每次调用都会自动附带这些字段，无需重复传入。ctx 为 nil 或无字段时
// 返回全局 logger 本身（零开销）。
//
// 用法：
//
//	log.withCtx(ctx).Info("处理请求", zap.String("step", "render"))
//
// 字段写入约定（调用方）：
//
//	ctx = context.WithValue(ctx, log.TraceIDKey(), "abc123")
func withCtx(ctx context.Context) *zap.Logger {
	if ctx == nil {
		return zap.L()
	}
	var fields []zap.Field
	if v, ok := ctx.Value(ctxTraceID).(string); ok && v != "" {
		fields = append(fields, zap.String("trace_id", v))
	}
	if v, ok := ctx.Value(ctxUserID).(string); ok && v != "" {
		fields = append(fields, zap.String("user_id", v))
	}
	if len(fields) == 0 {
		return zap.L()
	}
	return zap.L().With(fields...)
}

// TraceIDKey 返回 trace_id 字段的 context key，供调用方写入 ctx。
func TraceIDKey() any { return ctxTraceID }

// UserIDKey 返回 user_id 字段的 context key，供调用方写入 ctx。
func UserIDKey() any { return ctxUserID }

// Close 刷盘并关闭日志文件，程序退出前必须调用。
func Close() {
	Sync()
	if file != nil {
		file.Close()
		file = nil
	}
}

// Debugf 输出 DEBUG 级别日志，format/v 语义同 fmt.Printf。
func Debugf(format string, v ...any) {
	zap.S().Debugf(format, v...)
}

// Infof 输出 INFO 级别日志，format/v 语义同 fmt.Printf。
func Infof(format string, v ...any) {
	zap.S().Infof(format, v...)
}

// Warnf 输出 WARN 级别日志，format/v 语义同 fmt.Printf。
func Warnf(format string, v ...any) {
	zap.S().Warnf(format, v...)
}

// Errorf 输出 ERROR 级别日志，format/v 语义同 fmt.Printf。
func Errorf(format string, v ...any) {
	zap.S().Errorf(format, v...)
}

// DPanicf 输出 DPANIC 级别日志：开发模式下 panic，生产模式下仅记录为错误。
func DPanicf(format string, v ...any) {
	zap.S().DPanicf(format, v...)
}

// Fatalf 输出 FATAL 级别日志，刷盘后调用 os.Exit(1)。
func Fatalf(format string, v ...any) {
	zap.S().Fatalf(format, v...)
}

// DebugContextf 输出 DEBUG 级别日志，并携带 ctx 中约定的字段。
// format/v 语义同 fmt.Printf。
func DebugContextf(ctx context.Context, format string, v ...any) {
	withCtx(ctx).Sugar().Debugf(format, v...)
}

// InfoContextf 输出 INFO 级别日志，并携带 ctx 中约定的字段。
// format/v 语义同 fmt.Printf。
func InfoContextf(ctx context.Context, format string, v ...any) {
	withCtx(ctx).Sugar().Infof(format, v...)
}

// WarnContextf 输出 WARN 级别日志，并携带 ctx 中约定的字段。
// format/v 语义同 fmt.Printf。
func WarnContextf(ctx context.Context, format string, v ...any) {
	withCtx(ctx).Sugar().Warnf(format, v...)
}

// ErrorContextf 输出 ERROR 级别日志，并携带 ctx 中约定的字段。
// format/v 语义同 fmt.Printf。
func ErrorContextf(ctx context.Context, format string, v ...any) {
	withCtx(ctx).Sugar().Errorf(format, v...)
}

// DPanicContextf 输出 DPANIC 级别日志（开发模式 panic，生产模式仅记录），
// 并携带 ctx 中约定的字段。format/v 语义同 fmt.Printf。
func DPanicContextf(ctx context.Context, format string, v ...any) {
	withCtx(ctx).Sugar().DPanicf(format, v...)
}

// FatalContextf 输出 FATAL 级别日志（刷盘后 os.Exit(1)），并携带 ctx 中
// 约定的字段。format/v 语义同 fmt.Printf。
func FatalContextf(ctx context.Context, format string, v ...any) {
	withCtx(ctx).Sugar().Fatalf(format, v...)
}

// bracketedLevelEncoder 把级别编码为带方括号的大写形式，如 [INFO]。
func bracketedLevelEncoder(l zapcore.Level, enc zapcore.PrimitiveArrayEncoder) {
	enc.AppendString("[" + l.CapitalString() + "]")
}
