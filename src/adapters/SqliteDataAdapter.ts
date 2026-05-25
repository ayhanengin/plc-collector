/**
 * SQLite Data Adapter — sql.js (WASM, zero native deps)
 * Stores tag values in a local SQLite file.
 * Good for small-to-medium installations without external DB.
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { IDataAdapter, TagValueRecord, TagValueRow, parseValue } from './IDataAdapter';

export class SqliteDataAdapter implements IDataAdapter {
  readonly engine = 'sqlite';
  private db: SqlJsDatabase | null = null;
  private dbPath: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || process.env.SQLITE_DATA_PATH || path.join(process.cwd(), 'data', 'tag_values.db');
  }

  async connect(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const SQL = await initSqlJs();

    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }
    this.db.run('PRAGMA foreign_keys = ON');
    console.log(`💾 Data logging: SQLite (sql.js) → ${this.dbPath}`);
  }

  async disconnect(): Promise<void> {
    this.saveToDisk();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveToDisk();
    }, 2000); // Save every 2 seconds at most
  }

  private saveToDisk(): void {
    if (!this.db) return;
    try {
      const data = this.db.export();
      fs.writeFileSync(this.dbPath, Buffer.from(data));
    } catch (err: any) {
      console.error('💾 SQLite save error:', err.message);
    }
  }

  async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Not connected');
    this.db.run(`
      CREATE TABLE IF NOT EXISTS tag_values (
        time TEXT NOT NULL DEFAULT (datetime('now')),
        tag_id INTEGER NOT NULL,
        value_numeric REAL,
        value_bool INTEGER,
        value_text TEXT,
        quality TEXT DEFAULT 'good'
      );
    `);
    // Index creation separately
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_tag_values_time ON tag_values (tag_id, time DESC);`);
    this.saveToDisk();
  }

  async logValues(entries: TagValueRecord[]): Promise<void> {
    if (!this.db || entries.length === 0) return;

    try {
      this.db.run('BEGIN TRANSACTION');
      const stmt = this.db.prepare(
        `INSERT INTO tag_values (time, tag_id, value_numeric, value_bool, value_text, quality)
         VALUES (datetime('now'), ?, ?, ?, ?, ?)`
      );
      for (const entry of entries) {
        const { numeric, bool, text } = parseValue(entry.value, entry.dataType);
        stmt.run([entry.tagId, numeric, bool ? 1 : (bool === false ? 0 : null), text, entry.quality]);
      }
      stmt.free();
      this.db.run('COMMIT');
      this.scheduleSave();
    } catch (err: any) {
      try { this.db.run('ROLLBACK'); } catch (_) {}
      console.error('💾 SQLite logValues error:', err.message);
    }
  }

  async getHistory(tagId: number, startTime: string, endTime: string, limit = 1000): Promise<TagValueRow[]> {
    if (!this.db) return [];
    const results: TagValueRow[] = [];
    const stmt = this.db.prepare(
      `SELECT time, tag_id, value_numeric, value_bool, value_text, quality FROM tag_values
       WHERE tag_id = ? AND time >= ? AND time <= ? ORDER BY time DESC LIMIT ?`
    );
    stmt.bind([tagId, startTime, endTime, limit]);
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      results.push(row);
    }
    stmt.free();
    return results;
  }

  async getMultiHistory(tagIds: number[], startTime: string, endTime: string, limit = 1000): Promise<TagValueRow[]> {
    if (!this.db || tagIds.length === 0) return [];
    const placeholders = tagIds.map(() => '?').join(',');
    const results: TagValueRow[] = [];
    const stmt = this.db.prepare(
      `SELECT time, tag_id, value_numeric, value_bool, value_text, quality FROM tag_values
       WHERE tag_id IN (${placeholders}) AND time >= ? AND time <= ? ORDER BY time DESC LIMIT ?`
    );
    stmt.bind([...tagIds, startTime, endTime, limit]);
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      results.push(row);
    }
    stmt.free();
    return results;
  }
}
