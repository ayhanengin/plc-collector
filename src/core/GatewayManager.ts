/**
 * SSH Gateway Manager
 * Automatically creates SSH tunnels through a gateway server
 * to reach PLCs on different subnets.
 * 
 * v2: Uses configDb (SQLite) instead of pg pool
 */

import { Client as SSHClient } from 'ssh2';
import net from 'net';
import { gateways as gwDb } from '../config/configDb';

interface GatewayConfig {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  subnet_filter: string;
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
  private gatewayCache: GatewayConfig[] = [];
  private nextPort = 20000;

  /**
   * Load gateways from configDb
   */
  loadGateways(): void {
    this.gatewayCache = gwDb.getActive();
  }

  findGateway(targetIp: string): GatewayConfig | null {
    for (const gw of this.gatewayCache) {
      if (gw.subnet_filter && targetIp.startsWith(gw.subnet_filter)) {
        return gw;
      }
    }
    return null;
  }

  needsTunnel(targetIp: string): boolean {
    return this.findGateway(targetIp) !== null;
  }

  async getOrCreateTunnel(targetHost: string, targetPort: number): Promise<{ host: string; port: number }> {
    const key = `${targetHost}:${targetPort}`;
    
    const existing = this.tunnels.get(key);
    if (existing) {
      return { host: '127.0.0.1', port: existing.localPort };
    }

    const gateway = this.findGateway(targetHost);
    if (!gateway) {
      return { host: targetHost, port: targetPort };
    }

    const localPort = this.nextPort++;
    const tunnel = await this.createTunnel(gateway, targetHost, targetPort, localPort);
    this.tunnels.set(key, tunnel);
    
    console.log(`🔗 SSH tunnel created: 127.0.0.1:${localPort} → ${gateway.host} → ${targetHost}:${targetPort}`);
    return { host: '127.0.0.1', port: localPort };
  }

  private createTunnel(
    gateway: GatewayConfig,
    targetHost: string,
    targetPort: number,
    localPort: number
  ): Promise<TunnelInfo> {
    return new Promise((resolve, reject) => {
      const sshClient = new SSHClient();

      sshClient.on('ready', () => {
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

  closeTunnel(targetHost: string, targetPort: number): void {
    const key = `${targetHost}:${targetPort}`;
    const tunnel = this.tunnels.get(key);
    if (tunnel) {
      tunnel.sshClient.end();
      tunnel.server.close();
      this.tunnels.delete(key);
    }
  }

  closeAll(): void {
    for (const [key, tunnel] of this.tunnels) {
      tunnel.sshClient.end();
      tunnel.server.close();
    }
    this.tunnels.clear();
  }

  getActiveTunnels(): Array<{ target: string; localPort: number }> {
    return Array.from(this.tunnels.entries()).map(([key, t]) => ({
      target: key,
      localPort: t.localPort,
    }));
  }

  // CRUD — now using configDb
  createGateway(data: Partial<GatewayConfig>): any {
    const result = gwDb.create(data);
    this.loadGateways();
    return result;
  }

  updateGateway(id: number, data: Partial<GatewayConfig>): any {
    const result = gwDb.update(id, data);
    this.loadGateways();
    return result;
  }

  deleteGateway(id: number): void {
    gwDb.delete(id);
    this.loadGateways();
  }

  getAllGateways(): any[] {
    return gwDb.getAll();
  }

  testGateway(data: Partial<GatewayConfig>): Promise<boolean> {
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
