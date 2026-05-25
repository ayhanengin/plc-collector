import { IPlcDriver, ConnectionConfig } from '../drivers/IPlcDriver';
import { DriverFactory } from '../drivers/DriverFactory';
import pool from '../config/database';

interface ManagedConnection {
  id: number;
  driver: IPlcDriver;
  config: ConnectionConfig;
  name: string;
  protocol: string;
}

class ConnectionManager {
  private connections: Map<number, ManagedConnection> = new Map();

  async connect(connectionId: number): Promise<void> {
    // Load connection config from database
    const result = await pool.query('SELECT * FROM plc_connections WHERE id = $1', [connectionId]);
    if (result.rows.length === 0) throw new Error(`Connection ${connectionId} not found`);

    const row = result.rows[0];

    // Disconnect existing if any
    if (this.connections.has(connectionId)) {
      await this.disconnect(connectionId);
    }

    const driver = DriverFactory.create(row.protocol);
    const config: ConnectionConfig = {
      ip: row.ip,
      port: row.port,
      rack: row.rack,
      slot: row.slot,
      unitId: row.unit_id,
      timeout: 5000,
    };

    await driver.connect(config);
    this.connections.set(connectionId, {
      id: connectionId,
      driver,
      config,
      name: row.name,
      protocol: row.protocol,
    });

    console.log(`🔌 Connection "${row.name}" (${row.protocol}) established`);
  }

  async disconnect(connectionId: number): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (conn) {
      await conn.driver.disconnect();
      this.connections.delete(connectionId);
      console.log(`🔌 Connection "${conn.name}" disconnected`);
    }
  }

  async disconnectAll(): Promise<void> {
    for (const [id] of this.connections) {
      await this.disconnect(id);
    }
  }

  getDriver(connectionId: number): IPlcDriver | undefined {
    return this.connections.get(connectionId)?.driver;
  }

  getStatus(connectionId: number): { connected: boolean; protocol?: string; name?: string } {
    const conn = this.connections.get(connectionId);
    if (!conn) return { connected: false };
    return {
      connected: conn.driver.isConnected(),
      protocol: conn.protocol,
      name: conn.name,
    };
  }

  getAllStatuses(): Record<number, { connected: boolean; protocol: string; name: string }> {
    const result: Record<number, any> = {};
    for (const [id, conn] of this.connections) {
      result[id] = {
        connected: conn.driver.isConnected(),
        protocol: conn.protocol,
        name: conn.name,
      };
    }
    return result;
  }

  getConnectedIds(): number[] {
    return Array.from(this.connections.keys()).filter(
      (id) => this.connections.get(id)?.driver.isConnected()
    );
  }

  async testConnection(protocol: string, config: ConnectionConfig): Promise<boolean> {
    const driver = DriverFactory.create(protocol);
    const timeoutMs = 8000;
    try {
      const connectPromise = driver.connect(config);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), timeoutMs)
      );
      await Promise.race([connectPromise, timeoutPromise]);
      await driver.disconnect();
      return true;
    } catch (err) {
      try { await driver.disconnect(); } catch (_) {}
      return false;
    }
  }
}

export const connectionManager = new ConnectionManager();
