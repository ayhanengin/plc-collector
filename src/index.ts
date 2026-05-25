import dotenv from 'dotenv';
dotenv.config();

import { server } from './server';
import { testConnection } from './config/database';
import { runMigrations, isSetupComplete } from './db/migrations';
import { connectionManager } from './core/ConnectionManager';
import { poller } from './core/Poller';
import pool from './config/database';
import gatewayManager from './core/GatewayManager';

const PORT = parseInt(process.env.PORT || '4000');

async function bootstrap() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║         🔌 PLC Data Collector v1.0.0              ║');
  console.log('║         Industrial IoT Data Platform              ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('');

  // Test database connection
  const dbConnected = await testConnection();
  if (dbConnected) {
    console.log('💾 Database connected');

    // Run migrations if setup is not complete
    const setupDone = await isSetupComplete();
    if (!setupDone) {
      console.log('💾 First run detected — running migrations...');
      try {
        await runMigrations();
      } catch (err: any) {
        console.error('💾 Migration error:', err.message);
      }
    }

    // Initialize gateway tunnels
    try {
      await gatewayManager.initTable();
      const gws = await gatewayManager.getAllGateways();
      if (gws.length > 0) {
        console.log(`🔗 Gateway loaded: ${gws.filter(g => g.is_active).length} active`);
      }
    } catch (err: any) {
      console.error('🔗 Gateway init error:', err.message);
    }

    // Auto-connect PLCs
    try {
      const result = await pool.query(
        'SELECT id, name FROM plc_connections WHERE auto_connect = true AND is_active = true'
      );
      for (const row of result.rows) {
        try {
          await connectionManager.connect(row.id);
          await poller.startPolling(row.id);
          console.log(`🔌 Auto-connected: ${row.name}`);
        } catch (err: any) {
          console.error(`🔌 Auto-connect failed for "${row.name}": ${err.message}`);
        }
      }
    } catch (_) {
      console.log('💾 No connections to auto-connect');
    }
  } else {
    console.log('💾 Database not available — run setup wizard at http://localhost:' + PORT);
  }

  // Start HTTP server
  server.listen(PORT, () => {
    console.log('');
    console.log(`🌐 API Server:  http://localhost:${PORT}/api`);
    console.log(`🌐 WebSocket:   ws://localhost:${PORT}`);
    console.log(`🌐 Dashboard:   http://localhost:5173 (dev) or http://localhost:${PORT} (prod)`);
    console.log('');
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  poller.stopAll();
  gatewayManager.closeAll();
  await connectionManager.disconnectAll();
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down...');
  poller.stopAll();
  gatewayManager.closeAll();
  await connectionManager.disconnectAll();
  await pool.end();
  process.exit(0);
});

bootstrap().catch((err) => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
