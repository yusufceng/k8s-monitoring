package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

	"backend/api/handlers" // Bu handler'ları içeri aktarır
)

// Küresel değişkenler
var (
	db            *sql.DB
	clientset     *kubernetes.Clientset
	ctx           = context.Background()
	uptimeMonitor *UptimeMonitor // Global uptime monitor
)

// Veritabanı bağlantısını başlat
func initDB() (*sql.DB, error) {
	// Veritabanı yolunu al
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "/data/monitoring.db"
	}

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

// Veritabanı tablolarını oluştur
func createTables(db *sql.DB) error {
	// services tablosu
	_, err := db.Exec(`
	CREATE TABLE IF NOT EXISTS services (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		namespace TEXT NOT NULL,
		cluster TEXT NOT NULL,
		type TEXT NOT NULL,
		endpoint TEXT,
		check_interval INTEGER DEFAULT 60,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(name, namespace, cluster)
	)`)
	if err != nil {
		return fmt.Errorf("services tablosu oluşturulamadı: %w", err)
	}

	// uptime_checks tablosu
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS uptime_checks (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		service_id INTEGER NOT NULL,
		status TEXT NOT NULL,
		response_time INTEGER,
		error_message TEXT,
		timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(service_id) REFERENCES services(id)
	)`)
	if err != nil {
		return fmt.Errorf("uptime_checks tablosu oluşturulamadı: %w", err)
	}

	// settings tablosu
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return fmt.Errorf("settings tablosu oluşturulamadı: %w", err)
	}

	// clusters tablosu
	_, err = db.Exec(`
	CREATE TABLE IF NOT EXISTS clusters (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		api_url TEXT NOT NULL,
		auth_type TEXT NOT NULL, -- 'token', 'kubeconfig', vs.
		token TEXT,
		ca_cert TEXT,
		skip_tls_verify INTEGER DEFAULT 0,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return fmt.Errorf("clusters tablosu oluşturulamadı: %w", err)
	}

	// services tablosuna cluster_id ekle (hata olsa bile devam et)
	_, err = db.Exec(`
    ALTER TABLE services ADD COLUMN cluster_id INTEGER DEFAULT 1 REFERENCES clusters(id)
    `)
	// Hata oluşursa (zaten eklenmiş olabilir), görmezden gel

	return nil
}

