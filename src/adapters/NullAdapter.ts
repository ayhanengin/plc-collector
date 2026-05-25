/**
 * Null Adapter — Free Mode
 * No data logging. Real-time monitoring only.
 * All write operations are no-ops. All reads return empty arrays.
 */

import { IDataAdapter, TagValueRecord, TagValueRow } from './IDataAdapter';

export class NullAdapter implements IDataAdapter {
  readonly engine = 'none';

  async connect(): Promise<void> {
    console.log('💾 Data logging: DISABLED (Free mode — real-time only)');
  }

  async disconnect(): Promise<void> {}

  async runMigrations(): Promise<void> {}

  async logValues(_entries: TagValueRecord[]): Promise<void> {
    // No-op: free mode does not log data
  }

  async getHistory(): Promise<TagValueRow[]> {
    return [];
  }

  async getMultiHistory(): Promise<TagValueRow[]> {
    return [];
  }
}
