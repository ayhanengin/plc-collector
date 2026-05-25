/**
 * PostgreSQL Data Adapter
 * Stores tag values in PostgreSQL with optional TimescaleDB support.
 */

import { Pool } from 'pg';
import { IDataAdapter, TagValueRecord, TagValueRow, parseValue } from './IDataAdapter';

export class PostgresAdapter implements IDataAdapter {
  readonly engine = 'postgres';
  private pool: Pool | null = null;

  private config: { host: string; port: number; database: string; user: string; password: string };

  constructor(config?: { host?: string; port?: number; database?: string; user?: string; password?: string }) {
    this.config = {
      host: config?.host || process.env.PG_HOST || 'localhost',
      port: config?.port || parseInt(process.env.PG_PORT || '5432'),
      database: config?.database || process.env.PG_DATABASE || 'plc_collector',
      user: config?.user || process.env.PG_USER || 'postgres',
      password: config?.password || process.env.PG_PASSWORD || 'postgres',
    };
  }

  async connect(): Promise<void> {
    this.pool = new Pool({
      ...this.config,
      max: 10,
    });
    this.pool.on('error', (err) => console.error('💾 PG pool error:', err.message));

    // Test connection
    const client = await this.pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log(`💾 Data logging: PostgreSQL → ${this.config.host}:${this.config.port}/${this.config.database}`);
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async runMigrations(): Promise<void> {
    if (!this.pool) throw new Error('Not connected');
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS tag_values (
          time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          tag_id INTEGER NOT NULL,
          value_numeric DOUBLE PRECISION,
          value_bool BOOLEAN,
          value_text VARCHAR(255),
          quality VARCHAR(10) DEFAULT 'good'
        )
      `);
      await client.query('CREATE INDEX IF NOT EXISTS idx_tag_values_time ON tag_values (tag_id, time DESC)');

      // Try TimescaleDB
      try {
        await client.query(`SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'`);
        const result = await client.query(`SELECT * FROM timescaledb_information.hypertables WHERE hypertable_name = 'tag_values'`);
        if (result.rows.length === 0) {
          await client.query(`SELECT create_hypertable('tag_values', 'time', if_not_exists => TRUE)`);
          console.log('💾 TimescaleDB hypertable created');
        }
      } catch (_) {
        console.log('💾 TimescaleDB not available — using standard table');
      }
    } finally {
      client.release();
    }
  }

  async logValues(entries: TagValueRecord[]): Promise<void> {
    if (!this.pool || entries.length === 0) return;

    const values: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const entry of entries) {
      const { numeric, bool, text } = parseValue(entry.value, entry.dataType);
      values.push(`(NOW(), $${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`);
      params.push(entry.tagId, numeric, bool, text, entry.quality);
      idx += 5;
    }

    try {
      await this.pool.query(
        `INSERT INTO tag_values (time, tag_id, value_numeric, value_bool, value_text, quality) VALUES ${values.join(',')}`,
        params
      );
    } catch (err: any) {
      console.error('💾 PG logValues error:', err.message);
    }
  }

  async getHistory(tagId: number, startTime: string, endTime: string, limit = 1000): Promise<TagValueRow[]> {
    if (!this.pool) return [];
    const result = await this.pool.query(
      `SELECT time, tag_id, value_numeric, value_bool, value_text, quality FROM tag_values
       WHERE tag_id = $1 AND time >= $2 AND time <= $3 ORDER BY time DESC LIMIT $4`,
      [tagId, startTime, endTime, limit]
    );
    return result.rows;
  }

  async getMultiHistory(tagIds: number[], startTime: string, endTime: string, limit = 1000): Promise<TagValueRow[]> {
    if (!this.pool) return [];
    const result = await this.pool.query(
      `SELECT time, tag_id, value_numeric, value_bool, value_text, quality FROM tag_values
       WHERE tag_id = ANY($1) AND time >= $2 AND time <= $3 ORDER BY time DESC LIMIT $4`,
      [tagIds, startTime, endTime, limit]
    );
    return result.rows;
  }
}
