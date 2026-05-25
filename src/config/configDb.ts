/**
 * Config Database — Always SQLite (embedded, zero-config)
 * Stores: connections, tags, gateways, app_settings
 * No external database dependency needed.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'config.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ────────────────────────────────────────────

export function initConfigDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plc_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      protocol TEXT NOT NULL,
      ip TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 102,
      rack INTEGER,
      slot INTEGER,
      unit_id INTEGER,
      is_active INTEGER DEFAULT 1,
      auto_connect INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tag_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      connection_id INTEGER REFERENCES plc_connections(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      data_type TEXT NOT NULL,
      group_name TEXT,
      unit TEXT,
      description TEXT,
      min_value REAL,
      max_value REAL,
      polling_interval_ms INTEGER DEFAULT 1000,
      log_enabled INTEGER DEFAULT 0,
      log_mode TEXT DEFAULT 'polling',
      deadband_value REAL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gateways (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER DEFAULT 22,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      subnet_filter TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  console.log('💾 Config database initialized (SQLite)');
}

// ─── Settings ──────────────────────────────────────────

export const settings = {
  get(key: string): string | null {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as any;
    return row?.value ?? null;
  },
  set(key: string, value: string): void {
    db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`).run(key, value);
  },
};

// ─── Connections ───────────────────────────────────────

export const connections = {
  getAll(): any[] {
    return db.prepare('SELECT * FROM plc_connections WHERE is_active = 1 ORDER BY id').all()
      .map(boolify('is_active', 'auto_connect'));
  },
  getById(id: number): any {
    const row = db.prepare('SELECT * FROM plc_connections WHERE id = ?').get(id);
    return row ? boolify('is_active', 'auto_connect')(row) : null;
  },
  create(data: any): any {
    const stmt = db.prepare(`INSERT INTO plc_connections (name, protocol, ip, port, rack, slot, unit_id, is_active, auto_connect)
      VALUES (@name, @protocol, @ip, @port, @rack, @slot, @unit_id, @is_active, @auto_connect)`);
    const result = stmt.run({
      name: data.name,
      protocol: data.protocol,
      ip: data.ip,
      port: data.port || 102,
      rack: data.rack ?? 0,
      slot: data.slot ?? 1,
      unit_id: data.unit_id ?? null,
      is_active: data.is_active !== false ? 1 : 0,
      auto_connect: data.auto_connect !== false ? 1 : 0,
    });
    return this.getById(result.lastInsertRowid as number);
  },
  update(id: number, data: any): any {
    db.prepare(`UPDATE plc_connections SET name=@name, protocol=@protocol, ip=@ip, port=@port, rack=@rack, slot=@slot,
      unit_id=@unit_id, is_active=@is_active, auto_connect=@auto_connect, updated_at=datetime('now') WHERE id=@id`).run({
      ...data,
      id,
      is_active: data.is_active !== false ? 1 : 0,
      auto_connect: data.auto_connect !== false ? 1 : 0,
    });
    return this.getById(id);
  },
  delete(id: number): void {
    db.prepare('DELETE FROM plc_connections WHERE id = ?').run(id);
  },
  getAutoConnect(): any[] {
    return db.prepare('SELECT id, name FROM plc_connections WHERE auto_connect = 1 AND is_active = 1').all();
  },
};

// ─── Tags ──────────────────────────────────────────────

export const tags = {
  getAll(connectionId?: number): any[] {
    let sql = `SELECT t.*, c.name as connection_name, c.protocol, c.ip
      FROM tag_definitions t LEFT JOIN plc_connections c ON t.connection_id = c.id`;
    if (connectionId) sql += ` WHERE t.connection_id = ?`;
    sql += ' ORDER BY t.id';
    const rows = connectionId
      ? db.prepare(sql).all(connectionId)
      : db.prepare(sql).all();
    return rows.map(boolify('log_enabled'));
  },
  getById(id: number): any {
    const row = db.prepare(`SELECT t.*, c.name as connection_name, c.protocol, c.ip
      FROM tag_definitions t LEFT JOIN plc_connections c ON t.connection_id = c.id WHERE t.id = ?`).get(id);
    return row ? boolify('log_enabled')(row) : null;
  },
  getByConnectionId(connectionId: number): any[] {
    return db.prepare('SELECT * FROM tag_definitions WHERE connection_id = ? ORDER BY id').all(connectionId)
      .map(boolify('log_enabled'));
  },
  create(data: any): any {
    const stmt = db.prepare(`INSERT INTO tag_definitions (connection_id, name, address, data_type, group_name, unit, description,
      min_value, max_value, polling_interval_ms, log_enabled, log_mode, deadband_value)
      VALUES (@connection_id, @name, @address, @data_type, @group_name, @unit, @description,
      @min_value, @max_value, @polling_interval_ms, @log_enabled, @log_mode, @deadband_value)`);
    const result = stmt.run({
      connection_id: data.connection_id,
      name: data.name,
      address: data.address,
      data_type: data.data_type,
      group_name: data.group_name || null,
      unit: data.unit || null,
      description: data.description || null,
      min_value: data.min_value ?? null,
      max_value: data.max_value ?? null,
      polling_interval_ms: data.polling_interval_ms || 1000,
      log_enabled: data.log_enabled ? 1 : 0,
      log_mode: data.log_mode || 'polling',
      deadband_value: data.deadband_value ?? null,
    });
    return this.getById(result.lastInsertRowid as number);
  },
  update(id: number, data: any): any {
    db.prepare(`UPDATE tag_definitions SET connection_id=@connection_id, name=@name, address=@address, data_type=@data_type,
      group_name=@group_name, unit=@unit, description=@description, min_value=@min_value, max_value=@max_value,
      polling_interval_ms=@polling_interval_ms, log_enabled=@log_enabled, log_mode=@log_mode, deadband_value=@deadband_value,
      updated_at=datetime('now') WHERE id=@id`).run({
      ...data, id,
      log_enabled: data.log_enabled ? 1 : 0,
    });
    return this.getById(id);
  },
  delete(id: number): void {
    db.prepare('DELETE FROM tag_definitions WHERE id = ?').run(id);
  },
  getGroups(): string[] {
    return db.prepare('SELECT DISTINCT group_name FROM tag_definitions WHERE group_name IS NOT NULL ORDER BY group_name')
      .all().map((r: any) => r.group_name);
  },
  bulkCreate(items: any[]): { created: number; skipped: number } {
    let created = 0, skipped = 0;
    const insertStmt = db.prepare(`INSERT INTO tag_definitions (connection_id, name, address, data_type, group_name, unit, description,
      polling_interval_ms, log_enabled, log_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const checkStmt = db.prepare('SELECT id FROM tag_definitions WHERE connection_id = ? AND address = ?');

    const runBulk = db.transaction((items: any[]) => {
      for (const item of items) {
        const exists = checkStmt.get(item.connection_id, item.address);
        if (exists) { skipped++; continue; }
        insertStmt.run(item.connection_id, item.name, item.address, item.data_type,
          item.group_name || null, item.unit || null, item.description || null,
          item.polling_interval_ms || 1000, 0, 'polling');
        created++;
      }
    });
    runBulk(items);
    return { created, skipped };
  },
};

// ─── Gateways ──────────────────────────────────────────

export const gateways = {
  getAll(): any[] {
    return db.prepare('SELECT * FROM gateways ORDER BY id').all()
      .map(boolify('is_active'));
  },
  getActive(): any[] {
    return db.prepare('SELECT * FROM gateways WHERE is_active = 1').all()
      .map(boolify('is_active'));
  },
  create(data: any): any {
    const result = db.prepare(`INSERT INTO gateways (name, host, port, username, password, subnet_filter, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      data.name, data.host, data.port || 22, data.username, data.password, data.subnet_filter || '', data.is_active !== false ? 1 : 0);
    return db.prepare('SELECT * FROM gateways WHERE id = ?').get(result.lastInsertRowid);
  },
  update(id: number, data: any): any {
    db.prepare(`UPDATE gateways SET name=?, host=?, port=?, username=?, password=?, subnet_filter=?, is_active=?, updated_at=datetime('now') WHERE id=?`)
      .run(data.name, data.host, data.port || 22, data.username, data.password, data.subnet_filter || '', data.is_active !== false ? 1 : 0, id);
    return db.prepare('SELECT * FROM gateways WHERE id = ?').get(id);
  },
  delete(id: number): void {
    db.prepare('DELETE FROM gateways WHERE id = ?').run(id);
  },
};

// ─── Helper ────────────────────────────────────────────

function boolify(...keys: string[]) {
  return (row: any) => {
    const out = { ...row };
    for (const k of keys) {
      if (k in out) out[k] = Boolean(out[k]);
    }
    return out;
  };
}

export default db;
