package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// UptimeCheckType tanımları
type UptimeCheckType string

const (
	CheckTypeHTTP        UptimeCheckType = "http"
	CheckTypeTCP         UptimeCheckType = "tcp"
	CheckTypeDNS         UptimeCheckType = "dns"
	CheckTypeCertificate UptimeCheckType = "certificate"
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

	// HTTP kontrolü için ek alanlar
	ExpectedStatusCode int
	ExpectedContent    string
	Headers            map[string]string
	Username           string
	Password           string

	// SSL kontrolü için
	SSLCheck       bool
	SSLWarningDays int  // Sertifika son kullanma uyarısı - kaç gün öncesinden
	InsecureSkip   bool // TLS doğrulamasını atla
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
		config.SSLWarningDays = 30 // Varsayılan olarak 30 gün
		config.Headers = make(map[string]string)

		// HTTPS için SSL kontrolünü varsayılan olarak etkinleştir
		if strings.HasPrefix(endpoint, "https://") {
			config.SSLCheck = true
		}

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
		TLSClientConfig: &tls.Config{InsecureSkipVerify: config.InsecureSkip},
	}
	client := &http.Client{
		Transport: tr,
		Timeout:   config.Timeout,
	}

	req, err := http.NewRequest("GET", config.Endpoint, nil)
	if err != nil {
		result.ErrorMessage = fmt.Sprintf("İstek oluşturma hatası: %v", err)
		return result
	}

	// Basic Auth ekle (varsa)
	if config.Username != "" && config.Password != "" {
		req.SetBasicAuth(config.Username, config.Password)
	}

	// Özel headerlar ekle (varsa)
	for key, value := range config.Headers {
		req.Header.Add(key, value)
	}

	resp, err := client.Do(req)
	if err != nil {
		result.ErrorMessage = fmt.Sprintf("Bağlantı hatası: %v", err)
		return result
	}
	defer resp.Body.Close()

	// Yanıt süresi hesaplama
	duration := time.Since(start)
	result.ResponseTime = duration.Milliseconds()

	// Yanıt kodunu kontrol et (özel beklenen kod varsa)
	if config.ExpectedStatusCode > 0 && resp.StatusCode != config.ExpectedStatusCode {
		result.Status = "down"
		result.ErrorMessage = fmt.Sprintf("Beklenen durum kodu %d, alınan %d", config.ExpectedStatusCode, resp.StatusCode)
		return result
	}

	// Genel başarılı HTTP yanıtları kontrolü (özel kod belirtilmemişse)
	if config.ExpectedStatusCode == 0 && (resp.StatusCode < 200 || resp.StatusCode >= 300) {
		result.Status = "down"
		result.ErrorMessage = fmt.Sprintf("HTTP hata kodu: %d", resp.StatusCode)
		return result
	}

	// İçerik kontrolü (belirtilmişse)
	if config.ExpectedContent != "" {
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			result.Status = "down"
			result.ErrorMessage = fmt.Sprintf("İçerik okuma hatası: %v", err)
			return result
		}

		bodyStr := string(body)
		if !strings.Contains(bodyStr, config.ExpectedContent) {
			result.Status = "down"
			result.ErrorMessage = "Beklenen içerik bulunamadı"
			return result
		}
	}

	result.Status = "up"
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