// clustersHandler, cluster yönetimi endpoint'i
func clustersHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		// Tüm cluster'ları getir
		rows, err := db.Query("SELECT id, name, api_url, auth_type, skip_tls_verify FROM clusters")
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"Veritabanı sorgusu başarısız: %v"}`, err), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		clusters := []map[string]interface{}{}

		for rows.Next() {
			var id int
			var name, apiURL, authType string
			var skipTLSVerify int
			if err := rows.Scan(&id, &name, &apiURL, &authType, &skipTLSVerify); err != nil {
				http.Error(w, fmt.Sprintf(`{"error":"Veri okunamadı: %v"}`, err), http.StatusInternalServerError)
				return
			}

			clusters = append(clusters, map[string]interface{}{
				"id":              id,
				"name":            name,
				"api_url":         apiURL,
				"auth_type":       authType,
				"skip_tls_verify": skipTLSVerify == 1,
			})
		}

		response := map[string]interface{}{
			"clusters": clusters,
		}
		json.NewEncoder(w).Encode(response)

	case "POST":
		// Yeni cluster ekle
		var cluster struct {
			Name          string `json:"name"`
			ApiURL        string `json:"api_url"`
			AuthType      string `json:"auth_type"`
			Token         string `json:"token"`
			CACert        string `json:"ca_cert"`
			SkipTLSVerify bool   `json:"skip_tls_verify"`
		}

		if err := json.NewDecoder(r.Body).Decode(&cluster); err != nil {
			http.Error(w, `{"error":"İstek gövdesi ayrıştırılamadı"}`, http.StatusBadRequest)
			return
		}

		// Gerekli alanları kontrol et
		if cluster.Name == "" || cluster.ApiURL == "" || cluster.AuthType == "" {
			http.Error(w, `{"error":"Name, api_url ve auth_type alanları gerekli"}`, http.StatusBadRequest)
			return
		}

		// Token auth type için token kontrolü
		if cluster.AuthType == "token" && cluster.Token == "" {
			http.Error(w, `{"error":"Token auth type için token gerekli"}`, http.StatusBadRequest)
			return
		}

		// Veritabanına kaydet
		skipTLSVerify := 0
		if cluster.SkipTLSVerify {
			skipTLSVerify = 1
		}

		result, err := db.Exec(`
			INSERT INTO clusters (name, api_url, auth_type, token, ca_cert, skip_tls_verify)
			VALUES (?, ?, ?, ?, ?, ?)
		`, cluster.Name, cluster.ApiURL, cluster.AuthType, cluster.Token, cluster.CACert, skipTLSVerify)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"Cluster eklenemedi: %v"}`, err), http.StatusInternalServerError)
			return
		}

		// Yeni cluster ID'sini al
		id, _ := result.LastInsertId()

		// Test bağlantısı
		go func() {
			// Test cluster bağlantısı
			testConnection(int(id))
		}()

		// Başarılı yanıt
		response := map[string]interface{}{
			"id":      id,
			"message": "Cluster başarıyla eklendi",
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(response)

	default:
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

// clusterHandler, belirli bir cluster için işlemler
func clusterHandler(w http.ResponseWriter, r *http.Request) {
	// URL'den cluster ID parametresini al
	idStr := r.URL.Path[len("/api/v1/clusters/"):]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, `{"error":"Geçersiz cluster ID"}`, http.StatusBadRequest)
		return
	}

	switch r.Method {
	case "GET":
		// Cluster detaylarını getir
		var cluster struct {
			ID            int    `json:"id"`
			Name          string `json:"name"`
			ApiURL        string `json:"api_url"`
			AuthType      string `json:"auth_type"`
			SkipTLSVerify bool   `json:"skip_tls_verify"`
			Status        string `json:"status"`
		}

		err := db.QueryRow(`
			SELECT id, name, api_url, auth_type, skip_tls_verify
			FROM clusters WHERE id = ?
		`, id).Scan(&cluster.ID, &cluster.Name, &cluster.ApiURL, &cluster.AuthType, &cluster.SkipTLSVerify)

		if err != nil {
			if err == sql.ErrNoRows {
				http.Error(w, `{"error":"Cluster bulunamadı"}`, http.StatusNotFound)
			} else {
				http.Error(w, fmt.Sprintf(`{"error":"Veritabanı hatası: %v"}`, err), http.StatusInternalServerError)
			}
			return
		}

		// TODO: Cluster bağlantı durumunu kontrol et
		cluster.Status = "unknown"

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cluster)

	case "DELETE":
		// Cluster'ı sil
		_, err := db.Exec("DELETE FROM clusters WHERE id = ?", id)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"Cluster silinemedi: %v"}`, err), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Cluster silindi"})

	default:
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

// testClusterHandler, bir cluster bağlantısını test eder
func testClusterHandler(w http.ResponseWriter, r *http.Request) {
	// URL'den cluster ID parametresini al
	idStr := r.URL.Path[len("/api/v1/clusters/"):]
	idStr = idStr[:len(idStr)-len("/test")]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, `{"error":"Geçersiz cluster ID"}`, http.StatusBadRequest)
		return
	}

	// Test bağlantısı
	connected, message := testConnection(id)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"connected": connected,
		"message":   message,
	})
}

// testConnection, bir cluster bağlantısını test eder
func testConnection(clusterID int) (bool, string) {
	// Cluster bilgilerini al
	var name, apiURL, authType, token, caCert string
	var skipTLSVerify int

	err := db.QueryRow(`
		SELECT name, api_url, auth_type, token, ca_cert, skip_tls_verify
		FROM clusters WHERE id = ?
	`, clusterID).Scan(&name, &apiURL, &authType, &token, &caCert, &skipTLSVerify)

	if err != nil {
		log.Printf("Cluster bilgileri alınamadı: %v", err)
		return false, fmt.Sprintf("Cluster bilgileri alınamadı: %v", err)
	}

	// K8s.go'dan test bağlantısını çağır
	return TestClusterConnection(name, apiURL, authType, token, caCert, skipTLSVerify)
}

// Ana sayfa handler'ı
func homeHandler(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	fmt.Fprintf(w, "K8s Monitoring API")
}

// Sağlık kontrolü endpoint'i
func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	k8sConnected := clientset != nil

	response := map[string]interface{}{
		"status":               "ok",
		"database_connected":   true,
		"kubernetes_connected": k8sConnected,
	}

	json.NewEncoder(w).Encode(response)
}

func servicesHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	// CORS başlıklarını ekle
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	// OPTIONS isteğini yönet
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	switch r.Method {
	case "GET":
		// Servisleri al ve son durum bilgisini ekle
		rows, err := db.Query(`
            SELECT s.id, s.name, s.namespace, s.cluster, s.type, 
                   COALESCE(s.endpoint, '') as endpoint, 
                   COALESCE(s.check_interval, 60) as check_interval,
                   COALESCE(uc.status, 'unknown') as status,
                   COALESCE(uc.timestamp, '') as last_check,
                   COALESCE(uc.response_time, 0) as response_time
            FROM services s
            LEFT JOIN (
                SELECT service_id, status, timestamp, response_time
                FROM uptime_checks
                WHERE (service_id, timestamp) IN (
                    SELECT service_id, MAX(timestamp)
                    FROM uptime_checks
                    GROUP BY service_id
                )
            ) uc ON s.id = uc.service_id
        `)

		if err != nil {
			log.Printf("Servis sorgusu hatası: %v", err)
			http.Error(w, `{"error":"Veritabanı sorgusu başarısız"}`, http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		services := []map[string]interface{}{}

		for rows.Next() {
			var service struct {
				ID            int
				Name          string
				Namespace     string
				Cluster       string
				Type          string
				Endpoint      string
				CheckInterval int
				Status        string
				LastCheck     string
				ResponseTime  int64
			}

			if err := rows.Scan(
				&service.ID,
				&service.Name,
				&service.Namespace,
				&service.Cluster,
				&service.Type,
				&service.Endpoint,
				&service.CheckInterval,
				&service.Status,
				&service.LastCheck,
				&service.ResponseTime,
			); err != nil {
				http.Error(w, `{"error":"Veri okunamadı"}`, http.StatusInternalServerError)
				return
			}

			// Uptime yüzdesini hesapla
			uptimePct, err := uptimeMonitor.CalculateUptimePercentage(service.ID)
			if err != nil {
				log.Printf("Uptime hesaplaması hatası (serviceID %d): %v", service.ID, err)
				uptimePct = 0
			}

			serviceInfo := map[string]interface{}{
				"id":               service.ID,
				"name":             service.Name,
				"namespace":        service.Namespace,
				"cluster":          service.Cluster,
				"type":             service.Type,
				"endpoint":         service.Endpoint,
				"check_interval":   service.CheckInterval,
				"status":           service.Status,
				"lastCheck":        service.LastCheck,
				"responseTime":     service.ResponseTime,
				"uptimePercentage": uptimePct,
			}

			services = append(services, serviceInfo)
		}

		// Hata kontrolü
		if err := rows.Err(); err != nil {
			http.Error(w, `{"error":"Veri tarama hatası"}`, http.StatusInternalServerError)
			return
		}

		response := map[string]interface{}{
			"services": services,
		}

		json.NewEncoder(w).Encode(response)

	case "POST":
		// Yeni servis için yapılandırma struct'ı
		var newService struct {
			Name          string `json:"name"`
			Namespace     string `json:"namespace"`
			Cluster       string `json:"cluster"`
			Type          string `json:"type"`
			Endpoint      string `json:"endpoint"`
			CheckInterval int    `json:"check_interval"`
		}

		// İstek gövdesini decode et
		if err := json.NewDecoder(r.Body).Decode(&newService); err != nil {
			http.Error(w, `{"error":"İstek gövdesi ayrıştırılamadı"}`, http.StatusBadRequest)
			return
		}

		// Gerekli alan kontrolü
		if newService.Name == "" {
			http.Error(w, `{"error":"Servis adı gereklidir"}`, http.StatusBadRequest)
			return
		}

		// Varsayılan değerler
		if newService.Namespace == "" {
			newService.Namespace = "default"
		}
		if newService.Cluster == "" {
			newService.Cluster = "default"
		}
		if newService.CheckInterval == 0 {
			newService.CheckInterval = 60 // Varsayılan 60 saniye
		}

		// Veritabanına servis ekle
		result, err := db.Exec(`
            INSERT INTO services 
            (name, namespace, cluster, type, endpoint, check_interval) 
            VALUES (?, ?, ?, ?, ?, ?)
        `, newService.Name, newService.Namespace, newService.Cluster,
			newService.Type, newService.Endpoint, newService.CheckInterval)

		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"Servis eklenemedi: %v"}`, err), http.StatusInternalServerError)
			return
		}

		// Eklenen servisin ID'sini al
		id, _ := result.LastInsertId()

		// Başarılı yanıt hazırla
		response := map[string]interface{}{
			"service": map[string]interface{}{
				"id":             id,
				"name":           newService.Name,
				"namespace":      newService.Namespace,
				"cluster":        newService.Cluster,
				"type":           newService.Type,
				"endpoint":       newService.Endpoint,
				"check_interval": newService.CheckInterval,
			},
			"message": "Servis başarıyla eklendi",
		}

		// JSON yanıtı gönder
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(response)

	case "PUT":
		// URL'den servis ID'sini al
		idStr := r.URL.Path[len("/api/v1/services/"):]
		id, err := strconv.Atoi(idStr)
		if err != nil {
			http.Error(w, `{"error":"Geçersiz servis ID"}`, http.StatusBadRequest)
			return
		}

		// Güncellenecek servis bilgisi için struct
		var updateService struct {
			Name          string `json:"name"`
			Namespace     string `json:"namespace"`
			Cluster       string `json:"cluster"`
			Type          string `json:"type"`
			Endpoint      string `json:"endpoint"`
			CheckInterval int    `json:"check_interval"`
		}

		// İstek gövdesini decode et
		if err := json.NewDecoder(r.Body).Decode(&updateService); err != nil {
			http.Error(w, `{"error":"İstek gövdesi ayrıştırılamadı"}`, http.StatusBadRequest)
			return
		}

		// Gerekli alan kontrolü
		if updateService.Name == "" {
			http.Error(w, `{"error":"Servis adı gereklidir"}`, http.StatusBadRequest)
			return
		}

		// Varsayılan değerler
		if updateService.Namespace == "" {
			updateService.Namespace = "default"
		}
		if updateService.Cluster == "" {
			updateService.Cluster = "default"
		}
		if updateService.CheckInterval == 0 {
			updateService.CheckInterval = 60 // Varsayılan 60 saniye
		}

		// Veritabanında servisi güncelle
		_, err = db.Exec(`
            UPDATE services 
            SET name = ?, namespace = ?, cluster = ?, 
                type = ?, endpoint = ?, check_interval = ?, 
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, updateService.Name, updateService.Namespace, updateService.Cluster,
			updateService.Type, updateService.Endpoint, updateService.CheckInterval, id)

		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"Servis güncellenemedi: %v"}`, err), http.StatusInternalServerError)
			return
		}

		// Başarılı yanıt hazırla
		response := map[string]interface{}{
			"service": map[string]interface{}{
				"id":             id,
				"name":           updateService.Name,
				"namespace":      updateService.Namespace,
				"cluster":        updateService.Cluster,
				"type":           updateService.Type,
				"endpoint":       updateService.Endpoint,
				"check_interval": updateService.CheckInterval,
			},
			"message": "Servis başarıyla güncellendi",
		}

		// JSON yanıtı gönder
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)

	case "DELETE":
		// URL'den servis ID'sini al
		idStr := r.URL.Path[len("/api/v1/services/"):]
		id, err := strconv.Atoi(idStr)
		if err != nil {
			http.Error(w, `{"error":"Geçersiz servis ID"}`, http.StatusBadRequest)
			return
		}

		// Servisi veritabanından sil
		result, err := db.Exec("DELETE FROM services WHERE id = ?", id)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"Servis silinemedi: %v"}`, err), http.StatusInternalServerError)
			return
		}

		// Etkilenen satır sayısını kontrol et
		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			http.Error(w, `{"error":"Belirtilen ID ile servis bulunamadı"}`, http.StatusNotFound)
			return
		}

		// İlgili uptime kontrollerini de sil
		db.Exec("DELETE FROM uptime_checks WHERE service_id = ?", id)

		// Başarılı yanıt
		response := map[string]interface{}{
			"message": "Servis başarıyla silindi",
		}

		// JSON yanıtı gönder
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)

	default:
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

func mergedNamespacesHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// İlk olarak Kubernetes'ten namespace'leri çekelim (varsa)
	mergedNamespaces := []string{}
	if clientset != nil {
		nsList, err := ListNamespaces()
		if err == nil {
			mergedNamespaces = append(mergedNamespaces, nsList...)
		}
	}

	// Ardından, veritabanındaki servislerden distinct namespace değerlerini ekleyelim
	rows, err := db.Query("SELECT DISTINCT namespace FROM services")
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var ns string
			if err := rows.Scan(&ns); err == nil {
				// Eğer daha önceden eklenmemişse ekleyelim
				exists := false
				for _, existing := range mergedNamespaces {
					if existing == ns {
						exists = true
						break
					}
				}
				if !exists {
					mergedNamespaces = append(mergedNamespaces, ns)
				}
			}
		}
	}

	response := map[string]interface{}{
		"namespaces": mergedNamespaces,
	}
	json.NewEncoder(w).Encode(response)
}

// namespacesHandler, Kubernetes namespace'lerini listeler
func namespacesHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if clientset == nil {
		http.Error(w, `{"error":"Kubernetes bağlantısı kurulmadı"}`, http.StatusServiceUnavailable)
		return
	}

	namespaces, err := ListNamespaces()
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Namespace'ler listelenemedi: %v"}`, err), http.StatusInternalServerError)
		return
	}

	// JSON yanıtı oluştur
	response := map[string]interface{}{
		"namespaces": namespaces,
	}

	json.NewEncoder(w).Encode(response)
}

