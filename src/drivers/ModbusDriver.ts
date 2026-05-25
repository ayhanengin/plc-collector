import { IPlcDriver, ConnectionConfig, TagValue } from './IPlcDriver';

// Modbus address parsing: 00001-09999=Coil, 10001-19999=Discrete Input, 30001-39999=Input Register, 40001-49999=Holding Register
function parseModbusAddress(address: string): { type: 'coil' | 'discrete' | 'input' | 'holding'; register: number } {
  const addr = parseInt(address, 10);
  if (addr >= 40001 && addr <= 49999) return { type: 'holding', register: addr - 40001 };
  if (addr >= 30001 && addr <= 39999) return { type: 'input', register: addr - 30001 };
  if (addr >= 10001 && addr <= 19999) return { type: 'discrete', register: addr - 10001 };
  if (addr >= 1 && addr <= 9999) return { type: 'coil', register: addr - 1 };
  return { type: 'holding', register: addr };
}

export class ModbusDriver implements IPlcDriver {
  readonly protocol = 'modbus';
  private client: any = null;
  private connected = false;

  async connect(config: ConnectionConfig): Promise<void> {
    const ModbusRTU = require('modbus-serial');
    this.client = new ModbusRTU();

    try {
      await this.client.connectTCP(config.ip, { port: config.port || 502 });
      this.client.setID(config.unitId || 1);
      this.client.setTimeout(config.timeout || 5000);
      this.connected = true;
      console.log(`🔌 Modbus TCP connected to ${config.ip}:${config.port || 502}`);
    } catch (err: any) {
      this.connected = false;
      console.error('🔌 Modbus connection error:', err.message);
      throw new Error(`Modbus connection failed: ${err.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        this.client.close(() => {});
      } catch (_) {}
      this.connected = false;
      console.log('🔌 Modbus disconnected');
    }
  }

  isConnected(): boolean {
    return this.connected && this.client?.isOpen;
  }

  async readTag(address: string): Promise<TagValue> {
    const now = new Date();
    if (!this.connected || !this.client) {
      return { value: null, quality: 'bad', timestamp: now };
    }

    try {
      const parsed = parseModbusAddress(address);
      let value: any;

      switch (parsed.type) {
        case 'holding': {
          const result = await this.client.readHoldingRegisters(parsed.register, 1);
          value = result.data[0];
          break;
        }
        case 'input': {
          const result = await this.client.readInputRegisters(parsed.register, 1);
          value = result.data[0];
          break;
        }
        case 'coil': {
          const result = await this.client.readCoils(parsed.register, 1);
          value = result.data[0];
          break;
        }
        case 'discrete': {
          const result = await this.client.readDiscreteInputs(parsed.register, 1);
          value = result.data[0];
          break;
        }
      }

      return { value, quality: 'good', timestamp: now };
    } catch (err: any) {
      console.error(`🔌 Modbus read error [${address}]:`, err.message);
      return { value: null, quality: 'bad', timestamp: now };
    }
  }

  async readTags(addresses: string[]): Promise<Record<string, TagValue>> {
    const result: Record<string, TagValue> = {};
    for (const addr of addresses) {
      result[addr] = await this.readTag(addr);
    }
    return result;
  }

  async writeTag(address: string, value: any): Promise<void> {
    if (!this.connected || !this.client) {
      throw new Error('Modbus not connected');
    }

    try {
      const parsed = parseModbusAddress(address);
      switch (parsed.type) {
        case 'holding':
          await this.client.writeRegister(parsed.register, Number(value));
          break;
        case 'coil':
          await this.client.writeCoil(parsed.register, Boolean(value));
          break;
        default:
          throw new Error(`Cannot write to ${parsed.type} registers`);
      }
    } catch (err: any) {
      console.error(`🔌 Modbus write error [${address}]:`, err.message);
      throw new Error(`Modbus write failed: ${err.message}`);
    }
  }
}
