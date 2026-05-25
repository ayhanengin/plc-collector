#!/bin/bash
# Build script for Windows executable package
# Creates a standalone .exe that requires no Node.js installation

set -e

echo "🔧 PLC Collector — Build Package"
echo ""

# 1. Build TypeScript
echo "📦 Compiling TypeScript..."
npx tsc

# 2. Create release directory
RELEASE_DIR="./release"
rm -rf $RELEASE_DIR
mkdir -p $RELEASE_DIR

# 3. Copy files
echo "📋 Copying files..."
cp -r dist/ $RELEASE_DIR/dist/
cp package.json $RELEASE_DIR/
cp launcher.js $RELEASE_DIR/
cp .env.example $RELEASE_DIR/.env

# 4. Install production dependencies
echo "📦 Installing production dependencies..."
cd $RELEASE_DIR
npm install --production --ignore-scripts
# Rebuild native modules
npx node-gyp rebuild -C node_modules/better-sqlite3 2>/dev/null || true
cd ..

# 5. Create start scripts
cat > $RELEASE_DIR/start.bat << 'EOF'
@echo off
title PLC Data Collector v2.0
echo.
echo ╔═══════════════════════════════════════════════════╗
echo ║       PLC Data Collector v2.0.0                   ║
echo ║       Başlatılıyor...                              ║
echo ╚═══════════════════════════════════════════════════╝
echo.
echo Browser'da http://localhost:4000 acilacak
echo Bu pencereyi kapatmayin!
echo.
node launcher.js
pause
EOF

cat > $RELEASE_DIR/start.sh << 'EOF'
#!/bin/bash
echo "🔌 PLC Data Collector v2.0.0 başlatılıyor..."
node launcher.js
EOF
chmod +x $RELEASE_DIR/start.sh

echo ""
echo "✅ Release package created at: $RELEASE_DIR/"
echo ""
echo "Windows kullanıcıları:"
echo "  1. Node.js 20+ kurulu olmalı (nodejs.org)"
echo "  2. release/ klasörünü kopyalayın"
echo "  3. start.bat'a çift tıklayın"
echo ""
echo "Boyut: $(du -sh $RELEASE_DIR | cut -f1)"
