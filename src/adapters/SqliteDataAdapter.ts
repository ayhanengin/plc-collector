/**
 * SQLite Data Adapter
 * Stores tag values in a local SQLite file.
 * Good for small-to-medium installations without external DB.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { IDataAdapter, TagValueRecord, TagValueRow, parseValue } from './IDataAdapter';

export class SqliteDataAdapter implements IDataAdapter {
  readonly engine = 'sqlite';
  private db: Database.Database | null = null;
  private insertStmt: Database.Statement | null = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || process.env.SQLITE_DATA_PATH || path.join(process.cwd(), 'data', 'tag_values.db');
  }

  async connect(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    console.log(`💾 Data logging: SQLite → ${this.dbPath}`);
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.insertStmt = null;
    }
  }

  async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Not connected');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tag_values (
        time TEXT NOT NULL DEFAULT (datetime('now')),
        tag_id INTEGER NOT NULL,
        value_numeric REAL,
        value_bool INTEGER,
        value_text TEXT,
        quality TEXT DEFAULT 'good'
      );
      CREATE INDEX IF NOT EXISTS idx_tag_values_time ON tag_values (tag_id, time DESC);
    `);

    // Prepare reusable statement
    this.insertStmt = this.db.prepare(
      `INSERT INTO tag_values (time, tag_id, value_numeric, value_bool, value_text, quality)
       VALUES (datetime('now'), ?, ?, ?, ?, ?)`
    );
  }

  async logValues(entries: TagValueRecord[]): Promise<void> {
    if (!this.db || !this.insertStmt || entries.length === 0) return;

    const insertMany = this.db.transaction((items: TagValueRecord[]) => {
      for (const entry of items) {
        const { numeric, bool, text } = parseValue(entry.value, entry.dataType);
        this.insertStmt!.run(entry.tagId, numeric, bool ? 1 : (bool === false ? 0 : null), text, entry.quality);
      }
    });

    try {
      insertMany(entries);
    } catch (err: any) {
      console.error('💾 SQLite logValues error:', err.message);
    }
  }

  async getHistory(tagId: number, startTime: string, endTime: string, limit = 1000): Promise<TagValueRow[]> {
    if (!this.db) return [];
    return this.db.prepare(
      `SELECT time, tag_id, value_numeric, value_bool, value_text, quality FROM tag_values
       WHERE tag_id = ? AND time >= ? AND time <= ? ORDER BY time DESC LIMIT ?`
    ).all(tagId, startTime, endTime, limit) as TagValueRow[];
  }

  async getMultiHistory(tagIds: number[], startTime: string, endTime: string, limit = 1000): Promise<TagValueRow[]> {
    if (!this.db || tagIds.length === 0) return [];
    const placeholders = tagIds.map(() => '?').join(',');
    return this.db.prepare(
      `SELECT time, tag_id, value_numeric, value_bool, value_text, quality FROM tag_values
       WHERE tag_id IN (${placeholders}) AND time >= ? AND time <= ? ORDER BY time DESC LIMIT ?`
    ).all(...tagIds, startTime, endTime, limit) as TagValueRow[];
  }
}
