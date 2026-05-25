/**
 * Migration script: Copy existing PostgreSQL data to SQLite config DB
 * Run once after upgrading from v1 to v2
 */

import dotenv from 'dotenv';
dotenv.config();

import { Pool } from 'pg';
import { initConfigDb, connections, tags, gateways, settings } from './config/configDb';

async function migrate() {
  console.log('🔄 Migrating PostgreSQL → SQLite config DB...\n');

  // Initialize SQLite
  await initConfigDb();

  // Connect to existing PostgreSQL
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'plc_collector',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
  });

  try {
    // 1. Migrate connections
    const connResult = await pool.query('SELECT * FROM plc_connections ORDER BY id');
    const idMap: Record<number, number> = {}; // old_id → new_id

    for (const row of connResult.rows) {
      const created = connections.create({
        name: row.name,
        protocol: row.protocol,
        ip: row.ip,
        port: row.port,
        rack: row.rack,
        slot: row.slot,
        unit_id: row.unit_id,
        is_active: row.is_active,
        auto_connect: row.auto_connect,
      });
      idMap[row.id] = created.id;
      console.log(`  ✅ Connection: ${row.name} (${row.id} → ${created.id})`);
    }

    // 2. Migrate tags
    const tagResult = await pool.query('SELECT * FROM tag_definitions ORDER BY id');
    let tagCount = 0;

    const tagItems = tagResult.rows.map((row: any) => ({
      connection_id: idMap[row.connection_id] || row.connection_id,
      name: row.name,
      address: row.address,
      data_type: row.data_type,
      group_name: row.group_name,
      unit: row.unit,
      description: row.description,
      polling_interval_ms: row.polling_interval_ms || 1000,
    }));

    const result = tags.bulkCreate(tagItems);
    tagCount = result.created;
    console.log(`  ✅ Tags: ${tagCount} created, ${result.skipped} skipped`);

    // 3. Migrate gateways
    try {
      const gwResult = await pool.query('SELECT * FROM gateways ORDER BY id');
      for (const row of gwResult.rows) {
        gateways.create({
          name: row.name,
          host: row.host,
          port: row.port,
          username: row.username,
          password: row.password,
          subnet_filter: row.subnet_filter,
          is_active: row.is_active,
        });
        console.log(`  ✅ Gateway: ${row.name}`);
      }
    } catch (_) {
      console.log('  ⚠️ No gateways table found (skipping)');
    }

    // 4. Mark setup complete
    settings.set('setup_complete', 'true');
    settings.set('db_engine', 'postgres');

    console.log('\n🎉 Migration complete!');
    console.log(`   Connections: ${connResult.rows.length}`);
    console.log(`   Tags: ${tagCount}`);
    console.log(`   ID mapping: ${JSON.stringify(idMap)}`);
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);
