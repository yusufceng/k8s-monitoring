FROM node:18-alpine AS builder

WORKDIR /app

# Bağımlılıkları kopyala ve yükle
COPY package.json package-lock.json* ./
RUN npm install

# Gerekli public dizinini oluştur
RUN mkdir -p ./public

# Kaynak dosyaları kopyala
COPY . .

# Next.js uygulamasını derle
RUN npm run build

FROM node:18-alpine

WORKDIR /app

# Sadece gerekli dosyaları kopyala
COPY --from=builder /app/package.json ./
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public

# ENV değişkenleri tanımla
ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_PUBLIC_API_URL=http://backend:8080

EXPOSE 3000

# Next.js başlat
CMD ["npm", "start"]
