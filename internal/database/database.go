package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3" // SQLite driver
)

// InitDB, SQLite veritabanını başlatır
func InitDB(dbPath string) (*sql.DB, error) {
	// Veritabanı dizininin var olduğundan emin ol
	dbDir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		return nil, fmt.Errorf("veritabanı dizini oluşturulamadı: %w", err)
	}

	// Veritabanına bağlan
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("veritabanına bağlanılamadı: %w", err)
	}

	// Bağlantıyı test et
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("veritabanı bağlantısı test edilemedi: %w", err)
	}

	return db, nil
}

// RunMigrations, veritabanı tablolarını oluşturur
func RunMigrations(db *sql.DB) error {
	// services tablosu
	_, err := db.Exec(`
	CREATE TABLE IF NOT EXISTS services (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		namespace TEXT NOT NULL,
		cluster TEXT NOT NULL,
		type TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return fmt.Errorf("services tablosu oluşturulamadı: %w", err)
	}

	return nil
}
