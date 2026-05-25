#!/bin/bash
echo "🔌 PLC Data Collector v2.0.0 başlatılıyor..."
echo ""

# Check node
if ! command -v node &> /dev/null; then
    echo "❌ Node.js bulunamadı! Kurun: https://nodejs.org"
    exit 1
fi

# Install deps on first run
if [ ! -d "node_modules" ]; then
    echo "📦 İlk çalışma — bağımlılıklar kuruluyor..."
    npm install --production
    echo ""
fi

echo "🌐 http://localhost:4000 adresinde açılacak"
echo "Bu terminali kapatmayın!"
echo ""
node launcher.js
