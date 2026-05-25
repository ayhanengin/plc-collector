import { IPlcDriver, ConnectionConfig, TagValue } from './IPlcDriver';

// ─── Modbus Address Map ────────────────────────────────
// 00001-09999 → Coil (FC01/FC05/FC15)         Boolean R/W
// 10001-19999 → Discrete Input (FC02)          Boolean R
// 30001-39999 → Input Register (FC04)          16-bit R
// 40001-49999 → Holding Register (FC03/FC06/FC16) 16-bit R/W

type RegisterType = 'coil' | 'discrete' | 'input' | 'holding';

interface ParsedAddress {
  type: RegisterType;
  register: number;
}

// ─── Supported Data Types ──────────────────────────────
// UINT16 / INT16   → 1 register
// UINT32 / INT32   → 2 registers
// FLOAT32          → 2 registers (IEEE 754)
// FLOAT64          → 4 registers (IEEE 754 double)
// BOOL             → single coil/discrete bit
// STRING           → N registers

type ModbusDataType = 'BOOL' | 'UINT16' | 'INT16' | 'UINT32' | 'INT32' | 'FLOAT32' | 'FLOAT64' | 'STRING';

// Byte order options (critical for multi-register reads)
type ByteOrder = 'BE' | 'LE' | 'MBE' | 'MLE';
// BE  = Big Endian     (AB CD) — Modicon default
// LE  = Little Endian  (CD AB) — Some Siemens, ABB
// MBE = Mid-Big Endian (BA DC) — Some Omron, Mitsubishi
// MLE = Mid-Little     (DC BA) — Rare

function getRegisterCount(dataType: ModbusDataType): number {
  switch (dataType) {
    case 'BOOL': return 1;
    case 'UINT16': case 'INT16': return 1;
    case 'UINT32': case 'INT32': case 'FLOAT32': return 2;
    case 'FLOAT64': return 4;
    case 'STRING': return 1; // per character pair
    default: return 1;
  }
}

// ─── Address Parser ────────────────────────────────────

function parseModbusAddress(address: string): ParsedAddress {
  // Support formats: "40001", "HR100", "COIL1", "DI50", "IR200"
  const clean = address.trim().toUpperCase();

  // Named format: HR100, COIL5, DI50, IR200
  if (clean.startsWith('HR')) return { type: 'holding', register: parseInt(clean.slice(2), 10) };
  if (clean.startsWith('IR')) return { type: 'input', register: parseInt(clean.slice(2), 10) };
  if (clean.startsWith('DI')) return { type: 'discrete', register: parseInt(clean.slice(2), 10) };
  if (clean.startsWith('COIL')) return { type: 'coil', register: parseInt(clean.slice(4), 10) };

  // Numeric Modicon format
  const addr = parseInt(clean, 10);
  if (addr >= 40001 && addr <= 49999) return { type: 'holding', register: addr - 40001 };
  if (addr >= 30001 && addr <= 39999) return { type: 'input', register: addr - 30001 };
  if (addr >= 10001 && addr <= 19999) return { type: 'discrete', register: addr - 10001 };
  if (addr >= 1 && addr <= 9999) return { type: 'coil', register: addr - 1 };

  // Fallback: treat as holding register offset
  return { type: 'holding', register: addr };
}

// ─── Multi-Register Value Conversion ───────────────────

function registersToValue(registers: number[], dataType: ModbusDataType, byteOrder: ByteOrder = 'BE'): any {
  if (dataType === 'BOOL') return Boolean(registers[0]);
  if (dataType === 'UINT16') return registers[0];
  if (dataType === 'INT16') return registers[0] > 32767 ? registers[0] - 65536 : registers[0];

  // Build byte buffer from register words
  const buf = Buffer.alloc(registers.length * 2);
  for (let i = 0; i < registers.length; i++) {
    buf.writeUInt16BE(registers[i], i * 2);
  }

  // Apply byte order swap
  const ordered = applyByteOrder(buf, byteOrder);

  switch (dataType) {
    case 'UINT32': return ordered.readUInt32BE(0);
    case 'INT32': return ordered.readInt32BE(0);
    case 'FLOAT32': return parseFloat(ordered.readFloatBE(0).toFixed(6));
    case 'FLOAT64': return parseFloat(ordered.readDoubleBE(0).toFixed(10));
    case 'STRING': return ordered.toString('ascii').replace(/\0/g, '');
    default: return registers[0];
  }
}

