package handlers

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
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

// UptimeCheckConfig, test yapılandırması
type UptimeCheckConfig struct {
	Endpoint           string
	CheckType          UptimeCheckType
	Timeout            time.Duration
	ExpectedStatusCode int
	ExpectedContent    string
	Username           string
	Password           string
	Headers            map[string]string
	SSLCheck           bool
	SSLWarningDays     int
	InsecureSkip       bool
}

// UptimeCheckResult, test sonucu
type UptimeCheckResult struct {
	Status       string `json:"status"`
	ResponseTime int64  `json:"responseTime,omitempty"`
	ErrorMessage string `json:"errorMessage,omitempty"`
	Timestamp    string `json:"timestamp"`
}

// HandleUptimeTest, uptime test endpoint'i için handler
func HandleUptimeTest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// CORS ayarları - geliştirme sırasında yararlı olabilir
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	// OPTIONS isteğine yanıt ver ve dön
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Sadece POST isteklerini kabul et
	if r.Method != "POST" {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	// JSON isteğini çöz
	var config struct {
		Endpoint           string `json:"endpoint"`
		CheckType          string `json:"checkType"`
		Timeout            int    `json:"timeout"`
		ExpectedStatusCode int    `json:"expectedStatusCode"`
		ExpectedContent    string `json:"expectedContent"`
		Username           string `json:"username"`
		Password           string `json:"password"`
		SSLCheck           bool   `json:"sslCheck"`
		SSLWarningDays     int    `json:"sslWarningDays"`
		InsecureSkip       bool   `json:"insecureSkip"`
	}

	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		http.Error(w, `{"error":"İstek gövdesi ayrıştırılamadı"}`, http.StatusBadRequest)
		return
	}

	// Temel doğrulama
	if config.Endpoint == "" {
		http.Error(w, `{"error":"Endpoint gerekli"}`, http.StatusBadRequest)
		return
	}

	// UptimeCheckConfig oluştur
	uptimeConfig := UptimeCheckConfig{
		Endpoint:           config.Endpoint,
		CheckType:          UptimeCheckType(config.CheckType),
		Timeout:            time.Duration(config.Timeout) * time.Second,
		ExpectedStatusCode: config.ExpectedStatusCode,
		ExpectedContent:    config.ExpectedContent,
		SSLCheck:           config.SSLCheck,
		SSLWarningDays:     config.SSLWarningDays,
		InsecureSkip:       config.InsecureSkip,
		Headers:            make(map[string]string),
	}

	// Basic Auth varsa ekle
	if config.Username != "" && config.Password != "" {
		uptimeConfig.Username = config.Username
		uptimeConfig.Password = config.Password
	}

	// Kontrol türüne göre kontrol yap
	var result UptimeCheckResult

	switch uptimeConfig.CheckType {
	case CheckTypeHTTP:
		result = performHTTPCheck(uptimeConfig)
	case CheckTypeTCP:
		result = performTCPCheck(uptimeConfig)
	case CheckTypeDNS:
		result = performDNSCheck(uptimeConfig)
	case CheckTypeCertificate:
		result = performCertificateCheck(uptimeConfig)
	default:
		http.Error(w, `{"error":"Desteklenmeyen kontrol türü"}`, http.StatusBadRequest)
		return
	}

	// Zaman damgasını ekle
	result.Timestamp = time.Now().Format(time.RFC3339)

	// Sonucu JSON olarak döndür
	json.NewEncoder(w).Encode(result)
}

// performHTTPCheck, HTTP/HTTPS endpoint kontrolü yapar
func performHTTPCheck(config UptimeCheckConfig) UptimeCheckResult {
	start := time.Now()
	result := UptimeCheckResult{
		Status: "down",
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
func performTCPCheck(config UptimeCheckConfig) UptimeCheckResult {
	start := time.Now()
	result := UptimeCheckResult{
		Status: "down",
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
func performDNSCheck(config UptimeCheckConfig) UptimeCheckResult {
	start := time.Now()
	result := UptimeCheckResult{
		Status: "down",
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
func performCertificateCheck(config UptimeCheckConfig) UptimeCheckResult {
	start := time.Now()
	result := UptimeCheckResult{
		Status: "down",
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

	// Son kullanma tarihine yakınlık kontrolü
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