// k8sServicesHandler, Kubernetes servislerini listeler
func k8sServicesHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if clientset == nil {
		http.Error(w, `{"error":"Kubernetes bağlantısı kurulmadı"}`, http.StatusServiceUnavailable)
		return
	}

	// URL'den namespace parametresini al
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		namespace = "default" // Varsayılan namespace
	}

	services, err := ListServices(namespace)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Servisler listelenemedi: %v"}`, err), http.StatusInternalServerError)
		return
	}

	// JSON yanıtı oluştur
	response := map[string]interface{}{
		"namespace": namespace,
		"services":  services,
	}

	json.NewEncoder(w).Encode(response)
}

// settingsHandler, API ayarlarını kaydeder
func settingsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "POST" {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	// İstek gövdesini oku
	var settings struct {
		K8sApiUrl        string `json:"k8s_api_url"`
		K8sApiToken      string `json:"k8s_api_token"`
		K8sSkipTlsVerify bool   `json:"k8s_skip_tls_verify"`
	}

	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		http.Error(w, `{"error":"İstek gövdesi ayrıştırılamadı"}`, http.StatusBadRequest)
		return
	}

	// Ayarları veritabanına kaydet
	_, err := db.Exec(`
		INSERT INTO settings (key, value)
		VALUES ('k8s_api_url', ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
	`, settings.K8sApiUrl)
	if err != nil {
		http.Error(w, `{"error":"Ayarlar kaydedilemedi"}`, http.StatusInternalServerError)
		return
	}

	_, err = db.Exec(`
		INSERT INTO settings (key, value)
		VALUES ('k8s_api_token', ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
	`, settings.K8sApiToken)
	if err != nil {
		http.Error(w, `{"error":"Ayarlar kaydedilemedi"}`, http.StatusInternalServerError)
		return
	}

	_, err = db.Exec(`
		INSERT INTO settings (key, value)
		VALUES ('k8s_skip_tls_verify', ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
	`, fmt.Sprintf("%t", settings.K8sSkipTlsVerify))
	if err != nil {
		http.Error(w, `{"error":"Ayarlar kaydedilemedi"}`, http.StatusInternalServerError)
		return
	}

	// Kubernetes bağlantısını yeniden başlat
	go func() {
		// Yeni ayarları ortam değişkenlerine yükle
		os.Setenv("K8S_API_URL", settings.K8sApiUrl)
		os.Setenv("K8S_API_TOKEN", settings.K8sApiToken)
		if settings.K8sSkipTlsVerify {
			os.Setenv("K8S_SKIP_TLS_VERIFY", "true")
		} else {
			os.Setenv("K8S_SKIP_TLS_VERIFY", "false")
		}

		// Kubernetes bağlantısını yeniden başlat
		newClientset, err := InitKubernetes()
		if err != nil {
			log.Printf("Kubernetes bağlantısı yeniden başlatılamadı: %v", err)
			return
		}

		// Global clientset'i güncelle
		clientset = newClientset
		log.Println("Kubernetes bağlantısı başarıyla yeniden başlatıldı")
	}()

	// Başarılı yanıt ver
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Ayarlar başarıyla kaydedildi",
	})
}

