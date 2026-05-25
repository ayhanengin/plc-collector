import { connectionManager } from './ConnectionManager';
import { tags as configTags } from '../config/configDb';
import { TagValue } from '../drivers/IPlcDriver';

export interface TagDefinition {
  id: number;
  connection_id: number;
  name: string;
  address: string;
  data_type: string;
  group_name: string | null;
  unit: string | null;
  description: string | null;
  min_value: number | null;
  max_value: number | null;
  polling_interval_ms: number;
  log_enabled: boolean;
  log_mode: string;
  deadband_value: number | null;
  // joined fields
  connection_name?: string;
  protocol?: string;
  ip?: string;
}

class TagManager {
  getAllTags(): TagDefinition[] {
    return configTags.getAll();
  }

  getTagsByConnection(connectionId: number): TagDefinition[] {
    return configTags.getByConnectionId(connectionId);
  }

  getTag(tagId: number): TagDefinition | null {
    return configTags.getById(tagId);
  }

  createTag(tag: Partial<TagDefinition>): TagDefinition {
    return configTags.create(tag);
  }

  updateTag(tagId: number, tag: Partial<TagDefinition>): TagDefinition {
    return configTags.update(tagId, tag);
  }

  deleteTag(tagId: number): void {
    configTags.delete(tagId);
  }

  async readTag(tagId: number): Promise<{ tag: TagDefinition; value: TagValue } | null> {
    const tag = this.getTag(tagId);
    if (!tag) return null;

    const driver = connectionManager.getDriver(tag.connection_id);
    if (!driver || !driver.isConnected()) {
      return { tag, value: { value: null, quality: 'bad', timestamp: new Date() } };
    }

    const value = await driver.readTag(tag.address, tag.data_type);
    return { tag, value };
  }

  async readTagsByConnection(connectionId: number): Promise<Record<number, TagValue>> {
    const tags = this.getTagsByConnection(connectionId);
    if (tags.length === 0) return {};

    const driver = connectionManager.getDriver(connectionId);
    if (!driver || !driver.isConnected()) {
      const result: Record<number, TagValue> = {};
      for (const tag of tags) {
        result[tag.id] = { value: null, quality: 'bad', timestamp: new Date() };
      }
      return result;
    }

    const addresses = tags.map((t) => t.address);
    const values = await driver.readTags(addresses, tags[0]?.data_type);

    const result: Record<number, TagValue> = {};
    for (const tag of tags) {
      result[tag.id] = values[tag.address] || { value: null, quality: 'uncertain', timestamp: new Date() };
    }
    return result;
  }

  getGroups(): string[] {
    return configTags.getGroups();
  }
}

export const tagManager = new TagManager();
