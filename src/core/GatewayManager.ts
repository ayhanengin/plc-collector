/**
 * SSH Gateway Manager
 * Automatically creates SSH tunnels through a gateway server
 * to reach PLCs on different subnets.
 * 
 * Flow: PLC Collector → SSH Tunnel → Gateway Server → PLC
 * 
 * User sees: PLC IP: 192.168.27.23, Port: 102
 * System does: SSH to gateway → forward local port → connect through tunnel
 */

import { Client as SSHClient } from 'ssh2';
import net from 'net';
import pool from '../config/database';

interface GatewayConfig {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  subnet_filter: string; // e.g., "192.168.27" — auto-use for IPs matching this
  is_active: boolean;
}

interface TunnelInfo {
  localPort: number;
  targetHost: string;
  targetPort: number;
  server: net.Server;
  sshClient: SSHClient;
}

class GatewayManager {
  private tunnels: Map<string, TunnelInfo> = new Map();
  private gateways: GatewayConfig[] = [];
  private nextPort = 20000;

  /**
   * Initialize gateway table in database
   */
  async initTable(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gateways (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        host VARCHAR(100) NOT NULL,
        port INTEGER DEFAULT 22,
        username VARCHAR(100) NOT NULL,
        password VARCHAR(200) NOT NULL,
        subnet_filter VARCHAR(50) DEFAULT '',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await this.loadGateways();
  }

  /**
   * Load gateways from DB
   */
  async loadGateways(): Promise<void> {
    const result = await pool.query('SELECT * FROM gateways WHERE is_active = true');
    this.gateways = result.rows;
  }

  /**
   * Find a matching gateway for a target IP
   */
  findGateway(targetIp: string): GatewayConfig | null {
    for (const gw of this.gateways) {
      if (gw.subnet_filter && targetIp.startsWith(gw.subnet_filter)) {
        return gw;
      }
    }
    return null;
  }

  /**
   * Check if a target IP needs a gateway tunnel
   */
  needsTunnel(targetIp: string): boolean {
    return this.findGateway(targetIp) !== null;
  }

  /**
   * Get or create a tunnel for a target host:port
   * Returns the local connection details (127.0.0.1:localPort)
   */
  async getOrCreateTunnel(targetHost: string, targetPort: number): Promise<{ host: string; port: number }> {
    const key = `${targetHost}:${targetPort}`;
    
    // Return existing tunnel if available
    const existing = this.tunnels.get(key);
    if (existing) {
      return { host: '127.0.0.1', port: existing.localPort };
    }

    // Find gateway
    const gateway = this.findGateway(targetHost);
    if (!gateway) {
      // No gateway needed, connect directly
      return { host: targetHost, port: targetPort };
    }

    // Create SSH tunnel
    const localPort = this.nextPort++;
    const tunnel = await this.createTunnel(gateway, targetHost, targetPort, localPort);
    this.tunnels.set(key, tunnel);
    
    console.log(`🔗 SSH tunnel created: 127.0.0.1:${localPort} → ${gateway.host} → ${targetHost}:${targetPort}`);
    return { host: '127.0.0.1', port: localPort };
  }

  /**
   * Create an SSH tunnel
   */
  private createTunnel(
    gateway: GatewayConfig,
    targetHost: string,
    targetPort: number,
    localPort: number
  ): Promise<TunnelInfo> {
    return new Promise((resolve, reject) => {
      const sshClient = new SSHClient();

      sshClient.on('ready', () => {
        // Create a local TCP server that forwards to the target through SSH
        const server = net.createServer((socket) => {
          sshClient.forwardOut(
            '127.0.0.1', localPort,
            targetHost, targetPort,
            (err, stream) => {
              if (err) {
                console.error(`🔗 Tunnel forward error: ${err.message}`);
                socket.destroy();
                return;
              }
              socket.pipe(stream);
              stream.pipe(socket);
              
              stream.on('close', () => socket.destroy());
              socket.on('close', () => stream.destroy());
            }
          );
        });

        server.listen(localPort, '127.0.0.1', () => {
          resolve({ localPort, targetHost, targetPort, server, sshClient });
        });

        server.on('error', (err) => {
          console.error(`🔗 Tunnel server error: ${err.message}`);
          reject(err);
        });
      });

      sshClient.on('error', (err) => {
        console.error(`🔗 SSH connection error to ${gateway.host}: ${err.message}`);
        reject(err);
      });

      sshClient.on('close', () => {
        console.log(`🔗 SSH tunnel closed for ${targetHost}:${targetPort}`);
        const key = `${targetHost}:${targetPort}`;
        const tunnel = this.tunnels.get(key);
        if (tunnel) {
          tunnel.server.close();
          this.tunnels.delete(key);
        }
      });

      sshClient.connect({
        host: gateway.host,
        port: gateway.port || 22,
        username: gateway.username,
        password: gateway.password,
        readyTimeout: 10000,
        keepaliveInterval: 30000,
      });
    });
  }

  /**
   * Close a specific tunnel
   */
  closeTunnel(targetHost: string, targetPort: number): void {
    const key = `${targetHost}:${targetPort}`;
    const tunnel = this.tunnels.get(key);
    if (tunnel) {
      tunnel.sshClient.end();
      tunnel.server.close();
      this.tunnels.delete(key);
    }
  }

  /**
   * Close all tunnels
   */
  closeAll(): void {
    for (const [key, tunnel] of this.tunnels) {
      tunnel.sshClient.end();
      tunnel.server.close();
    }
    this.tunnels.clear();
  }

  /**
   * Get all active tunnels info
   */
  getActiveTunnels(): Array<{ target: string; localPort: number }> {
    return Array.from(this.tunnels.entries()).map(([key, t]) => ({
      target: key,
      localPort: t.localPort,
    }));
  }

  /**
   * CRUD operations
   */
  async createGateway(data: Partial<GatewayConfig>): Promise<any> {
    const result = await pool.query(
      `INSERT INTO gateways (name, host, port, username, password, subnet_filter, is_active) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [data.name, data.host, data.port || 22, data.username, data.password, data.subnet_filter || '', data.is_active !== false]
    );
    await this.loadGateways();
    return result.rows[0];
  }

  async updateGateway(id: number, data: Partial<GatewayConfig>): Promise<any> {
    const result = await pool.query(
      `UPDATE gateways SET name=$1, host=$2, port=$3, username=$4, password=$5, subnet_filter=$6, is_active=$7, updated_at=NOW() WHERE id=$8 RETURNING *`,
      [data.name, data.host, data.port || 22, data.username, data.password, data.subnet_filter || '', data.is_active !== false, id]
    );
    await this.loadGateways();
    return result.rows[0];
  }

  async deleteGateway(id: number): Promise<void> {
    await pool.query('DELETE FROM gateways WHERE id = $1', [id]);
    await this.loadGateways();
  }

  async getAllGateways(): Promise<GatewayConfig[]> {
    const result = await pool.query('SELECT * FROM gateways ORDER BY id');
    return result.rows;
  }

  async testGateway(data: Partial<GatewayConfig>): Promise<boolean> {
    return new Promise((resolve) => {
      const client = new SSHClient();
      const timeout = setTimeout(() => {
        client.end();
        resolve(false);
      }, 10000);

      client.on('ready', () => {
        clearTimeout(timeout);
        client.end();
        resolve(true);
      });

      client.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });

      client.connect({
        host: data.host!,
        port: data.port || 22,
        username: data.username!,
        password: data.password!,
        readyTimeout: 8000,
      });
    });
  }
}

export const gatewayManager = new GatewayManager();
export default gatewayManager;