// serviceDiscoveryWorker, arka planda çalışarak K8s servislerini keşfeder ve veritabanına kaydeder
func serviceDiscoveryWorker() {
	for {
		log.Println("Servis keşif işlemi başlatılıyor...")

		// Tüm namespace'leri tara
		namespaces, err := ListNamespaces()
		if err != nil {
			log.Printf("Namespace'ler listelenemedi: %v", err)
			time.Sleep(5 * time.Minute)
			continue
		}

		for _, namespace := range namespaces {
			// Her namespace'deki servisleri tara
			services, err := clientset.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
			if err != nil {
				log.Printf("Namespace %s içindeki servisler listelenemedi: %v", namespace, err)
				continue
			}

			for _, service := range services.Items {
				// Servisi veritabanına ekle veya güncelle
				_, err := db.Exec(`
					INSERT INTO services (name, namespace, cluster, type)
					VALUES (?, ?, ?, ?)
					ON CONFLICT(name, namespace, cluster) DO UPDATE SET
					type = excluded.type, updated_at = CURRENT_TIMESTAMP
				`, service.Name, service.Namespace, "default", "service")

				if err != nil {
					log.Printf("Servis %s/%s veritabanına eklenemedi: %v",
						service.Namespace, service.Name, err)
				} else {
					log.Printf("Servis %s/%s veritabanına eklendi veya güncellendi",
						service.Namespace, service.Name)
				}
			}
		}

		log.Println("Servis keşif işlemi tamamlandı, 5 dakika sonra tekrar çalışacak.")
		time.Sleep(5 * time.Minute)
	}
}

