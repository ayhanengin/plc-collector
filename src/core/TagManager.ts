import pool from '../config/database';
import { connectionManager } from './ConnectionManager';
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
  async getAllTags(): Promise<TagDefinition[]> {
    const result = await pool.query(`
      SELECT t.*, c.name as connection_name, c.protocol, c.ip
      FROM tag_definitions t
      LEFT JOIN plc_connections c ON c.id = t.connection_id
      ORDER BY t.connection_id, t.group_name, t.name
    `);
    return result.rows;
  }

  async getTagsByConnection(connectionId: number): Promise<TagDefinition[]> {
    const result = await pool.query(
      `SELECT * FROM tag_definitions WHERE connection_id = $1 ORDER BY group_name, name`,
      [connectionId]
    );
    return result.rows;
  }

  async getTag(tagId: number): Promise<TagDefinition | null> {
    const result = await pool.query('SELECT * FROM tag_definitions WHERE id = $1', [tagId]);
    return result.rows[0] || null;
  }

  async createTag(tag: Partial<TagDefinition>): Promise<TagDefinition> {
    const result = await pool.query(
      `INSERT INTO tag_definitions (connection_id, name, address, data_type, group_name, unit, description, min_value, max_value, polling_interval_ms, log_enabled, log_mode, deadband_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [tag.connection_id, tag.name, tag.address, tag.data_type, tag.group_name, tag.unit, tag.description, tag.min_value, tag.max_value, tag.polling_interval_ms || 1000, tag.log_enabled || false, tag.log_mode || 'polling', tag.deadband_value]
    );
    return result.rows[0];
  }

  async updateTag(tagId: number, tag: Partial<TagDefinition>): Promise<TagDefinition> {
    const result = await pool.query(
      `UPDATE tag_definitions SET name=$1, address=$2, data_type=$3, group_name=$4, unit=$5, description=$6, min_value=$7, max_value=$8, polling_interval_ms=$9, log_enabled=$10, log_mode=$11, deadband_value=$12, updated_at=NOW() WHERE id=$13 RETURNING *`,
      [tag.name, tag.address, tag.data_type, tag.group_name, tag.unit, tag.description, tag.min_value, tag.max_value, tag.polling_interval_ms, tag.log_enabled, tag.log_mode, tag.deadband_value, tagId]
    );
    return result.rows[0];
  }

  async deleteTag(tagId: number): Promise<void> {
    await pool.query('DELETE FROM tag_definitions WHERE id = $1', [tagId]);
  }

  async readTag(tagId: number): Promise<{ tag: TagDefinition; value: TagValue } | null> {
    const tag = await this.getTag(tagId);
    if (!tag) return null;

    const driver = connectionManager.getDriver(tag.connection_id);
    if (!driver || !driver.isConnected()) {
      return { tag, value: { value: null, quality: 'bad', timestamp: new Date() } };
    }

    const value = await driver.readTag(tag.address, tag.data_type);
    return { tag, value };
  }

  async readTagsByConnection(connectionId: number): Promise<Record<number, TagValue>> {
    const tags = await this.getTagsByConnection(connectionId);
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
    // Pass first tag's data_type as hint (batch reads use same type for now)
    const values = await driver.readTags(addresses, tags[0]?.data_type);

    const result: Record<number, TagValue> = {};
    for (const tag of tags) {
      result[tag.id] = values[tag.address] || { value: null, quality: 'uncertain', timestamp: new Date() };
    }
    return result;
  }

  async getGroups(): Promise<string[]> {
    const result = await pool.query(
      `SELECT DISTINCT group_name FROM tag_definitions WHERE group_name IS NOT NULL ORDER BY group_name`
    );
    return result.rows.map((r) => r.group_name);
  }
}

export const tagManager = new TagManager();
