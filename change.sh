#!/bin/bash

# Proje kök dizinine git
cd backend

# go.mod dosyasını güncelle
sed -i '' 's|module github.com/your-username/k8s-monitoring|module k8s-monitoring|' go.mod

# Tüm .go dosyalarını bul ve import yollarını değiştir
find . -name "*.go" -type f -exec sed -i '' 's|github.com/your-username/k8s-monitoring|k8s-monitoring|g' {} \;

echo "Import yolları güncellendi."
