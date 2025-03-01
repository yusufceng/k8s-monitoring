package config

import (
	"os"
	"strconv"
)

// Config yapısı, uygulama konfigürasyonunu tutar
type Config struct {
	Database DatabaseConfig
	Server   ServerConfig
}

// DatabaseConfig, veritabanı ayarlarını tutar
type DatabaseConfig struct {
	Path string
}

// ServerConfig, HTTP sunucu ayarlarını tutar
type ServerConfig struct {
	Port     int
	LogLevel string
}

// LoadConfig, ortam değişkenlerinden konfigürasyonu yükler
func LoadConfig() *Config {
	return &Config{
		Database: DatabaseConfig{
			Path: getEnv("DB_PATH", "/data/monitoring.db"),
		},
		Server: ServerConfig{
			Port:     getEnvAsInt("SERVER_PORT", 8080),
			LogLevel: getEnv("LOG_LEVEL", "info"),
		},
	}
}

// getEnv, ortam değişkenini okur veya varsayılan değeri döner
func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

// getEnvAsInt, ortam değişkenini int olarak okur
func getEnvAsInt(key string, defaultValue int) int {
	valueStr := getEnv(key, "")
	if value, err := strconv.Atoi(valueStr); err == nil {
		return value
	}
	return defaultValue
}