function valueToRegisters(value: any, dataType: ModbusDataType, byteOrder: ByteOrder = 'BE'): number[] {
  if (dataType === 'BOOL') return [value ? 1 : 0];
  if (dataType === 'UINT16') return [Number(value) & 0xFFFF];
  if (dataType === 'INT16') {
    const v = Number(value);
    return [v < 0 ? v + 65536 : v];
  }

  const regCount = getRegisterCount(dataType);
  const buf = Buffer.alloc(regCount * 2);

  switch (dataType) {
    case 'UINT32': buf.writeUInt32BE(Number(value), 0); break;
    case 'INT32': buf.writeInt32BE(Number(value), 0); break;
    case 'FLOAT32': buf.writeFloatBE(Number(value), 0); break;
    case 'FLOAT64': buf.writeDoubleBE(Number(value), 0); break;
    case 'STRING': {
      const str = String(value);
      for (let i = 0; i < Math.min(str.length, regCount * 2); i++) {
        buf.writeUInt8(str.charCodeAt(i), i);
      }
      break;
    }
  }

  const ordered = applyByteOrderReverse(buf, byteOrder);
  const regs: number[] = [];
  for (let i = 0; i < regCount; i++) {
    regs.push(ordered.readUInt16BE(i * 2));
  }
  return regs;
}

function applyByteOrder(buf: Buffer, order: ByteOrder): Buffer {
  if (order === 'BE') return buf; // AB CD — no swap needed
  const out = Buffer.alloc(buf.length);
  if (order === 'LE') {
    // CD AB — swap register pairs
    for (let i = 0; i < buf.length; i += 2) {
      const pair = Math.floor(i / 2);
      const target = (Math.floor(buf.length / 2) - 1 - pair) * 2;
      out[target] = buf[i];
      out[target + 1] = buf[i + 1];
    }
  } else if (order === 'MBE') {
    // BA DC — swap bytes within each register
    for (let i = 0; i < buf.length; i += 2) {
      out[i] = buf[i + 1];
      out[i + 1] = buf[i];
    }
  } else if (order === 'MLE') {
    // DC BA — swap bytes within registers + swap register pairs
    for (let i = 0; i < buf.length; i += 2) {
      const pair = Math.floor(i / 2);
      const target = (Math.floor(buf.length / 2) - 1 - pair) * 2;
      out[target] = buf[i + 1];
      out[target + 1] = buf[i];
    }
  }
  return out;
}

function applyByteOrderReverse(buf: Buffer, order: ByteOrder): Buffer {
  // Reverse is same operation for all symmetric swaps
  return applyByteOrder(buf, order);
}

// ─── Scaling ───────────────────────────────────────────

interface ScaleConfig {
  rawMin: number;
  rawMax: number;
  engMin: number;
  engMax: number;
}

function applyScaling(raw: number, scale?: ScaleConfig): number {
  if (!scale) return raw;
  const { rawMin, rawMax, engMin, engMax } = scale;
  return engMin + ((raw - rawMin) / (rawMax - rawMin)) * (engMax - engMin);
}

// ─── Modbus Driver ─────────────────────────────────────

export class ModbusDriver implements IPlcDriver {
  readonly protocol = 'modbus';
  private client: any = null;
  private connected = false;
  private config: ConnectionConfig | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT = 10;
  private readonly RECONNECT_DELAY = 5000;