// performCertificateCheck, HTTPS sertifikalarının geçerliliğini kontrol eder
func (m *UptimeMonitor) performCertificateCheck(config UptimeCheckConfig) UptimeCheckResult {
	start := time.Now()
	result := UptimeCheckResult{
		ServiceID: config.ServiceID,
		Timestamp: start,
		Status:    "down",
	}

	// URL'den host kısmını çıkar
	hostURL, err := url.Parse(config.Endpoint)
	if err != nil {
		result.ErrorMessage = fmt.Sprintf("URL ayrıştırma hatası: %v", err)
		return result
	}

	// Bu kolaylıkla host + port formatını verir
	host := hostURL.Host
	// Port belirtilmemişse 443 ekle
	if !strings.Contains(host, ":") {
		host = host + ":443"
	}

	// TLS bağlantısı kur
	conn, err := tls.Dial("tcp", host, &tls.Config{
		InsecureSkipVerify: config.InsecureSkip,
	})
	if err != nil {
		result.ErrorMessage = fmt.Sprintf("TLS bağlantı hatası: %v", err)
		return result
	}
	defer conn.Close()

	// Sertifikaları kontrol et
	certs := conn.ConnectionState().PeerCertificates
	if len(certs) == 0 {
		result.ErrorMessage = "Sertifika bulunamadı"
		return result
	}

	// İlk (sunucu) sertifikayı kontrol et
	cert := certs[0]
	now := time.Now()

	// Son kullanma tarihini kontrol et
	if now.After(cert.NotAfter) {
		result.ErrorMessage = fmt.Sprintf("Sertifika %s tarihinde süresi dolmuş", cert.NotAfter.Format("2006-01-02"))
		return result
	}

	// Geçerlilik başlangıcını kontrol et
	if now.Before(cert.NotBefore) {
		result.ErrorMessage = fmt.Sprintf("Sertifika %s tarihine kadar geçerli değil", cert.NotBefore.Format("2006-01-02"))
		return result
	}

	// CN/SAN kontrolü
	if !verifyHostname(hostURL.Hostname(), cert) {
		result.ErrorMessage = fmt.Sprintf("Sertifika adı doğrulanamadı: %s", hostURL.Hostname())
		return result
	}

	// Son kullanma tarihine yakınlık kontrolü (config'den SSLWarningDays'e göre)
	daysLeft := int(cert.NotAfter.Sub(now).Hours() / 24)
	if daysLeft < config.SSLWarningDays {
		result.Status = "warning"
		result.ErrorMessage = fmt.Sprintf("Sertifikanın süresinin dolmasına %d gün kaldı", daysLeft)
		return result
	}

	// Yanıt süresi hesaplama
	duration := time.Since(start)
	result.ResponseTime = duration.Milliseconds()
	result.Status = "up"

	return result
}

// verifyHostname, sertifikada hostname doğrulaması yapar
func verifyHostname(hostname string, cert *x509.Certificate) bool {
	// Common Name kontrolü
	if cert.Subject.CommonName == hostname {
		return true
	}

	// SubjectAltName kontrolü
	for _, san := range cert.DNSNames {
		if san == hostname {
			return true
		}
		// Wildcard sertifikaları için kontrol
		if strings.HasPrefix(san, "*.") {
			domain := san[2:]
			if strings.HasSuffix(hostname, domain) && strings.Count(hostname, ".") == strings.Count(domain, ".")+1 {
				return true
			}
		}
	}

	return false
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
				case CheckTypeCertificate:
					result = m.performCertificateCheck(config)
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

// CalculateUptimePercentage, belirli bir servis için uptime yüzdesini hesaplar.
// Bu hesaplama, uptime_checks tablosundaki tüm kayıtlar üzerinden yapılır.
func (m *UptimeMonitor) CalculateUptimePercentage(serviceID int) (float64, error) {
	var totalChecks int
	var upChecks int

	// Toplam kontrol sayısını al
	err := m.db.QueryRow(`SELECT COUNT(*) FROM uptime_checks WHERE service_id = ?`, serviceID).Scan(&totalChecks)
	if err != nil {
		return 0, fmt.Errorf("kontrol sayısı alınamadı: %v", err)
	}
	if totalChecks == 0 {
		return 0, nil // Kayıt yoksa yüzde 0 döndür
	}

	// "up" statüsünde olan kontrol sayısını al
	err = m.db.QueryRow(`SELECT COUNT(*) FROM uptime_checks WHERE service_id = ? AND status = 'up'`, serviceID).Scan(&upChecks)
	if err != nil {
		return 0, fmt.Errorf("up kontrolleri alınamadı: %v", err)
	}

	percentage := (float64(upChecks) / float64(totalChecks)) * 100.0
	return percentage, nil
}
