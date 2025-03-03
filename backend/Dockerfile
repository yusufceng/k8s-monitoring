FROM golang:1.21-alpine

# Gerekli paketleri yükle
RUN apk add --no-cache gcc musl-dev git bash sqlite

WORKDIR /app

COPY go.mod .
RUN go mod download

COPY . .
RUN go build -o main .

# SQLite verisi ve Kubernetes konfigürasyonu için volume'lar
VOLUME ["/data", "/root/.kube"]

EXPOSE 8080

CMD ["./main"]
