import { IPlcDriver } from './IPlcDriver';
import { S7Driver } from './S7Driver';
import { ModbusDriver } from './ModbusDriver';

export class DriverFactory {
  static create(protocol: string): IPlcDriver {
    switch (protocol.toLowerCase()) {
      case 's7':
      case 'siemens':
        return new S7Driver();
      case 'modbus':
      case 'modbus-tcp':
        return new ModbusDriver();
      default:
        throw new Error(`Desteklenmeyen protokol: ${protocol}. Desteklenen: s7, modbus`);
    }
  }

  static getSupportedProtocols() {
    return [
      {
        id: 's7',
        name: 'Siemens S7 (S7-1200 / S7-1500 / S7-300 / S7-400)',
        defaultPort: 102,
        fields: ['rack', 'slot'],
        addressHelp: 'DB1,REAL0 | DB1,INT4 | DB1,X0.0 | DB1,DINT8',
      },
      {
        id: 'modbus',
        name: 'Modbus TCP',
        defaultPort: 502,
        fields: ['unitId'],
        addressHelp: '40001 (Holding) | 00001 (Coil) | 30001 (Input) | 10001 (Discrete)',
      },
    ];
  }
}
