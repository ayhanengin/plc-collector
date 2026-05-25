import { Server } from 'socket.io';
import { tagManager } from './TagManager';
import { dataLogger } from './DataLogger';
import { connectionManager } from './ConnectionManager';

class Poller {
  private timers: Map<number, NodeJS.Timeout> = new Map();
  private io: Server | null = null;
  private lastValues: Map<number, any> = new Map();

  setIO(io: Server) {
    this.io = io;
  }

  async startPolling(connectionId: number): Promise<void> {
    // Stop existing timer if any
    this.stopPolling(connectionId);

    const tags = await tagManager.getTagsByConnection(connectionId);
    if (tags.length === 0) {
      console.log(`📊 No tags for connection ${connectionId}, skipping poll`);
      return;
    }

    // Use the minimum polling interval from tags
    const interval = Math.min(...tags.map((t) => t.polling_interval_ms || 1000));

    const timer = setInterval(async () => {
      try {
        const status = connectionManager.getStatus(connectionId);
        if (!status.connected) return;

        const values = await tagManager.readTagsByConnection(connectionId);

        const tagsForConnection = await tagManager.getTagsByConnection(connectionId);
        const logEntries: { tagId: number; value: any; dataType: string; quality: string }[] = [];

        for (const tag of tagsForConnection) {
          const tagValue = values[tag.id];
          if (!tagValue) continue;

          // Emit real-time update
          if (this.io) {
            this.io.emit('tagUpdate', {
              tagId: tag.id,
              tagName: tag.name,
              connectionId,
              value: tagValue.value,
              quality: tagValue.quality,
              timestamp: tagValue.timestamp,
              unit: tag.unit,
              dataType: tag.data_type,
              groupName: tag.group_name,
            });
          }

          // Check if we should log this value
          if (tag.log_enabled) {
            const shouldLog = this.shouldLog(tag.id, tagValue.value, tag);
            if (shouldLog) {
              logEntries.push({
                tagId: tag.id,
                value: tagValue.value,
                dataType: tag.data_type,
                quality: tagValue.quality,
              });
              this.lastValues.set(tag.id, tagValue.value);
            }
          }
        }

        // Batch log
        if (logEntries.length > 0) {
          await dataLogger.logValues(logEntries);
        }
      } catch (err: any) {
        console.error(`📊 Polling error for connection ${connectionId}:`, err.message);
      }
    }, interval);

    this.timers.set(connectionId, timer);
    console.log(`📊 Polling started for connection ${connectionId} (every ${interval}ms, ${tags.length} tags)`);
  }

  stopPolling(connectionId: number): void {
    const timer = this.timers.get(connectionId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(connectionId);
      console.log(`📊 Polling stopped for connection ${connectionId}`);
    }
  }

  stopAll(): void {
    for (const [id] of this.timers) {
      this.stopPolling(id);
    }
  }

  private shouldLog(tagId: number, newValue: any, tag: any): boolean {
    if (tag.log_mode === 'polling') return true;

    const lastValue = this.lastValues.get(tagId);
    if (lastValue === undefined) return true;

    if (tag.log_mode === 'on_change') {
      return newValue !== lastValue;
    }

    if (tag.log_mode === 'deadband' && tag.deadband_value) {
      const diff = Math.abs(Number(newValue) - Number(lastValue));
      return diff >= tag.deadband_value;
    }

    return true;
  }
}

export const poller = new Poller();