  async connect(config: ConnectionConfig): Promise<void> {
    const ModbusRTU = require('modbus-serial');
    this.client = new ModbusRTU();
    this.config = config;

    try {
      await this.client.connectTCP(config.ip, { port: config.port || 502 });
      this.client.setID(config.unitId || 1);
      this.client.setTimeout(config.timeout || 5000);
      this.connected = true;
      this.reconnectAttempts = 0;
      console.log(`🔌 Modbus TCP connected to ${config.ip}:${config.port || 502} (Unit ID: ${config.unitId || 1})`);
    } catch (err: any) {
      this.connected = false;
      console.error('🔌 Modbus connection error:', err.message);
      this.scheduleReconnect();
      throw new Error(`Modbus connection failed: ${err.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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

  // ─── Single Tag Read (with data type + byte order) ───

  async readTag(address: string, dataType?: string): Promise<TagValue> {
    const now = new Date();
    if (!this.isConnected()) {
      this.scheduleReconnect();
      return { value: null, quality: 'bad', timestamp: now };
    }

    try {
      const parsed = parseModbusAddress(address);
      const dt = (dataType?.toUpperCase() || 'UINT16') as ModbusDataType;
      const regCount = getRegisterCount(dt);

      // Extract byte order from dataType string (e.g. "FLOAT32:LE")
      let byteOrder: ByteOrder = 'BE';
      if (dataType?.includes(':')) {
        byteOrder = dataType.split(':')[1].toUpperCase() as ByteOrder;
      }

      let registers: number[] = [];

      switch (parsed.type) {
        case 'holding': {
          const result = await this.client.readHoldingRegisters(parsed.register, regCount);
          registers = result.data;
          break;
        }
        case 'input': {
          const result = await this.client.readInputRegisters(parsed.register, regCount);
          registers = result.data;
          break;
        }
        case 'coil': {
          const result = await this.client.readCoils(parsed.register, 1);
          return { value: Boolean(result.data[0]), quality: 'good', timestamp: now };
        }
        case 'discrete': {
          const result = await this.client.readDiscreteInputs(parsed.register, 1);
          return { value: Boolean(result.data[0]), quality: 'good', timestamp: now };
        }
      }

      const value = registersToValue(registers, dt, byteOrder);
      return { value, quality: 'good', timestamp: now };

    } catch (err: any) {
      if (err.message?.includes('Port Not Open') || err.message?.includes('Timed out')) {
        this.connected = false;
        this.scheduleReconnect();
      }
      return { value: null, quality: 'bad', timestamp: now };
    }
  }

  // ─── Batch Read (optimized — groups consecutive registers) ───

  async readTags(addresses: string[], dataType?: string): Promise<Record<string, TagValue>> {
    const result: Record<string, TagValue> = {};

    if (!this.isConnected()) {
      const now = new Date();
      for (const addr of addresses) {
        result[addr] = { value: null, quality: 'bad', timestamp: now };
      }
      this.scheduleReconnect();
      return result;
    }

    // Group by register type for batch optimization
    const groups = new Map<RegisterType, { addr: string; parsed: ParsedAddress; dt: string }[]>();

    for (const addr of addresses) {
      const parsed = parseModbusAddress(addr);
      const group = groups.get(parsed.type) || [];
      group.push({ addr, parsed, dt: dataType || 'UINT16' });
      groups.set(parsed.type, group);
    }

    for (const [type, tags] of groups) {
      // Sort by register number for potential batch reads
      tags.sort((a, b) => a.parsed.register - b.parsed.register);

      // Try batch read for consecutive holding/input registers
      if ((type === 'holding' || type === 'input') && tags.length > 1) {
        const batchResult = await this.batchReadRegisters(type, tags);
        Object.assign(result, batchResult);
      } else {
        // Individual reads for non-consecutive or coil/discrete
        for (const tag of tags) {
          result[tag.addr] = await this.readTag(tag.addr, tag.dt);
        }
      }
    }

    return result;
  }

  // ─── Batch Register Read ─────────────────────────────

  private async batchReadRegisters(
    type: 'holding' | 'input',
    tags: { addr: string; parsed: ParsedAddress; dt: string }[]
  ): Promise<Record<string, TagValue>> {
    const result: Record<string, TagValue> = {};
    const now = new Date();

    // Group into contiguous ranges (max 125 registers per Modbus spec)
    const MAX_BATCH = 125;
    let batchStart = tags[0].parsed.register;
    let batchEnd = batchStart;
    let currentBatch: typeof tags = [tags[0]];

    const processBatch = async (batch: typeof tags, start: number, end: number) => {
      try {
        const count = end - start + 1;
        const readFn = type === 'holding'
          ? this.client.readHoldingRegisters.bind(this.client)
          : this.client.readInputRegisters.bind(this.client);

        const response = await readFn(start, count);
        const allData: number[] = response.data;

        for (const tag of batch) {
          const offset = tag.parsed.register - start;
          const dt = (tag.dt?.toUpperCase() || 'UINT16') as ModbusDataType;
          const regCount = getRegisterCount(dt);

          let byteOrder: ByteOrder = 'BE';
          if (tag.dt?.includes(':')) {
            byteOrder = tag.dt.split(':')[1].toUpperCase() as ByteOrder;
          }

          const regs = allData.slice(offset, offset + regCount);
          const value = registersToValue(regs, dt, byteOrder);
          result[tag.addr] = { value, quality: 'good', timestamp: now };
        }
      } catch (err: any) {
        // Fallback: read individually
        for (const tag of batch) {
          result[tag.addr] = await this.readTag(tag.addr, tag.dt);
        }
      }
    };

    for (let i = 1; i < tags.length; i++) {
      const tag = tags[i];
      const dt = (tag.dt?.toUpperCase() || 'UINT16') as ModbusDataType;
      const regCount = getRegisterCount(dt);

      // Check if tag is within batch range
      if (tag.parsed.register <= batchEnd + 5 && (tag.parsed.register + regCount - batchStart) <= MAX_BATCH) {
        batchEnd = Math.max(batchEnd, tag.parsed.register + regCount - 1);
        currentBatch.push(tag);
      } else {
        // Process previous batch
        await processBatch(currentBatch, batchStart, batchEnd);
        // Start new batch
        batchStart = tag.parsed.register;
        batchEnd = batchStart + regCount - 1;
        currentBatch = [tag];
      }
    }

    // Process last batch
    if (currentBatch.length > 0) {
      await processBatch(currentBatch, batchStart, batchEnd);
    }

    return result;
  }

  // ─── Write ───────────────────────────────────────────

  async writeTag(address: string, value: any, dataType?: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Modbus not connected');
    }

    try {
      const parsed = parseModbusAddress(address);
      const dt = (dataType?.toUpperCase() || 'UINT16') as ModbusDataType;

      let byteOrder: ByteOrder = 'BE';
      if (dataType?.includes(':')) {
        byteOrder = dataType.split(':')[1].toUpperCase() as ByteOrder;
      }

      switch (parsed.type) {
        case 'coil':
          await this.client.writeCoil(parsed.register, Boolean(value));
          break;
        case 'holding': {
          const regs = valueToRegisters(value, dt, byteOrder);
          if (regs.length === 1) {
            await this.client.writeRegister(parsed.register, regs[0]);
          } else {
            // FC16: Write Multiple Registers
            await this.client.writeRegisters(parsed.register, regs);
          }
          break;
        }
        default:
          throw new Error(`Cannot write to ${parsed.type} registers (read-only)`);
      }
    } catch (err: any) {
      console.error(`🔌 Modbus write error [${address}]:`, err.message);
      throw new Error(`Modbus write failed: ${err.message}`);
    }
  }

  // ─── Auto Reconnect ─────────────────────────────────

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.config) return;
    if (this.reconnectAttempts >= this.MAX_RECONNECT) {
      console.error('🔌 Modbus max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.RECONNECT_DELAY * Math.min(this.reconnectAttempts, 6);
    console.log(`🔌 Modbus reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT})...`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        if (this.client) {
          try { this.client.close(() => {}); } catch (_) {}
        }
        await this.connect(this.config!);
        console.log('🔌 Modbus reconnected successfully');
      } catch (err: any) {
        console.error(`🔌 Modbus reconnect failed: ${err.message}`);
      }
    }, delay);
  }
}

// Export types for external use
export { ModbusDataType, ByteOrder, RegisterType, ScaleConfig, applyScaling };
