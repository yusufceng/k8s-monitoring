package logger

import (
	"fmt"
	"os"
	"strings"
)

// LogLevel, loglama seviyesini belirtir
type LogLevel int

const (
	// LogLevelDebug, debug seviyesi
	LogLevelDebug LogLevel = iota
	// LogLevelInfo, info seviyesi
	LogLevelInfo
	// LogLevelWarn, warning seviyesi
	LogLevelWarn
	// LogLevelError, error seviyesi
	LogLevelError
	// LogLevelFatal, fatal error seviyesi
	LogLevelFatal
)

// Logger, loglama işlemlerini yönetir
type Logger struct {
	level LogLevel
}

// New, yeni bir Logger oluşturur
func New(levelStr string) *Logger {
	level := parseLogLevel(levelStr)
	return &Logger{
		level: level,
	}
}

// parseLogLevel, string log seviyesini LogLevel enum tipine dönüştürür
func parseLogLevel(levelStr string) LogLevel {
	switch strings.ToLower(levelStr) {
	case "debug":
		return LogLevelDebug
	case "info":
		return LogLevelInfo
	case "warn", "warning":
		return LogLevelWarn
	case "error":
		return LogLevelError
	case "fatal":
		return LogLevelFatal
	default:
		return LogLevelInfo // varsayılan olarak info seviyesi
	}
}

// Info, info seviyesinde log yazdırır
func (l *Logger) Info(format string, args ...interface{}) {
	if l.level <= LogLevelInfo {
		fmt.Printf("[INFO] "+format+"\n", args...)
	}
}

// Error, error seviyesinde log yazdırır
func (l *Logger) Error(format string, args ...interface{}) {
	if l.level <= LogLevelError {
		fmt.Printf("[ERROR] "+format+"\n", args...)
	}
}

// Fatal, fatal error seviyesinde log yazdırır ve uygulamayı sonlandırır
func (l *Logger) Fatal(format string, args ...interface{}) {
	fmt.Printf("[FATAL] "+format+"\n", args...)
	os.Exit(1)
}
