package main

import (
	"backend/internal/api/routes"
	"backend/internal/config"
	"backend/internal/database"
	"backend/pkg/logger"
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	// Konfigürasyonu yükle
	cfg := config.LoadConfig()

	// Logger başlat
	l := logger.New(cfg.Server.LogLevel)
	l.Info("K8s Monitoring başlatılıyor...")

	// Veritabanı bağlantısını aç
	db, err := database.InitDB(cfg.Database.Path)
	if err != nil {
		l.Fatal("Veritabanı başlatılamadı: %v", err)
	}
	defer db.Close()

	// Veritabanı migrationlarını çalıştır
	if err := database.RunMigrations(db); err != nil {
		l.Fatal("Veritabanı migrasyonları çalıştırılamadı: %v", err)
	}

	// API Router'ı oluştur
	router := routes.NewRouter(db, l)

	// HTTP sunucusunu başlat
	server := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.Server.Port),
		Handler: router,
	}

	// Sunucuyu arka planda başlat
	go func() {
		l.Info("HTTP sunucusu %d portunda dinleniyor", cfg.Server.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			l.Fatal("HTTP sunucusu hatası: %v", err)
		}
	}()

	// Graceful shutdown için sinyal dinle
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	l.Info("Sunucu kapatılıyor...")

	// Sunucuyu 30 saniye içinde kapat
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		l.Fatal("Sunucu zorla kapatıldı: %v", err)
	}

	l.Info("Sunucu başarıyla kapatıldı")

}
