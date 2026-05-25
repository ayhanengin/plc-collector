/**
 * Data Logger v2 — Uses IDataAdapter instead of direct pg pool
 */

import { getDataAdapter } from '../adapters/AdapterFactory';

class DataLogger {
  async logValues(entries: { tagId: number; value: any; dataType: string; quality: string }[]): Promise<void> {
    if (entries.length === 0) return;
    const adapter = getDataAdapter();
    await adapter.logValues(entries);
  }

  async getHistory(tagId: number, startTime: string, endTime: string, limit: number = 1000): Promise<any[]> {
    const adapter = getDataAdapter();
    return adapter.getHistory(tagId, startTime, endTime, limit);
  }

  async getMultiHistory(tagIds: number[], startTime: string, endTime: string, limit: number = 1000): Promise<any[]> {
    const adapter = getDataAdapter();
    return adapter.getMultiHistory(tagIds, startTime, endTime, limit);
  }
}

export const dataLogger = new DataLogger();
