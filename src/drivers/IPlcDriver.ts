export interface ConnectionConfig {
  ip: string;
  port: number;
  rack?: number;
  slot?: number;
  unitId?: number;
  timeout?: number;
}

export interface TagValue {
  value: any;
  quality: 'good' | 'bad' | 'uncertain';
  timestamp: Date;
}

export interface IPlcDriver {
  readonly protocol: string;
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  readTag(address: string, dataType?: string): Promise<TagValue>;
  readTags(addresses: string[], dataType?: string): Promise<Record<string, TagValue>>;
  writeTag(address: string, value: any, dataType?: string): Promise<void>;
}
