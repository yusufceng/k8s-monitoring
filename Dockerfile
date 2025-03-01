FROM golang:1.21-alpine

# Gerekli paketleri yükle
RUN apk add --no-cache gcc musl-dev git

WORKDIR /app

# Modül dosyalarını kopyala
COPY go.mod go.sum ./

# Bağımlılıkları indir
RUN go mod download

# Tüm kaynak kodlarını kopyala
COPY . .

# Uygulamayı derle
RUN go build -o server ./cmd/server/main.go

# ENV değişkenleri tanımla
ENV DB_PATH=/data/monitoring.db \
    LOG_LEVEL=info \
    SERVER_PORT=8080 \
    METRICS_SCRAPE_INTERVAL=15s \
    UPTIME_CHECK_INTERVAL=30s

# SQLite verisi için bir volume oluştur
VOLUME ["/data"]

EXPOSE 8080

# Binary'yi çalıştır
CMD ["./server"]
