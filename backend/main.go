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
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "/data/monitoring.db"
	}

	log.Printf("Veritabanı dosya yolu: %s", dbPath)

	// Veritabanı dizininin var olduğundan emin ol
	dbDir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		log.Printf("Veritabanı dizini oluşturma hatası: %v", err)
		return nil, fmt.Errorf("veritabanı dizini oluşturulamadı: %w", err)
	}

	// SQLite bağlantı stringine özel ayarlar ekle
	dsn := fmt.Sprintf("%s?_timeout=10000&_journal=WAL&_busy_timeout=10000&cache=shared&mode=rwc", dbPath)
	log.Printf("SQLite DSN: %s", dsn)

	// Veritabanına bağlan
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		log.Printf("Veritabanı bağlantı hatası: %v", err)
		return nil, fmt.Errorf("veritabanına bağlanılamadı: %w", err)
	}

	// Bağlantı havuzu ayarları
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(time.Hour)

	// Bağlantıyı test et
	if err := db.Ping(); err != nil {
		log.Printf("Veritabanı ping hatası: %v", err)
		return nil, fmt.Errorf("veritabanı bağlantısı test edilemedi: %w", err)
	}

	log.Println("Veritabanı bağlantısı başarıyla kuruldu")
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
	log.Printf("[DEBUG] Servis isteği alındı: %s %s", r.Method, r.URL.Path)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	switch r.Method {
	case "GET":
		log.Printf("[DEBUG] GET isteği işleniyor")

		// Veritabanı sorgusu
		rows, err := db.Query("SELECT id, name, namespace, cluster, type, endpoint, check_interval FROM services")
		if err != nil {
			log.Printf("[ERROR] Veritabanı sorgusu hatası: %v", err)
			http.Error(w, fmt.Sprintf(`{"error":"Veritabanı hatası: %v","success":false}`, err), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		services := []map[string]interface{}{}
		for rows.Next() {
			var id int
			var name, namespace, cluster, sType string
			var endpoint sql.NullString
			var checkInterval int

			if err := rows.Scan(&id, &name, &namespace, &cluster, &sType, &endpoint, &checkInterval); err != nil {
				log.Printf("[ERROR] Veri okuma hatası: %v", err)
				continue
			}

			serviceInfo := map[string]interface{}{
				"id":             id,
				"name":           name,
				"namespace":      namespace,
				"cluster":        cluster,
				"type":           sType,
				"endpoint":       endpoint.String,
				"check_interval": checkInterval,
			}

			services = append(services, serviceInfo)
		}

		log.Printf("[DEBUG] %d servis bulundu", len(services))

		response := map[string]interface{}{
			"services": services,
			"success":  true,
		}

		if err := json.NewEncoder(w).Encode(response); err != nil {
			log.Printf("[ERROR] JSON encode hatası: %v", err)
			http.Error(w, `{"error":"Internal server error","success":false}`, http.StatusInternalServerError)
			return
		}
		log.Printf("[DEBUG] Yanıt başarıyla gönderildi")

	case "POST":
		var service struct {
			Name          string `json:"name"`
			Namespace     string `json:"namespace"`
			Cluster       string `json:"cluster"`
			Type          string `json:"type"`
			Endpoint      string `json:"endpoint"`
			CheckInterval int    `json:"check_interval"`
		}

		if err := json.NewDecoder(r.Body).Decode(&service); err != nil {
			log.Printf("[DEBUG] İstek gövdesi ayrıştırma hatası: %v", err)
			http.Error(w, `{"error":"İstek gövdesi ayrıştırılamadı","success":false}`, http.StatusBadRequest)
			return
		}

		// Zorunlu alanları kontrol et
		if service.Name == "" || service.Namespace == "" {
			http.Error(w, `{"error":"Name ve namespace alanları zorunludur","success":false}`, http.StatusBadRequest)
			return
		}

		// Varsayılan değerleri ayarla
		if service.Cluster == "" {
			service.Cluster = "default"
		}
		if service.Type == "" {
			service.Type = "service"
		}
		if service.CheckInterval == 0 {
			service.CheckInterval = 60
		}

		log.Printf("[DEBUG] Yeni servis ekleniyor: %+v", service)

		result, err := db.Exec(`
			INSERT INTO services (name, namespace, cluster, type, endpoint, check_interval)
			VALUES (?, ?, ?, ?, ?, ?)
		`, service.Name, service.Namespace, service.Cluster, service.Type, service.Endpoint, service.CheckInterval)

		if err != nil {
			log.Printf("[DEBUG] Servis ekleme hatası: %v", err)
			http.Error(w, fmt.Sprintf(`{"error":"Servis eklenemedi: %v","success":false}`, err), http.StatusInternalServerError)
			return
		}

		id, _ := result.LastInsertId()
		log.Printf("[DEBUG] Yeni servis başarıyla eklendi. ID: %d", id)

		response := map[string]interface{}{
			"id":      id,
			"message": "Servis başarıyla eklendi",
			"success": true,
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(response)

	case "PUT":
		// URL'den ID'yi al
		idStr := r.URL.Path[len("/api/v1/services/"):]
		id, err := strconv.Atoi(idStr)
		if err != nil {
			log.Printf("[DEBUG] Geçersiz servis ID: %v", err)
			http.Error(w, `{"error":"Geçersiz servis ID","success":false}`, http.StatusBadRequest)
			return
		}

		// İstek gövdesini oku
		var service struct {
			Name          string `json:"name"`
			Namespace     string `json:"namespace"`
			Cluster       string `json:"cluster"`
			Type          string `json:"type"`
			Endpoint      string `json:"endpoint"`
			CheckInterval int    `json:"check_interval"`
		}

		if err := json.NewDecoder(r.Body).Decode(&service); err != nil {
			log.Printf("[DEBUG] İstek gövdesi ayrıştırma hatası: %v", err)
			http.Error(w, `{"error":"İstek gövdesi ayrıştırılamadı","success":false}`, http.StatusBadRequest)
			return
		}

		// Zorunlu alanları kontrol et
		if service.Name == "" || service.Namespace == "" {
			http.Error(w, `{"error":"Name ve namespace alanları zorunludur","success":false}`, http.StatusBadRequest)
			return
		}

		// Varsayılan değerleri ayarla
		if service.Cluster == "" {
			service.Cluster = "default"
		}
		if service.Type == "" {
			service.Type = "service"
		}
		if service.CheckInterval == 0 {
			service.CheckInterval = 60
		}

		log.Printf("[DEBUG] Servis güncelleniyor. ID: %d, Yeni değerler: %+v", id, service)

		// Önce servisi kontrol et
		var existingService struct {
			ID int
		}
		err = db.QueryRow("SELECT id FROM services WHERE id = ?", id).Scan(&existingService.ID)
		if err != nil {
			if err == sql.ErrNoRows {
				log.Printf("[DEBUG] Güncellenecek servis bulunamadı. ID: %d", id)
				http.Error(w, `{"error":"Belirtilen ID ile servis bulunamadı","success":false}`, http.StatusNotFound)
				return
			}
			log.Printf("[DEBUG] Servis kontrol hatası: %v", err)
			http.Error(w, fmt.Sprintf(`{"error":"Servis kontrol edilemedi: %v","success":false}`, err), http.StatusInternalServerError)
			return
		}

		// Transaction başlat
		tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
		if err != nil {
			log.Printf("[DEBUG] Transaction başlatma hatası: %v", err)
			http.Error(w, fmt.Sprintf(`{"error":"İşlem başlatılamadı: %v","success":false}`, err), http.StatusInternalServerError)
			return
		}
		defer func() {
			if err != nil {
				tx.Rollback()
				log.Printf("[DEBUG] Transaction rollback yapıldı: %v", err)
			}
		}()

		// Servisi güncelle
		log.Printf("[DEBUG] Güncelleme öncesi servis değerleri: %+v", service)

		// Önce mevcut servisi alalım
		var currentService struct {
			ID            int
			Name          string
			Namespace     string
			Cluster       string
			Type          string
			Endpoint      sql.NullString
			CheckInterval int
		}

		err = tx.QueryRow(`
			SELECT id, name, namespace, cluster, type, endpoint, check_interval
			FROM services
			WHERE id = ?
		`, id).Scan(
			&currentService.ID,
			&currentService.Name,
			&currentService.Namespace,
			&currentService.Cluster,
			&currentService.Type,
			&currentService.Endpoint,
			&currentService.CheckInterval,
		)

		if err != nil {
			log.Printf("[ERROR] Mevcut servis bilgileri alınamadı: %v", err)
			http.Error(w, fmt.Sprintf(`{"error":"Mevcut servis bilgileri alınamadı: %v","success":false}`, err), http.StatusInternalServerError)
			return
		}

		// Yeni değerleri güncelle
		result, err := tx.Exec(`
			UPDATE services 
			SET name = ?, 
				namespace = ?, 
				cluster = ?, 
				type = ?, 
				endpoint = ?, 
				check_interval = ?, 
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`,
			service.Name,
			service.Namespace,
			service.Cluster,
			service.Type,
			sql.NullString{String: service.Endpoint, Valid: true},
			service.CheckInterval,
			id)

		if err != nil {
			log.Printf("[ERROR] SQL güncelleme hatası: %v", err)
			http.Error(w, fmt.Sprintf(`{"error":"Servis güncellenemedi: %v","success":false}`, err), http.StatusInternalServerError)
			return
		}

		rowsAffected, err := result.RowsAffected()
		log.Printf("[DEBUG] Güncellenen satır sayısı: %d", rowsAffected)
		if err != nil {
			log.Printf("[DEBUG] Güncelleme sonucu kontrol edilemedi: %v", err)
			http.Error(w, fmt.Sprintf(`{"error":"Güncelleme sonucu kontrol edilemedi: %v","success":false}`, err), http.StatusInternalServerError)
			return
		}

		if rowsAffected == 0 {
			log.Printf("[DEBUG] Servis güncellenemedi: %d", id)
			http.Error(w, `{"error":"Servis güncellenemedi","success":false}`, http.StatusNotFound)
			return
		}

		// Güncellenmiş servisi transaction içinde getir
		var updatedService struct {
			ID            int            `json:"id"`
			Name          string         `json:"name"`
			Namespace     string         `json:"namespace"`
			Cluster       string         `json:"cluster"`
			Type          string         `json:"type"`
			Endpoint      sql.NullString `json:"endpoint"`
			CheckInterval int            `json:"check_interval"`
		}

		err = tx.QueryRow(`
			SELECT id, name, namespace, cluster, type, endpoint, check_interval
			FROM services
			WHERE id = ?
		`, id).Scan(
			&updatedService.ID,
			&updatedService.Name,
			&updatedService.Namespace,
			&updatedService.Cluster,
			&updatedService.Type,
			&updatedService.Endpoint,
			&updatedService.CheckInterval,
		)

		if err != nil {
			log.Printf("[DEBUG] Güncellenmiş servis bilgileri alınamadı: %v", err)
			http.Error(w, fmt.Sprintf(`{"error":"Güncellenmiş servis bilgileri alınamadı: %v","success":false}`, err), http.StatusInternalServerError)
			return
		}

		// Transaction'ı commit et
		if err = tx.Commit(); err != nil {
			log.Printf("[DEBUG] Transaction commit hatası: %v", err)
			http.Error(w, fmt.Sprintf(`{"error":"İşlem tamamlanamadı: %v","success":false}`, err), http.StatusInternalServerError)
			return
		}

		// Başarılı yanıt
		response := map[string]interface{}{
			"message": "Servis başarıyla güncellendi",
			"success": true,
			"service": map[string]interface{}{
				"id":             updatedService.ID,
				"name":           updatedService.Name,
				"namespace":      updatedService.Namespace,
				"cluster":        updatedService.Cluster,
				"type":           updatedService.Type,
				"endpoint":       updatedService.Endpoint.String,
				"check_interval": updatedService.CheckInterval,
			},
		}
		json.NewEncoder(w).Encode(response)

	case "DELETE":
		idStr := r.URL.Path[len("/api/v1/services/"):]
		id, err := strconv.Atoi(idStr)
		if err != nil {
			log.Printf("[DEBUG] Geçersiz servis ID: %v", err)
			http.Error(w, `{"error":"Geçersiz servis ID","success":false}`, http.StatusBadRequest)
			return
		}

		log.Printf("[DEBUG] Servis silme işlemi başlatılıyor. ID: %d", id)

		// İşlem başlangıcında transaction başlat
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// Önce servisin var olup olmadığını kontrol et
		var serviceName string
		err = db.QueryRowContext(ctx, "SELECT name FROM services WHERE id = ?", id).Scan(&serviceName)
		if err != nil {
			if err == sql.ErrNoRows {
				log.Printf("[DEBUG] Servis bulunamadı. ID: %d", id)
				http.Error(w, `{"error":"Belirtilen ID ile servis bulunamadı","success":false}`, http.StatusNotFound)
				return
			}
			log.Printf("[DEBUG] Servis kontrol hatası: %v", err)
			log.Printf("Servis kontrol hatası: %v", err)
			http.Error(w, fmt.Sprintf(`{"error":"Servis kontrol edilemedi: %v","success":false}`, err), http.StatusInternalServerError)
			return
		}

		// Transaction başlat
		tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
		if err != nil {
			log.Printf("Transaction başlatma hatası: %v", err)
			http.Error(w, fmt.Sprintf(`{"error":"İşlem başlatılamadı: %v","success":false}`, err), http.StatusInternalServerError)
			return
		}
		defer func() {
			if err != nil {
				tx.Rollback()
				log.Printf("Transaction rollback yapıldı: %v", err)
			}
		}()

		log.Printf("'%s' isimli servis siliniyor (ID: %d)...", serviceName, id)

		// Önce uptime_checks tablosundan ilgili kayıtları sil
		result, err := tx.ExecContext(ctx, "DELETE FROM uptime_checks WHERE service_id = ?", id)
		if err != nil {
			log.Printf("Uptime kayıtları silme hatası: %v", err)
			http.Error(w, fmt.Sprintf(`{"error":"Uptime kayıtları silinemedi: %v","success":false}`, err), http.StatusInternalServerError)
			return
		}

		deletedChecks, err := result.RowsAffected()
		if err != nil {
			log.Printf("Silinen uptime kayıt sayısı alınamadı: %v", err)
		} else {
			log.Printf("Silinen uptime kayıt sayısı: %d", deletedChecks)
		}

		// Sonra servisi sil
		result, err = tx.ExecContext(ctx, "DELETE FROM services WHERE id = ?", id)
		if err != nil {
			log.Printf("Servis silme hatası: %v", err)
			http.Error(w, fmt.Sprintf(`{"error":"Servis silinemedi: %v","success":false}`, err), http.StatusInternalServerError)
			return
		}

		deletedServices, err := result.RowsAffected()
		if err != nil {
			log.Printf("Silinen servis sayısı alınamadı: %v", err)
			http.Error(w, fmt.Sprintf(`{"error":"Silme işlemi doğrulanamadı: %v","success":false}`, err), http.StatusInternalServerError)
			return
		}

		if deletedServices == 0 {
			log.Printf("Servis bulunamadı veya silinemedi. ID: %d", id)
			http.Error(w, fmt.Sprintf(`{"error":"Servis bulunamadı veya silinemedi","success":false}`), http.StatusNotFound)
			return
		}

		// Transaction'ı commit et
		if err = tx.Commit(); err != nil {
			log.Printf("Transaction commit hatası: %v", err)
			http.Error(w, fmt.Sprintf(`{"error":"İşlem tamamlanamadı: %v","success":false}`, err), http.StatusInternalServerError)
			return
		}

		log.Printf("'%s' isimli servis başarıyla silindi (ID: %d)", serviceName, id)

		// Başarılı yanıt
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message": fmt.Sprintf("'%s' servisi başarıyla silindi", serviceName),
			"success": true,
			"details": map[string]int64{
				"deleted_checks":   deletedChecks,
				"deleted_services": deletedServices,
			},
		})

	default:
		http.Error(w, `{"error":"Method not allowed","success":false}`, http.StatusMethodNotAllowed)
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
		// Export işlemi...
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

	// DELETE isteği için özel işlem
	if r.Method == "DELETE" {
		// Silme işlemi için servicesHandler'a yönlendir
		servicesHandler(w, r)
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
			http.Error(w, `{"error":"Servis bulunamadı","success":false}`, http.StatusNotFound)
		} else {
			http.Error(w, fmt.Sprintf(`{"error":"Veritabanı hatası: %v","success":false}`, err), http.StatusInternalServerError)
		}
		return
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
