import pool from '../config/database';

class DataLogger {
  async logValues(entries: { tagId: number; value: any; dataType: string; quality: string }[]): Promise<void> {
    if (entries.length === 0) return;

    const values: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    for (const entry of entries) {
      const { numeric, bool, text } = this.parseValue(entry.value, entry.dataType);
      values.push(`(NOW(), $${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4})`);
      params.push(entry.tagId, numeric, bool, text, entry.quality);
      paramIdx += 5;
    }

    const sql = `INSERT INTO tag_values (time, tag_id, value_numeric, value_bool, value_text, quality) VALUES ${values.join(',')}`;
    try {
      await pool.query(sql, params);
    } catch (err: any) {
      console.error('💾 DataLogger error:', err.message);
    }
  }

  async getHistory(tagId: number, startTime: string, endTime: string, limit: number = 1000): Promise<any[]> {
    const result = await pool.query(
      `SELECT time, tag_id, value_numeric, value_bool, value_text, quality
       FROM tag_values
       WHERE tag_id = $1 AND time >= $2 AND time <= $3
       ORDER BY time DESC
       LIMIT $4`,
      [tagId, startTime, endTime, limit]
    );
    return result.rows;
  }

  async getMultiHistory(tagIds: number[], startTime: string, endTime: string, limit: number = 1000): Promise<any[]> {
    const result = await pool.query(
      `SELECT time, tag_id, value_numeric, value_bool, value_text, quality
       FROM tag_values
       WHERE tag_id = ANY($1) AND time >= $2 AND time <= $3
       ORDER BY time DESC
       LIMIT $4`,
      [tagIds, startTime, endTime, limit]
    );
    return result.rows;
  }

  private parseValue(value: any, dataType: string): { numeric: number | null; bool: boolean | null; text: string | null } {
    const dt = dataType.toUpperCase();
    if (dt === 'BOOL' || dt === 'COIL' || dt === 'DISCRETE') {
      return { numeric: null, bool: Boolean(value), text: null };
    }
    if (['REAL', 'INT', 'DINT', 'WORD', 'DWORD', 'HOLDING', 'INPUT'].includes(dt)) {
      return { numeric: Number(value) || 0, bool: null, text: null };
    }
    return { numeric: null, bool: null, text: String(value) };
  }
}

export const dataLogger = new DataLogger();