// uptimeHistoryHandler örneği:
func uptimeHistoryHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	serviceIdStr := r.URL.Query().Get("serviceId")
	startDateStr := r.URL.Query().Get("startDate")
	endDateStr := r.URL.Query().Get("endDate")

	serviceId, err := strconv.Atoi(serviceIdStr)
	if err != nil {
		http.Error(w, `{"error":"Geçersiz serviceId"}`, http.StatusBadRequest)
		return
	}

	// Önce RFC3339 ile parse etmeyi deneyelim
	startDate, err := time.Parse(time.RFC3339, startDateStr)
	if err != nil {
		// Eğer başarısız olursa "2006-01-02T15:04" formatıyla deneyin
		startDate, err = time.Parse("2006-01-02T15:04", startDateStr)
		if err != nil {
			http.Error(w, `{"error":"Geçersiz startDate formatı"}`, http.StatusBadRequest)
			return
		}
	}
	endDate, err := time.Parse(time.RFC3339, endDateStr)
	if err != nil {
		endDate, err = time.Parse("2006-01-02T15:04", endDateStr)
		if err != nil {
			http.Error(w, `{"error":"Geçersiz endDate formatı"}`, http.StatusBadRequest)
			return
		}
	}
	// endDate'i örneğin 59 saniye ekleyerek tam dakikaya tamamlayabilirsiniz:
	endDate = endDate.Add(59 * time.Second)

	rows, err := db.Query(`
        SELECT status, response_time, error_message, timestamp
        FROM uptime_checks
        WHERE service_id = ? AND timestamp BETWEEN ? AND ?
        ORDER BY timestamp ASC
    `, serviceId, startDate, endDate)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Veriler alınamadı: %v"}`, err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	history := []map[string]interface{}{}
	for rows.Next() {
		var status string
		var responseTime int64
		var errorMessage sql.NullString
		var timestamp time.Time

		if err := rows.Scan(&status, &responseTime, &errorMessage, &timestamp); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"Veri okunamadı: %v"}`, err), http.StatusInternalServerError)
			return
		}
		record := map[string]interface{}{
			"timestamp":    timestamp,
			"responseTime": responseTime,
			"status":       status,
		}
		if errorMessage.Valid {
			record["errorMessage"] = errorMessage.String
		}
		history = append(history, record)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"history": history,
	})
}

func serviceDetailHandler(w http.ResponseWriter, r *http.Request) {
	// CORS başlıklarını ekle
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	// OPTIONS isteğini yönet
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// URL yolunu temizle ve segmentlere ayır
	trimmedPath := strings.Trim(r.URL.Path, "/")
	segments := strings.Split(trimmedPath, "/")
	// Beklenen URL yapıları:
	// Normal detay: api/v1/services/{id}         -> segments length = 4
	// Export:         api/v1/services/{id}/export  -> segments length = 5
	if len(segments) < 4 {
		http.Error(w, `{"error":"Geçersiz servis ID"}`, http.StatusBadRequest)
		return
	}

	// GET metodu için export mu yapılacak kontrolü
	if segments[len(segments)-1] == "export" {
		// Servis ID, export segmentinden bir önceki segmentte olmalı
		serviceIDStr := segments[len(segments)-2]
		serviceID, err := strconv.Atoi(serviceIDStr)
		if err != nil {
			http.Error(w, `{"error":"Geçersiz servis ID"}`, http.StatusBadRequest)
			return
		}

		// "range" parametresini al, varsayılan "1d"
		exportRange := r.URL.Query().Get("range")
		if exportRange == "" {
			exportRange = "1d"
		}

		// Range değerine karşılık gelen süreyi belirle (örnek olarak)
		durationMap := map[string]time.Duration{
			"1h": time.Hour,
			"1d": 24 * time.Hour,
			"1w": 7 * 24 * time.Hour,
			"1m": 30 * 24 * time.Hour,
			"6m": 180 * 24 * time.Hour,
			"9m": 270 * 24 * time.Hour,
			"1y": 365 * 24 * time.Hour,
		}
		dur, ok := durationMap[exportRange]
		if !ok {
			http.Error(w, `{"error":"Geçersiz range değeri"}`, http.StatusBadRequest)
			return
		}

		// Başlangıç zamanını hesapla
		startTime := time.Now().Add(-dur)

		// Uptime kontrollerini veritabanından çek (timestamp startTime'dan sonra olanlar)
		rows, err := db.Query(`
            SELECT status, response_time, error_message, timestamp
            FROM uptime_checks
            WHERE service_id = ? AND timestamp >= ?
            ORDER BY timestamp ASC
        `, serviceID, startTime)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"Uptime verileri alınamadı: %v"}`, err), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		// CSV üretimi için hazırlık: header yazdır
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=service_%d_export.csv", serviceID))
		// CSV başlık
		fmt.Fprintf(w, "status,response_time,error_message,timestamp\n")

		// Her bir satırı CSV formatında yazdır
		for rows.Next() {
			var status string
			var responseTime int64
			var errorMessage sql.NullString
			var timestamp time.Time

			if err := rows.Scan(&status, &responseTime, &errorMessage, &timestamp); err != nil {
				http.Error(w, fmt.Sprintf(`{"error":"Veri okunamadı: %v"}`, err), http.StatusInternalServerError)
				return
			}

			// Eğer errorMessage boşsa boş string olarak yaz
			errMsg := ""
			if errorMessage.Valid {
				errMsg = errorMessage.String
			}

			// CSV satırı: verileri virgülle ayırarak yazdırıyoruz
			fmt.Fprintf(w, "%s,%d,%s,%s\n", status, responseTime, errMsg, timestamp.Format(time.RFC3339))
		}

		return
	}

	// Normal GET isteği: servis detaylarını getir
	// segments beklenen yapıda: ["api", "v1", "services", "{id}"]
	serviceIDStr := segments[len(segments)-1]
	id, err := strconv.Atoi(serviceIDStr)
	if err != nil {
		http.Error(w, `{"error":"Geçersiz servis ID"}`, http.StatusBadRequest)
		return
	}

	var service struct {
		ID            int
		Name          string
		Namespace     string
		Cluster       string
		Type          string
		Endpoint      sql.NullString
		CheckInterval int
	}

	err = db.QueryRow(`
            SELECT id, name, namespace, cluster, type, 
                   COALESCE(endpoint, '') as endpoint, 
                   COALESCE(check_interval, 60) as check_interval 
            FROM services 
            WHERE id = ?
        `, id).Scan(
		&service.ID,
		&service.Name,
		&service.Namespace,
		&service.Cluster,
		&service.Type,
		&service.Endpoint,
		&service.CheckInterval,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, `{"error":"Servis bulunamadı"}`, http.StatusNotFound)
		} else {
			http.Error(w, fmt.Sprintf(`{"error":"Veritabanı hatası: %v"}`, err), http.StatusInternalServerError)
		}
		return
	}

	// Son uptime kontrol sonuçlarını getir
	rows, err := db.Query(`
            SELECT status, response_time, error_message, timestamp
            FROM uptime_checks
            WHERE service_id = ?
            ORDER BY timestamp DESC
            LIMIT 10
        `, id)

	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"Uptime kontrolleri getirilemedi: %v"}`, err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	uptimeChecks := []map[string]interface{}{}
	for rows.Next() {
		var check struct {
			Status       string
			ResponseTime int64
			ErrorMessage sql.NullString
			Timestamp    time.Time
		}

		err := rows.Scan(
			&check.Status,
			&check.ResponseTime,
			&check.ErrorMessage,
			&check.Timestamp,
		)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"Uptime kontrol verisi okunamadı: %v"}`, err), http.StatusInternalServerError)
			return
		}

		uptimeCheck := map[string]interface{}{
			"status":        check.Status,
			"response_time": check.ResponseTime,
			"timestamp":     check.Timestamp,
		}

		if check.ErrorMessage.Valid {
			uptimeCheck["error_message"] = check.ErrorMessage.String
		}

		uptimeChecks = append(uptimeChecks, uptimeCheck)
	}

	// Yanıtı hazırla
	response := map[string]interface{}{
		"service": map[string]interface{}{
			"id":             service.ID,
			"name":           service.Name,
			"namespace":      service.Namespace,
			"cluster":        service.Cluster,
			"type":           service.Type,
			"check_interval": service.CheckInterval,
			"endpoint":       service.Endpoint.String,
		},
		"uptime_checks": uptimeChecks,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func main() {
	// Veritabanı bağlantısını başlat
	var err error
	db, err = initDB()
	if err != nil {
		log.Fatalf("Veritabanı başlatılamadı: %v", err)
	}
	defer db.Close()

	// Veritabanı tablolarını oluştur
	if err := createTables(db); err != nil {
		log.Fatalf("Veritabanı tabloları oluşturulamadı: %v", err)
	}
	log.Println("Veritabanı tabloları başarıyla oluşturuldu")

	// Kubernetes API'sine bağlan
	clientset, err = InitKubernetes()
	if err != nil {
		log.Printf("Kubernetes bağlantısı başlatılamadı (bu opsiyonel): %v", err)
	} else {
		log.Println("Kubernetes bağlantısı başarıyla kuruldu")
	}

	// Uptime monitor'ü global değişkene ata ve başlat
	uptimeMonitor = NewUptimeMonitor(db)
	err = uptimeMonitor.StartUptimeMonitoring()
	if err != nil {
		log.Printf("Uptime izleme başlatılamadı: %v", err)
	}

	// API endpoint'leri
	http.HandleFunc("/api/v1/uptime-history", uptimeHistoryHandler)
	http.HandleFunc("/", homeHandler)
	http.HandleFunc("/api/v1/health", healthHandler)
	http.HandleFunc("/api/v1/services", servicesHandler)
	http.HandleFunc("/api/v1/services/", serviceDetailHandler)
	http.HandleFunc("/api/v1/namespaces", namespacesHandler)
	http.HandleFunc("/api/v1/kubernetes/services", k8sServicesHandler)
	http.HandleFunc("/api/v1/settings", settingsHandler)
	http.HandleFunc("/api/v1/test-uptime", handlers.HandleUptimeTest)
	http.HandleFunc("/api/v1/mergedNamespaces", mergedNamespacesHandler)

	// Cluster API endpoint'lerini ekle
	http.HandleFunc("/api/v1/clusters", clustersHandler)
	http.HandleFunc("/api/v1/clusters/", func(w http.ResponseWriter, r *http.Request) {
		// /api/v1/clusters/{id}/test endpoint'i için
		if strings.HasSuffix(r.URL.Path, "/test") {
			testClusterHandler(w, r)
			return
		}
		// /api/v1/clusters/{id} endpoint'i için
		clusterHandler(w, r)
	})

	// NOT: "/api/v1/services/" endpoint'i yalnızca serviceDetailHandler ile kaydedildi,
	// duplicate kayıt yapan ek bir blok kaldırıldı.

	corsMiddleware := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

			// OPTIONS metodunu destekle
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	}

	// Servis keşfi arka plan işlemi
	if clientset != nil {
		go serviceDiscoveryWorker()
	}

	// Sunucuyu başlat
	port := os.Getenv("SERVER_PORT")
	if port == "" {
		port = "8080"
	}
	httpHandler := corsMiddleware(http.DefaultServeMux)
	log.Printf("Server %s portunda çalışıyor...", port)
	log.Fatal(http.ListenAndServe(":"+port, httpHandler))
}
