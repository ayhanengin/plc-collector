/**
 * PLC Collector — Central License Server
 * Runs on dmotomasyon.com
 * 
 * Handles:
 *   - License key generation (admin)
 *   - License key validation (from plc-collector instances)
 *   - Usage tracking
 *   - Download links
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3070;

app.use(cors());
app.use(express.json());

// ─── Database ──────────────────────────────────────────

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'licenses.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT UNIQUE NOT NULL,
    tier TEXT NOT NULL CHECK(tier IN ('FREE','PRO','ENTERPRISE')),
    customer_name TEXT,
    customer_email TEXT,
    company TEXT,
    max_connections INTEGER NOT NULL,
    max_tags INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1,
    activated_at TEXT,
    expires_at TEXT,
    last_heartbeat TEXT,
    instance_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS activations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT NOT NULL,
    instance_id TEXT,
    ip_address TEXT,
    hostname TEXT,
    version TEXT,
    action TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT,
    version TEXT,
    platform TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

console.log('💾 License database initialized');

// ─── License Key Generation ────────────────────────────

const LICENSE_SECRET = process.env.LICENSE_SECRET || 'dms-plc-collector-2026';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'dms-admin-2026';

const TIER_DEFAULTS = {
  FREE: { maxConnections: 1, maxTags: 50 },
  PRO: { maxConnections: 10, maxTags: 500 },
  ENTERPRISE: { maxConnections: 9999, maxTags: 999999 },
};

function generateChecksum(tier, part1, part2) {
  return crypto
    .createHmac('sha256', LICENSE_SECRET)
    .update(`${tier}-${part1}-${part2}`)
    .digest('hex')
    .substring(0, 8)
    .toUpperCase();
}

function generateKey(tier) {
  const part1 = crypto.randomBytes(4).toString('hex').toUpperCase();
  const part2 = crypto.randomBytes(4).toString('hex').toUpperCase();
  const check = generateChecksum(tier, part1, part2);
  return `${tier}-${part1}-${part2}-${check}`;
}

function validateKey(key) {
  if (!key) return { valid: false, tier: null };
  const parts = key.split('-');
  if (parts.length !== 4) return { valid: false, tier: null };
  const [tier, part1, part2, check] = parts;
  if (!['FREE', 'PRO', 'ENTERPRISE'].includes(tier)) return { valid: false, tier: null };
  const expected = generateChecksum(tier, part1, part2);
  return { valid: check === expected, tier: check === expected ? tier : null };
}

// ─── Admin middleware ──────────────────────────────────

function requireAdmin(req, res, next) {
  const auth = req.headers['x-admin-secret'] || req.body?.adminSecret;
  if (auth !== ADMIN_SECRET) {
    return res.status(403).json({ success: false, message: 'Yetkisiz erişim' });
  }
  next();
}

// ─── API Routes ────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM licenses').get();
  const active = db.prepare('SELECT COUNT(*) as count FROM licenses WHERE is_active = 1').get();
  res.json({
    status: 'ok',
    service: 'plc-license-server',
    version: '1.0.0',
    licenses: { total: total.count, active: active.count },
  });
});

// ─── Public: Validate & Activate ───────────────────────

// POST /validate — Validate a license key (called by plc-collector instances)
app.post('/validate', (req, res) => {
  try {
    const { key, instanceId, hostname, version } = req.body;
    
    // First check key format
    const keyCheck = validateKey(key);
    if (!keyCheck.valid) {
      return res.json({ valid: false, message: 'Geçersiz lisans anahtarı formatı' });
    }

    // Check in database
    const license = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(key);
    if (!license) {
      return res.json({ valid: false, message: 'Lisans anahtarı bulunamadı' });
    }

    if (!license.is_active) {
      return res.json({ valid: false, message: 'Lisans devre dışı bırakılmış' });
    }

    // Check expiry
    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      return res.json({ valid: false, message: 'Lisans süresi dolmuş' });
    }

    // Log activation
    db.prepare(`INSERT INTO activations (license_key, instance_id, ip_address, hostname, version, action) VALUES (?,?,?,?,?,?)`)
      .run(key, instanceId || null, req.ip, hostname || null, version || null, 'validate');

    // Update heartbeat
    db.prepare(`UPDATE licenses SET last_heartbeat = datetime('now'), instance_id = ? WHERE license_key = ?`)
      .run(instanceId || null, key);

    res.json({
      valid: true,
      tier: license.tier,
      customer: license.customer_name,
      company: license.company,
      maxConnections: license.max_connections,
      maxTags: license.max_tags,
      expiresAt: license.expires_at,
    });
  } catch (err) {
    res.status(500).json({ valid: false, message: err.message });
  }
});

// ─── Admin: License Management ─────────────────────────

// GET /admin/licenses — List all licenses
app.get('/admin/licenses', requireAdmin, (req, res) => {
  const licenses = db.prepare('SELECT * FROM licenses ORDER BY created_at DESC').all();
  res.json({ data: licenses });
});

// POST /admin/licenses — Create new license
app.post('/admin/licenses', requireAdmin, (req, res) => {
  try {
    const { tier, customerName, customerEmail, company, notes, expiresAt, maxConnections, maxTags } = req.body;
    
    if (!tier || !['FREE', 'PRO', 'ENTERPRISE'].includes(tier)) {
      return res.status(400).json({ success: false, message: 'Geçerli tier: FREE, PRO, ENTERPRISE' });
    }

    const key = generateKey(tier);
    const defaults = TIER_DEFAULTS[tier];

    db.prepare(`INSERT INTO licenses (license_key, tier, customer_name, customer_email, company, max_connections, max_tags, expires_at, notes)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(key, tier, customerName || null, customerEmail || null, company || null,
        maxConnections || defaults.maxConnections, maxTags || defaults.maxTags,
        expiresAt || null, notes || null);

    const license = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(key);
    res.json({ success: true, data: license });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /admin/licenses/:id — Update license
app.put('/admin/licenses/:id', requireAdmin, (req, res) => {
  try {
    const { customerName, customerEmail, company, isActive, expiresAt, maxConnections, maxTags, notes } = req.body;
    db.prepare(`UPDATE licenses SET customer_name=?, customer_email=?, company=?, is_active=?, expires_at=?, max_connections=?, max_tags=?, notes=? WHERE id=?`)
      .run(customerName, customerEmail, company, isActive ? 1 : 0, expiresAt || null, maxConnections, maxTags, notes || null, req.params.id);
    const license = db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: license });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /admin/licenses/:id — Deactivate license
app.delete('/admin/licenses/:id', requireAdmin, (req, res) => {
  db.prepare('UPDATE licenses SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// GET /admin/activations — Activation log
app.get('/admin/activations', requireAdmin, (req, res) => {
  const logs = db.prepare('SELECT * FROM activations ORDER BY created_at DESC LIMIT 100').all();
  res.json({ data: logs });
});

// GET /admin/stats — Dashboard stats
app.get('/admin/stats', requireAdmin, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM licenses').get().c;
  const active = db.prepare("SELECT COUNT(*) as c FROM licenses WHERE is_active = 1").get().c;
  const byTier = db.prepare("SELECT tier, COUNT(*) as count FROM licenses GROUP BY tier").all();
  const recentActivations = db.prepare("SELECT COUNT(*) as c FROM activations WHERE created_at > datetime('now','-7 days')").get().c;
  const totalDownloads = db.prepare("SELECT COUNT(*) as c FROM downloads").get().c;

  res.json({
    data: {
      licenses: { total, active, inactive: total - active },
      byTier: Object.fromEntries(byTier.map(r => [r.tier, r.count])),
      activationsLast7Days: recentActivations,
      totalDownloads,
    },
  });
});

// ─── Download tracking ─────────────────────────────────

app.get('/download/:platform', (req, res) => {
  const { platform } = req.params;
  const version = req.query.v || 'latest';

  // Log download
  db.prepare('INSERT INTO downloads (ip_address, version, platform) VALUES (?,?,?)')
    .run(req.ip, version, platform);

  // In production, redirect to actual download file
  // For now, return download info
  res.json({
    product: 'PLC Data Collector',
    version: '2.0.0',
    platform,
    instructions: platform === 'windows'
      ? 'Node.js 20+ kurun, start.bat çalıştırın'
      : platform === 'docker'
      ? 'docker-compose up -d'
      : 'npm install && npm run dev',
    downloadUrl: `https://github.com/ayhanengin/plc-collector/archive/refs/heads/v2-multi-db.zip`,
  });
});

// ─── Pricing page data ─────────────────────────────────

app.get('/pricing', (req, res) => {
  res.json({
    data: [
      {
        id: 'FREE', name: 'Free', price: 0, currency: 'TRY', period: null,
        features: ['1 PLC bağlantısı', '50 tag tanımı', 'Gerçek zamanlı izleme', 'WebSocket desteği'],
        limits: TIER_DEFAULTS.FREE,
        cta: 'Hemen İndir',
      },
      {
        id: 'PRO', name: 'Professional', price: null, currency: 'TRY', period: 'yıllık',
        features: ['10 PLC bağlantısı', '500 tag tanımı', 'Veri kayıt (SQLite, PostgreSQL, MSSQL, MySQL)', 'SSH Gateway', 'CSV dışa aktarma', 'E-posta desteği'],
        limits: TIER_DEFAULTS.PRO,
        cta: 'İletişime Geçin',
      },
      {
        id: 'ENTERPRISE', name: 'Enterprise', price: null, currency: 'TRY', period: 'yıllık',
        features: ['Sınırsız PLC', 'Sınırsız tag', 'Tüm DB motorları (Oracle dahil)', 'SSH Gateway', 'CSV dışa aktarma', 'Öncelikli destek', 'Özel entegrasyon'],
        limits: TIER_DEFAULTS.ENTERPRISE,
        cta: 'İletişime Geçin',
      },
    ],
  });
});

// ─── Start ─────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🔑 License Server running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Admin:  http://localhost:${PORT}/admin/licenses`);
});
