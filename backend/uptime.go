package main

import (
	"context"
	"crypto/tls"
	"database/sql"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// UptimeCheckType tanımları
type UptimeCheckType string

const (
	CheckTypeHTTP UptimeCheckType = "http"
	CheckTypeTCP  UptimeCheckType = "tcp"
	CheckTypeDNS  UptimeCheckType = "dns"
)

// UptimeCheckConfig, servis izleme yapılandırması
type UptimeCheckConfig struct {
	ServiceID     int
	Name          string
	Namespace     string
	Cluster       string
	Endpoint      string
	CheckType     UptimeCheckType
	CheckInterval int // saniye cinsinden
	Timeout       time.Duration
}

// UptimeCheckResult, tek bir kontrol sonucunu temsil eder
type UptimeCheckResult struct {
	ServiceID    int
	Status       string
	ResponseTime int64 // milisaniye
	ErrorMessage string
	Timestamp    time.Time
}

// UptimeMonitor, tüm izleme işlemlerini yönetir
type UptimeMonitor struct {
	db          *sql.DB
	configs     []UptimeCheckConfig
	cancelFuncs []context.CancelFunc
	configMutex sync.RWMutex
}

// NewUptimeMonitor, yeni bir izleme örneği oluşturur
func NewUptimeMonitor(db *sql.DB) *UptimeMonitor {
	return &UptimeMonitor{
		db:          db,
		configs:     []UptimeCheckConfig{},
		cancelFuncs: []context.CancelFunc{},
	}
}

// loadServiceConfigs, veritabanından izlenecek servisleri yükler
func (m *UptimeMonitor) loadServiceConfigs() error {
	rows, err := m.db.Query(`
		SELECT id, name, namespace, cluster, endpoint, 
		       COALESCE(check_interval, 60) as check_interval 
		FROM services 
		WHERE endpoint IS NOT NULL AND endpoint != ''
	`)
	if err != nil {
		return fmt.Errorf("servis yapılandırmaları yüklenemedi: %v", err)
	}
	defer rows.Close()

	m.configMutex.Lock()
	defer m.configMutex.Unlock()
	m.configs = []UptimeCheckConfig{}

	for rows.Next() {
		var config UptimeCheckConfig
		var endpoint string

		err := rows.Scan(
			&config.ServiceID,
			&config.Name,
			&config.Namespace,
			&config.Cluster,
			&endpoint,
			&config.CheckInterval,
		)
		if err != nil {
			log.Printf("Servis yapılandırması okunurken hata: %v", err)
			continue
		}

		// Endpoint türünü belirle
		if strings.HasPrefix(endpoint, "http://") || strings.HasPrefix(endpoint, "https://") {
			config.CheckType = CheckTypeHTTP
		} else if strings.Contains(endpoint, ":") {
			config.CheckType = CheckTypeTCP
		} else {
			config.CheckType = CheckTypeDNS
		}

		config.Endpoint = endpoint
		config.Timeout = 10 * time.Second

		m.configs = append(m.configs, config)
	}

	return nil
}

// saveCheckResult, kontrol sonucunu veritabanına kaydeder
func (m *UptimeMonitor) saveCheckResult(result UptimeCheckResult) error {
	_, err := m.db.Exec(`
		INSERT INTO uptime_checks 
		(service_id, status, response_time, error_message, timestamp)
		VALUES (?, ?, ?, ?, ?)
	`, result.ServiceID, result.Status, result.ResponseTime,
		result.ErrorMessage, result.Timestamp)

	return err
}

// performHTTPCheck, HTTP/HTTPS endpoint kontrolü yapar
func (m *UptimeMonitor) performHTTPCheck(config UptimeCheckConfig) UptimeCheckResult {
	start := time.Now()
	result := UptimeCheckResult{
		ServiceID: config.ServiceID,
		Timestamp: start,
		Status:    "down",
	}

	// TLS sertifika hatalarını atlamak için özel bir HTTP istemcisi
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
	client := &http.Client{
		Transport: tr,
		Timeout:   config.Timeout,
	}

	resp, err := client.Get(config.Endpoint)
	if err != nil {
		result.ErrorMessage = fmt.Sprintf("Bağlantı hatası: %v", err)
		return result
	}
	defer resp.Body.Close()

	// Yanıt süresi hesaplama
	duration := time.Since(start)
	result.ResponseTime = duration.Milliseconds()

	// Başarılı HTTP yanıtları (200-299 arası)
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		result.Status = "up"
		result.ErrorMessage = ""
	} else {
		result.ErrorMessage = fmt.Sprintf("HTTP hata kodu: %d", resp.StatusCode)
	}

	return result
}

