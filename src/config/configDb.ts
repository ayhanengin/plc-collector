/**
 * Config Database — Always SQLite (embedded, zero-config)
 * Uses sql.js (WASM-based) — NO native compilation needed!
 * Stores: connections, tags, gateways, app_settings
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'config.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ─── sql.js Wrapper (better-sqlite3 compatible API) ────

class SqliteWrapper {
  private db: SqlJsDatabase | null = null;
  private _dirty = false;
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;

  async initialize(): Promise<void> {
    const SQL = await initSqlJs();
    
    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }
    // WAL not supported in sql.js (in-memory), but we persist manually
    this.db.run('PRAGMA foreign_keys = ON');
  }

  private ensureDb(): SqlJsDatabase {
    if (!this.db) throw new Error('Database not initialized. Call initConfigDb() first.');
    return this.db;
  }

  /** Save database to disk (debounced) */
  private scheduleSave(): void {
    this._dirty = true;
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.saveToDisk();
    }, 500);
  }

  saveToDisk(): void {
    if (!this._dirty || !this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
    this._dirty = false;
  }

  exec(sql: string): void {
    this.ensureDb().run(sql);
    this.scheduleSave();
  }

  prepare(sql: string): PreparedStatement {
    return new PreparedStatement(this.ensureDb(), sql, () => this.scheduleSave());
  }

  transaction<T>(fn: (items: any[]) => T): (items: any[]) => T {
    return (items: any[]) => {
      const db = this.ensureDb();
      db.run('BEGIN TRANSACTION');
      try {
        const result = fn(items);
        db.run('COMMIT');
        this.scheduleSave();
        return result;
      } catch (err) {
        db.run('ROLLBACK');
        throw err;
      }
    };
  }

  close(): void {
    this.saveToDisk();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

class PreparedStatement {
  constructor(
    private db: SqlJsDatabase,
    private sql: string,
    private onWrite: () => void,
  ) {}

  run(...params: any[]): { lastInsertRowid: number; changes: number } {
    const flatParams = this.flattenParams(params);
    this.db.run(this.sql, flatParams);
    this.onWrite();
    
    const lastId = (this.db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] as number) || 0;
    const changes = (this.db.exec('SELECT changes() as c')[0]?.values[0]?.[0] as number) || 0;
    return { lastInsertRowid: lastId, changes };
  }

  get(...params: any[]): any {
    const flatParams = this.flattenParams(params);
    const stmt = this.db.prepare(this.sql);
    stmt.bind(flatParams);
    
    if (stmt.step()) {
      const columns = stmt.getColumnNames();
      const values = stmt.get();
      stmt.free();
      const row: any = {};
      columns.forEach((col: string, i: number) => { row[col] = values[i]; });
      return row;
    }
    stmt.free();
    return undefined;
  }

  all(...params: any[]): any[] {
    const flatParams = this.flattenParams(params);
    const results: any[] = [];
    const stmt = this.db.prepare(this.sql);
    stmt.bind(flatParams);
    
    while (stmt.step()) {
      const columns = stmt.getColumnNames();
      const values = stmt.get();
      const row: any = {};
      columns.forEach((col: string, i: number) => { row[col] = values[i]; });
      results.push(row);
    }
    stmt.free();
    return results;
  }

  private flattenParams(params: any[]): any[] {
    if (params.length === 0) return [];
    if (params.length === 1 && typeof params[0] === 'object' && params[0] !== null && !Array.isArray(params[0])) {
      // Named params object → convert to positional by parsing SQL
      const obj = params[0];
      const namedParams = this.sql.match(/@\w+/g) || [];
      return namedParams.map(p => {
        const key = p.slice(1); // remove @
        return obj[key] ?? null;
      });
    }
    return params.flat();
  }
}

// ─── Global Database Instance ──────────────────────────

const db = new SqliteWrapper();

// ─── Schema ────────────────────────────────────────────

export async function initConfigDb(): Promise<void> {
  await db.initialize();

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

  console.log('💾 Config database initialized (sql.js — zero native deps)');
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

// Save on process exit
process.on('exit', () => db.close());
process.on('SIGINT', () => { db.close(); process.exit(0); });
process.on('SIGTERM', () => { db.close(); process.exit(0); });

export default db;
