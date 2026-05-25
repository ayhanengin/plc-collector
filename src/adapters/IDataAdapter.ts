/**
 * Data Adapter Interface
 * Defines the contract for historical tag value storage.
 * Each database engine implements this interface.
 */

export interface TagValueRecord {
  tagId: number;
  value: any;
  dataType: string;
  quality: string;
}

export interface TagValueRow {
  time: string;
  tag_id: number;
  value_numeric: number | null;
  value_bool: boolean | null;
  value_text: string | null;
  quality: string;
}

export interface TagStats {
  count: number;
  min: number | null;
  max: number | null;
  avg: number | null;
  first_time: string;
  last_time: string;
}

export interface IDataAdapter {
  readonly engine: string;

  /** Connect to the database */
  connect(): Promise<void>;

  /** Disconnect / cleanup */
  disconnect(): Promise<void>;

  /** Create required tables */
  runMigrations(): Promise<void>;

  /** Insert tag value records */
  logValues(entries: TagValueRecord[]): Promise<void>;

  /** Get history for a single tag */
  getHistory(tagId: number, startTime: string, endTime: string, limit?: number): Promise<TagValueRow[]>;

  /** Get history for multiple tags */
  getMultiHistory(tagIds: number[], startTime: string, endTime: string, limit?: number): Promise<TagValueRow[]>;
}

/** Parse a raw value into typed columns */
export function parseValue(value: any, dataType: string): { numeric: number | null; bool: boolean | null; text: string | null } {
  const dt = dataType.toUpperCase();
  if (dt === 'BOOL' || dt === 'COIL' || dt === 'DISCRETE') {
    return { numeric: null, bool: Boolean(value), text: null };
  }
  if (['REAL', 'INT', 'DINT', 'UINT', 'UDINT', 'WORD', 'DWORD', 'HOLDING', 'INPUT'].includes(dt)) {
    return { numeric: Number(value) || 0, bool: null, text: null };
  }
  return { numeric: null, bool: null, text: String(value) };
}
