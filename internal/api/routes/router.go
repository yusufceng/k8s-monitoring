package routes

import (
	"backend/pkg/logger"
	"database/sql"
	"net/http"

	"github.com/gorilla/mux"
)

// NewRouter, yeni bir HTTP router oluşturur
func NewRouter(db *sql.DB, logger *logger.Logger) http.Handler {
	r := mux.NewRouter()

	// API v1 alt router'ı oluştur
	apiV1 := r.PathPrefix("/api/v1").Subrouter()

	// Temel endpoint
	apiV1.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	}).Methods("GET")

	// Statik dosyalar
	r.PathPrefix("/").Handler(http.FileServer(http.Dir("./static")))

	return r
}
