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
    call npm install --production
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
