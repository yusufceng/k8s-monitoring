package main

import (
	"context"
	"crypto/x509"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// InitKubernetes, Kubernetes API'sine bağlanır
func InitKubernetes() (*kubernetes.Clientset, error) {
	var config *rest.Config
	var err error
	// 1. Önce token tabanlı kimlik doğrulamayı dene
	k8sURL := os.Getenv("K8S_API_URL")
	k8sToken := os.Getenv("K8S_API_TOKEN")

	if k8sURL != "" && k8sToken != "" {
		// Token tabanlı kimlik doğrulama ile config oluştur
		config = &rest.Config{
			Host:        k8sURL,
			BearerToken: k8sToken,
			// TLS doğrulamasını atlamak için (test/dev ortamlarında)
			TLSClientConfig: rest.TLSClientConfig{
				Insecure: os.Getenv("K8S_SKIP_TLS_VERIFY") == "true",
			},
		}

		log.Println("Token tabanlı Kubernetes kimlik doğrulama kullanılıyor")
	} else {
		// 2. In-cluster konfigürasyonu dene
		config, err = rest.InClusterConfig()
		if err != nil {
			log.Println("In-cluster konfigürasyonu bulunamadı, kubeconfig dosyasına geçiliyor")

			// 3. Kubeconfig dosyasını dene
			kubeconfig := os.Getenv("K8S_CONFIG_PATH")
			if kubeconfig == "" {
				// Varsayılan konum
				if home := os.Getenv("HOME"); home != "" {
					kubeconfig = filepath.Join(home, ".kube", "config")
				} else {
					return nil, fmt.Errorf("kubeconfig dosyası bulunamadı, $HOME ortam değişkeni ayarlanmamış")
				}
			}
			// Kubeconfig dosyasından konfigürasyon oluştur
			config, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
			if err != nil {
				return nil, fmt.Errorf("kubeconfig dosyasından konfigürasyon oluşturulamadı: %v", err)
			}

			log.Println("Kubeconfig tabanlı Kubernetes kimlik doğrulama kullanılıyor")
		} else {
			log.Println("In-cluster Kubernetes kimlik doğrulama kullanılıyor")
		}
	}
	// Clientset oluştur
	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("Kubernetes clientset oluşturulamadı: %v", err)
	}
	return clientset, nil
}

// ListNamespaces, mevcut tüm namespace'leri listeler
func ListNamespaces() ([]string, error) {
	if clientset == nil {
		return nil, fmt.Errorf("Kubernetes istemcisi başlatılmadı")
	}
	// Namespace'leri getir
	namespaces, err := clientset.CoreV1().Namespaces().List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("namespace'ler getirilemedi: %v", err)
	}
	var namespaceNames []string
	for _, ns := range namespaces.Items {
		namespaceNames = append(namespaceNames, ns.Name)
	}
	return namespaceNames, nil
}

// ListServices, belirli bir namespace'deki tüm servisleri listeler
func ListServices(namespace string) ([]string, error) {
	if clientset == nil {
		return nil, fmt.Errorf("Kubernetes istemcisi başlatılmadı")
	}
	// Servisleri getir
	services, err := clientset.CoreV1().Services(namespace).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("servisler getirilemedi: %v", err)
	}
	var serviceNames []string
	for _, svc := range services.Items {
		serviceNames = append(serviceNames, svc.Name)
	}
	return serviceNames, nil
}

// TestClusterConnection, bir cluster bağlantısını test eder
func TestClusterConnection(name, apiURL, authType, token, caCert string, skipTLSVerify int) (bool, string) {
	// Zaman aşımı ayarla
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Konfigürasyon oluştur
	var config *rest.Config
	var configErr error

	switch authType {
	case "token":
		// Token tabanlı kimlik doğrulama
		config = &rest.Config{
			Host:        apiURL,
			BearerToken: token,
			TLSClientConfig: rest.TLSClientConfig{
				Insecure: skipTLSVerify == 1,
			},
		}

		// CA sertifikası varsa ekle
		if caCert != "" && skipTLSVerify == 0 {
			// CA sertifikasını yükle
			caCertPool := x509.NewCertPool()
			if ok := caCertPool.AppendCertsFromPEM([]byte(caCert)); !ok {
				return false, "Geçersiz CA sertifikası"
			}

			config.TLSClientConfig.CAData = []byte(caCert)
		}

	case "kubeconfig":
		// Kubeconfig dosyasından konfigürasyon oluştur
		configErr = fmt.Errorf("Kubeconfig dosyası henüz desteklenmiyor")
		return false, configErr.Error()

	default:
		return false, fmt.Sprintf("Desteklenmeyen kimlik doğrulama türü: %s", authType)
	}

	// Kubernetes istemcisini oluştur
	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return false, fmt.Sprintf("Kubernetes istemcisi oluşturulamadı: %v", err)
	}

	// Temel bir Kubernetes API çağrısı yaparak bağlantıyı test et
	_, err = clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		// Hata detaylarını düzenle
		errMsg := err.Error()

		// Yaygın hata mesajlarını daha anlaşılır kıl
		switch {
		case strings.Contains(errMsg, "connection refused"):
			return false, "Bağlantı reddedildi. API URL veya ağ ayarlarını kontrol edin."
		case strings.Contains(errMsg, "unauthorized"):
			return false, "Yetkisiz erişim. Token veya kimlik doğrulama bilgilerini kontrol edin."
		case strings.Contains(errMsg, "certificate"):
			return false, "TLS/SSL sertifika hatası. CA sertifikası veya TLS ayarlarını kontrol edin."
		case strings.Contains(errMsg, "timeout"):
			return false, "Bağlantı zaman aşımına uğradı. Küme erişilebilir mi kontrol edin."
		default:
			return false, fmt.Sprintf("Bağlantı hatası: %v", err)
		}
	}

	// Bağlantı başarılı
	return true, fmt.Sprintf("%s kümesine bağlantı başarılı", name)
}
