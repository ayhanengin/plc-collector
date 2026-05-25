import pool from '../config/database';

export async function runMigrations(): Promise<void> {
  console.log('💾 Running database migrations...');

  const queries = [
    // App settings table
    `CREATE TABLE IF NOT EXISTS app_settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // PLC Connections
    `CREATE TABLE IF NOT EXISTS plc_connections (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      protocol VARCHAR(20) NOT NULL,
      ip VARCHAR(45) NOT NULL,
      port INTEGER NOT NULL DEFAULT 102,
      rack INTEGER,
      slot INTEGER,
      unit_id INTEGER,
      is_active BOOLEAN DEFAULT true,
      auto_connect BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // Tag Definitions
    `CREATE TABLE IF NOT EXISTS tag_definitions (
      id SERIAL PRIMARY KEY,
      connection_id INTEGER REFERENCES plc_connections(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      address VARCHAR(100) NOT NULL,
      data_type VARCHAR(20) NOT NULL,
      group_name VARCHAR(100),
      unit VARCHAR(20),
      description VARCHAR(255),
      min_value DOUBLE PRECISION,
      max_value DOUBLE PRECISION,
      polling_interval_ms INTEGER DEFAULT 1000,
      log_enabled BOOLEAN DEFAULT false,
      log_mode VARCHAR(20) DEFAULT 'polling',
      deadband_value DOUBLE PRECISION,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // Tag Values (time-series data)
    `CREATE TABLE IF NOT EXISTS tag_values (
      time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      tag_id INTEGER NOT NULL,
      value_numeric DOUBLE PRECISION,
      value_bool BOOLEAN,
      value_text VARCHAR(255),
      quality VARCHAR(10) DEFAULT 'good'
    )`,

    // Index for fast time-series queries
    `CREATE INDEX IF NOT EXISTS idx_tag_values_time ON tag_values (tag_id, time DESC)`,
  ];

  const client = await pool.connect();
  try {
    for (const sql of queries) {
      await client.query(sql);
    }

    // Check if TimescaleDB is available
    try {
      await client.query(`SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'`);
      const result = await client.query(`SELECT * FROM timescaledb_information.hypertables WHERE hypertable_name = 'tag_values'`);
      if (result.rows.length === 0) {
        await client.query(`SELECT create_hypertable('tag_values', 'time', if_not_exists => TRUE)`);
        console.log('💾 TimescaleDB hypertable created for tag_values');
      }
    } catch (_) {
      console.log('💾 TimescaleDB not available — using standard PostgreSQL table');
    }

    // Mark setup as complete
    await client.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('setup_complete', 'true', NOW())
       ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW()`
    );

    console.log('💾 Database migrations completed successfully');
  } finally {
    client.release();
  }
}

export async function isSetupComplete(): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'setup_complete'`
    );
    return result.rows.length > 0 && result.rows[0].value === 'true';
  } catch (_) {
    return false;
  }
}
