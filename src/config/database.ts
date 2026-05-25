import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'plc_collector',
  ssl: process.env.DB_HOST !== 'localhost' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('💾 Unexpected DB pool error:', err);
});

export default pool;

export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    return true;
  } catch (err: any) {
    console.error('💾 Database connection failed:', err.message);
    return false;
  }
}

export async function testExternalConnection(config: {
  host: string; port: number; user: string; password: string; database: string;
}): Promise<boolean> {
  const testPool = new Pool(config);
  try {
    const client = await testPool.connect();
    await client.query('SELECT NOW()');
    client.release();
    await testPool.end();
    return true;
  } catch (err: any) {
    console.error('💾 External DB test failed:', err.message);
    try { await testPool.end(); } catch (_) {}
    return false;
  }
}
