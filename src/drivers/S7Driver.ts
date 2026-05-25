import { IPlcDriver, ConnectionConfig, TagValue } from './IPlcDriver';
import gatewayManager from '../core/GatewayManager';

export class S7Driver implements IPlcDriver {
  readonly protocol = 's7';
  private conn: any = null;
  private connected = false;
  private itemsAdded: Set<string> = new Set();
  // Map original address → translated address for lookup
  private addressMap: Map<string, string> = new Map();

  /**
   * Convert TIA Portal address format to nodes7 format:
   *   DB208.DBD12  →  DB208,REAL12    (DWORD → REAL by default)
   *   DB208.DBW10  →  DB208,INT10     (WORD → INT)
   *   DB208.DBB5   →  DB208,BYTE5     (BYTE)
   *   DB208.DBX0.0 →  DB208,X0.0      (BIT)
   *   DB208,REAL12 →  DB208,REAL12    (already nodes7 format, pass through)
   */
  private translateAddress(address: string, dataType?: string): string {
    // Already in nodes7 format (contains comma)
    if (address.includes(',')) return address;

    // TIA format: DB{n}.DB{type}{offset}
    const tiaMatch = address.match(/^DB(\d+)\.DB([BWDX])(\d+(?:\.\d+)?)$/i);
    if (tiaMatch) {
      const dbNum = tiaMatch[1];
      const typeChar = tiaMatch[2].toUpperCase();
      const offset = tiaMatch[3];

      let n7type: string;
      switch (typeChar) {
        case 'X': n7type = 'X'; break;
        case 'B': n7type = 'BYTE'; break;
        case 'W': n7type = 'INT'; break;
        case 'D':
          if (dataType && dataType.toUpperCase() === 'DINT') {
            n7type = 'DINT';
          } else {
            n7type = 'REAL';
          }
          break;
        default: n7type = 'REAL';
      }
      const translated = `DB${dbNum},${n7type}${offset}`;
      console.log(`📍 Address translated: ${address} → ${translated}`);
      return translated;
    }

    return address;
  }

  async connect(config: ConnectionConfig): Promise<void> {
    const nodes7 = require('nodes7');
    this.conn = new nodes7({ silent: true });

    // Use our translator for nodes7
    this.conn.setTranslationCB((tag: string) => tag);

    // Check if we need a gateway tunnel
    let connectHost = config.ip;
    let connectPort = config.port || 102;

    if (gatewayManager.needsTunnel(config.ip)) {
      try {
        const tunnel = await gatewayManager.getOrCreateTunnel(config.ip, config.port || 102);
        connectHost = tunnel.host;
        connectPort = tunnel.port;
        console.log(`🔗 Using gateway tunnel for ${config.ip}:${config.port || 102} → ${connectHost}:${connectPort}`);
      } catch (err: any) {
        console.error(`🔗 Gateway tunnel failed: ${err.message}, trying direct connection`);
      }
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = config.timeout || 5000;
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.connected = false;
          try { this.conn.dropConnection(); } catch (_) {}
          reject(new Error(`S7 connection timeout after ${timeout}ms`));
        }
      }, timeout);

      const connParams = {
        host: connectHost,
        port: connectPort,
        rack: config.rack ?? 0,
        slot: config.slot ?? 1,
        timeout: timeout,
      };

      this.conn.initiateConnection(connParams, (err: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          console.error('🔌 S7 connection error:', err);
          this.connected = false;
          reject(new Error(`S7 connection failed: ${err}`));
        } else {
          console.log(`🔌 S7 connected to ${config.ip}:${config.port || 102}${connectHost !== config.ip ? ` (via tunnel ${connectHost}:${connectPort})` : ''}`);
          this.connected = true;
          resolve();
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.conn) {
      this.conn.dropConnection();
      this.connected = false;
      this.itemsAdded.clear();
      this.addressMap.clear();
      console.log('🔌 S7 disconnected');
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async readTag(address: string, dataType?: string): Promise<TagValue> {
    const result = await this.readTags([address], dataType);
    return result[address] || { value: null, quality: 'bad', timestamp: new Date() };
  }

  async readTags(addresses: string[], dataType?: string): Promise<Record<string, TagValue>> {
    if (!this.connected || !this.conn) {
      const result: Record<string, TagValue> = {};
      for (const addr of addresses) {
        result[addr] = { value: null, quality: 'bad', timestamp: new Date() };
      }
      return result;
    }

    // Translate and add items
    for (const addr of addresses) {
      if (!this.itemsAdded.has(addr)) {
        const translated = this.translateAddress(addr, dataType);
        this.addressMap.set(addr, translated);
        this.conn.addItems(translated);
        this.itemsAdded.add(addr);
      }
    }

    return new Promise((resolve) => {
      this.conn.readAllItems((err: any, values: Record<string, any>) => {
        const now = new Date();
        const result: Record<string, TagValue> = {};

        // nodes7 returns err=true for partial read errors
        // but values may still contain valid data
        if (err && !values) {
          console.error('🔌 S7 read error (no data):', err);
          for (const addr of addresses) {
            result[addr] = { value: null, quality: 'bad', timestamp: now };
          }
        } else {
          if (err) {
            console.warn('🔌 S7 partial read error (some tags may be bad)');
          }
          for (const addr of addresses) {
            const translatedAddr = this.addressMap.get(addr) || addr;
            const val = values ? values[translatedAddr] : undefined;
            const isBad = val === undefined || val === null || (typeof val === 'string' && val === 'BAD 255');
            result[addr] = {
              value: isBad ? null : val,
              quality: isBad ? (err ? 'bad' : 'uncertain') : 'good',
              timestamp: now,
            };
            if (!isBad) {
              console.log(`📊 Read ${translatedAddr} = ${val}`);
            }
          }
        }
        resolve(result);
      });
    });
  }

  async writeTag(address: string, value: any, dataType?: string): Promise<void> {
    if (!this.connected || !this.conn) {
      throw new Error('S7 not connected');
    }

    const translated = this.translateAddress(address, dataType);
    if (!this.itemsAdded.has(address)) {
      this.addressMap.set(address, translated);
      this.conn.addItems(translated);
      this.itemsAdded.add(address);
    }

    return new Promise((resolve, reject) => {
      this.conn.writeItems(translated, value, (err: any) => {
        if (err) {
          console.error('🔌 S7 write error:', err);
          reject(new Error(`S7 write failed: ${err}`));
        } else {
          resolve();
        }
      });
    });
  }
}