// performTCPCheck, TCP bağlantı kontrolü yapar
func (m *UptimeMonitor) performTCPCheck(config UptimeCheckConfig) UptimeCheckResult {
	start := time.Now()
	result := UptimeCheckResult{
		ServiceID: config.ServiceID,
		Timestamp: start,
		Status:    "down",
	}

	conn, err := net.DialTimeout("tcp", config.Endpoint, config.Timeout)
	if err != nil {
		result.ErrorMessage = fmt.Sprintf("TCP bağlantı hatası: %v", err)
		return result
	}
	defer conn.Close()

	// Yanıt süresi hesaplama
	duration := time.Since(start)
	result.ResponseTime = duration.Milliseconds()
	result.Status = "up"

	return result
}

// performDNSCheck, DNS çözümleme kontrolü yapar
func (m *UptimeMonitor) performDNSCheck(config UptimeCheckConfig) UptimeCheckResult {
	start := time.Now()
	result := UptimeCheckResult{
		ServiceID: config.ServiceID,
		Timestamp: start,
		Status:    "down",
	}

	_, err := net.LookupIP(config.Endpoint)
	if err != nil {
		result.ErrorMessage = fmt.Sprintf("DNS çözümleme hatası: %v", err)
		return result
	}

	// Yanıt süresi hesaplama
	duration := time.Since(start)
	result.ResponseTime = duration.Milliseconds()
	result.Status = "up"

	return result
}

// startServiceMonitoring, belirli bir servis için izleme başlatır
func (m *UptimeMonitor) startServiceMonitoring(config UptimeCheckConfig) {
	ctx, cancel := context.WithCancel(context.Background())
	m.cancelFuncs = append(m.cancelFuncs, cancel)

	go func() {
		ticker := time.NewTicker(time.Duration(config.CheckInterval) * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				var result UptimeCheckResult

				// Kontrol türüne göre ilgili metodu çağır
				switch config.CheckType {
				case CheckTypeHTTP:
					result = m.performHTTPCheck(config)
				case CheckTypeTCP:
					result = m.performTCPCheck(config)
				case CheckTypeDNS:
					result = m.performDNSCheck(config)
				default:
					log.Printf("Desteklenmeyen kontrol türü: %v", config.CheckType)
					continue
				}

				// Sonucu kaydet
				err := m.saveCheckResult(result)
				if err != nil {
					log.Printf("Kontrol sonucu kaydedilemedi: %v", err)
				}

				// Hata durumunda log at
				if result.Status == "down" {
					log.Printf("Servis %d durumu: %s - %s",
						result.ServiceID, result.Status, result.ErrorMessage)
				}
			}
		}
	}()
}

// StartUptimeMonitoring, tüm servislerin izlemesini başlatır
func (m *UptimeMonitor) StartUptimeMonitoring() error {
	// Servis yapılandırmalarını yükle
	err := m.loadServiceConfigs()
	if err != nil {
		return fmt.Errorf("servis yapılandırmaları yüklenemedi: %v", err)
	}

	// Her bir servis için izlemeyi başlat
	for _, config := range m.configs {
		m.startServiceMonitoring(config)
	}

	log.Printf("%d servis için uptime izlemesi başlatıldı", len(m.configs))
	return nil
}

// StopUptimeMonitoring, tüm izleme işlemlerini durdurur
func (m *UptimeMonitor) StopUptimeMonitoring() {
	m.configMutex.Lock()
	defer m.configMutex.Unlock()

	for _, cancel := range m.cancelFuncs {
		cancel()
	}
	m.cancelFuncs = []context.CancelFunc{}
	log.Println("Uptime izlemesi durduruldu")
}
