/**
 * Windows Launcher
 * Opens browser automatically when app starts.
 * This is the entry point for packaged builds.
 */

const { exec } = require('child_process');
const path = require('path');
const os = require('os');

// Set environment defaults for packaged mode
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || '4000';
process.env.DB_ENGINE = process.env.DB_ENGINE || 'sqlite';

const PORT = process.env.PORT;

console.log('');
console.log('╔═══════════════════════════════════════════════════╗');
console.log('║       🔌 PLC Data Collector v2.0.0                ║');
console.log('║       Başlatılıyor...                              ║');
console.log('╚═══════════════════════════════════════════════════╝');
console.log('');
console.log(`📁 Çalışma dizini: ${process.cwd()}`);
console.log(`🌐 http://localhost:${PORT} adresinde açılacak`);
console.log('');

// Open browser after a delay
setTimeout(() => {
  const url = `http://localhost:${PORT}`;
  const platform = os.platform();
  
  if (platform === 'win32') {
    exec(`start ${url}`);
  } else if (platform === 'darwin') {
    exec(`open ${url}`);
  } else {
    exec(`xdg-open ${url}`);
  }
}, 3000);

// Start the main application
require('./dist/index.js');
