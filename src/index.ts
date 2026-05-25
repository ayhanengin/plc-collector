import dotenv from 'dotenv';
dotenv.config();

import { server } from './server';
import { initConfigDb, connections, settings } from './config/configDb';
import { initDataAdapter, getDataAdapter } from './adapters/AdapterFactory';
import { connectionManager } from './core/ConnectionManager';
import { poller } from './core/Poller';
import gatewayManager from './core/GatewayManager';
import { licenseManager } from './core/LicenseManager';

const PORT = parseInt(process.env.PORT || '4000');

async function bootstrap() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║         🔌 PLC Data Collector v2.0.0              ║');
  console.log('║         Industrial IoT Data Platform              ║');
  console.log('║         Multi-DB Edition                          ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('');

  // 1. Initialize Config DB (sql.js — zero native deps)
  await initConfigDb();

  // 2. Initialize License
  licenseManager.init();
  console.log(`🔑 License: ${licenseManager.tier}`);
  // Online validation (non-blocking)
  await licenseManager.validateOnline();

  // 2. Initialize Data Adapter (based on user's choice)
  try {
    const adapter = await initDataAdapter();
    console.log(`💾 Data adapter: ${adapter.engine}`);
  } catch (err: any) {
    console.error(`💾 Data adapter init error: ${err.message}`);
    console.log('💾 Falling back to NullAdapter (no data logging)');
  }

  // 3. Load gateways
  try {
    gatewayManager.loadGateways();
    const gws = gatewayManager.getAllGateways();
    if (gws.length > 0) {
      console.log(`🔗 Gateways loaded: ${gws.filter((g: any) => g.is_active).length} active`);
    }
  } catch (err: any) {
    console.error('🔗 Gateway init error:', err.message);
  }

  // 4. Auto-connect PLCs
  try {
    const autoConns = connections.getAutoConnect();
    for (const row of autoConns) {
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

  // Mark setup as complete if not already
  if (settings.get('setup_complete') !== 'true') {
    settings.set('setup_complete', 'true');
  }

  // 5. Start HTTP server
  server.listen(PORT, () => {
    console.log('');
    console.log(`🌐 API Server:  http://localhost:${PORT}/api`);
    console.log(`🌐 WebSocket:   ws://localhost:${PORT}`);
    console.log(`🌐 Dashboard:   http://localhost:5173 (dev) or http://localhost:${PORT} (prod)`);
    console.log('');
  });
}

// Graceful shutdown
async function shutdown() {
  console.log('\n🛑 Shutting down...');
  poller.stopAll();
  gatewayManager.closeAll();
  await connectionManager.disconnectAll();
  try {
    const adapter = getDataAdapter();
    await adapter.disconnect();
  } catch (_) {}
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

bootstrap().catch((err) => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
