#!/bin/bash
# Creates a distributable release package for Windows/Linux
# Output: plc-collector-v2.0.0-win-x64.zip

set -e

VERSION="2.0.0"
RELEASE_NAME="plc-collector-v${VERSION}"
RELEASE_DIR="./release/${RELEASE_NAME}"

echo "🔧 PLC Collector v${VERSION} — Release Package Builder"
echo ""

# 1. Clean
rm -rf ./release
mkdir -p "${RELEASE_DIR}"

# 2. Build TypeScript
echo "📦 Compiling TypeScript..."
npx tsc

# 3. Copy app files
echo "📋 Copying application files..."
cp -r dist/ "${RELEASE_DIR}/dist/"
cp launcher.js "${RELEASE_DIR}/"
cp .env.example "${RELEASE_DIR}/.env" 2>/dev/null || true
cp README.md "${RELEASE_DIR}/" 2>/dev/null || true

# 4. Create a CLEAN package.json (no native deps, no devDeps)
cat > "${RELEASE_DIR}/package.json" << 'PKGJSON'
{
  "name": "plc-collector",
  "version": "2.0.0",
  "description": "Industrial PLC Data Collector",
  "main": "dist/index.js",
  "scripts": {
    "start": "node dist/index.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.1",
    "modbus-serial": "^8.0.17",
    "nodes7": "^0.3.14",
    "socket.io": "^4.8.1",
    "sql.js": "^1.14.1",
    "ssh2": "^1.16.0"
  },
  "optionalDependencies": {
    "pg": "^8.13.1",
    "serialport": "^13.0.0",
    "@serialport/bindings-cpp": "^13.0.0"
  },
  "overrides": {
    "modbus-serial": {
      "serialport": "$serialport"
    }
  }
}
PKGJSON

# 5. Create start scripts
cat > "${RELEASE_DIR}/start.bat" << 'BATEOF'
@echo off
chcp 65001 >nul
title PLC Data Collector v2.0
color 0A

echo.
echo  ╔═══════════════════════════════════════════════════╗
echo  ║       PLC Data Collector v2.0.0                   ║
echo  ║       DM Otomasyon                                ║
echo  ╚═══════════════════════════════════════════════════╝
echo.

:: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [HATA] Node.js bulunamadi!
    echo.
    echo  Node.js 20+ indirin: https://nodejs.org
    echo  Kurduktan sonra bu dosyayi tekrar calistirin.
    echo.
    pause
    exit /b 1
)

:: Check if node_modules exists
if not exist "node_modules" (
    echo  [*] Ilk calisma - bagimliliklar kuruluyor...
    echo  [*] Bu islem 1-2 dakika surebilir...
    echo.
    call npm install --ignore-scripts --no-optional 2>nul
    if %ERRORLEVEL% neq 0 (
        echo  [!] Bazi opsiyonel bagimliliklar yuklenemedi, sorun degil.
    )
    echo.
    echo  [OK] Bagimliliklar kuruldu!
    echo.
)

echo  [*] Sunucu baslatiliyor...
echo  [*] Tarayiciniz otomatik acilacak: http://localhost:4000
echo.
echo  [!] Bu pencereyi KAPATMAYIN!
echo  ─────────────────────────────────────────────────────
echo.

node launcher.js
pause
BATEOF

cat > "${RELEASE_DIR}/start.sh" << 'SHEOF'
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
    npm install --ignore-scripts --no-optional 2>/dev/null
    echo ""
fi

echo "🌐 http://localhost:4000 adresinde açılacak"
echo "Bu terminali kapatmayın!"
echo ""
node launcher.js
SHEOF
chmod +x "${RELEASE_DIR}/start.sh"

# 6. Create .npmrc to skip native builds
cat > "${RELEASE_DIR}/.npmrc" << 'NPMRC'
# Skip native module compilation
ignore-scripts=true
optional=false
NPMRC

# 7. Create zip
echo "📦 Creating zip..."
cd ./release
zip -r "../${RELEASE_NAME}.zip" "${RELEASE_NAME}/" -x "*/node_modules/*"
cd ..

SIZE=$(du -sh "${RELEASE_NAME}.zip" | cut -f1)
echo ""
echo "✅ Release package ready: ${RELEASE_NAME}.zip (${SIZE})"
echo ""
echo "📋 Kullanıcı talimatları:"
echo "  1. Node.js 20+ kur (nodejs.org)"
echo "  2. ZIP'i aç"
echo "  3. start.bat (Windows) veya start.sh (Linux) çalıştır"
echo "  4. İlk çalışmada bağımlılıklar otomatik kurulur"
echo "  5. Tarayıcı otomatik açılır: http://localhost:4000"
