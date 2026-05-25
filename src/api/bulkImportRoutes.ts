import { Router, Request, Response } from 'express';
import pool from '../config/database';
import { parseTiaPaste } from '../utils/tiaParser';

const router = Router();

/**
 * POST /api/tags/bulk
 * Bulk create tags from TIA Portal paste or array
 * 
 * Body option 1 (TIA paste):
 * {
 *   connection_id: number,
 *   db_number: number,        // Real PLC DB number (e.g. 18)
 *   tia_db_name: string,      // Optional TIA symbolic name (e.g. "DB208")
 *   paste_text: string,       // Raw paste from TIA Portal
 *   group_name: string,       // Optional group/DB label
 *   polling_interval_ms: number
 * }
 * 
 * Body option 2 (direct array):
 * {
 *   connection_id: number,
 *   tags: Array<{name, address, data_type, unit?, group_name?, description?, polling_interval_ms?}>
 * }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { connection_id, db_number, tia_db_name, paste_text, group_name, polling_interval_ms, tags: directTags } = req.body;

    if (!connection_id) {
      return res.status(400).json({ success: false, message: 'connection_id gerekli' });
    }

    let tagsToInsert: Array<{
      name: string;
      address: string;
      data_type: string;
      group_name: string;
      description: string;
      polling_interval_ms: number;
    }> = [];

    if (paste_text && db_number) {
      // Parse TIA paste
      const parsed = parseTiaPaste(paste_text, db_number);
      if (parsed.length === 0) {
        return res.status(400).json({ success: false, message: 'Tag bulunamadı. TIA Portal formatını kontrol edin.' });
      }

      const groupLabel = group_name || tia_db_name || `DB${db_number}`;
      
      tagsToInsert = parsed.map(t => ({
        name: t.name,
        address: t.address,
        data_type: t.dataType,
        group_name: groupLabel,
        description: t.description,
        polling_interval_ms: polling_interval_ms || 1000,
      }));
    } else if (directTags && Array.isArray(directTags)) {
      tagsToInsert = directTags.map((t: any) => ({
        name: t.name,
        address: t.address,
        data_type: t.data_type || 'REAL',
        group_name: t.group_name || '',
        description: t.description || '',
        polling_interval_ms: t.polling_interval_ms || 1000,
      }));
    } else {
      return res.status(400).json({ success: false, message: 'paste_text+db_number veya tags array gerekli' });
    }

    // Check for existing tags with same address on this connection
    const existingResult = await pool.query(
      'SELECT address FROM tag_definitions WHERE connection_id = $1',
      [connection_id]
    );
    const existingAddresses = new Set(existingResult.rows.map((r: any) => r.address));

    // Filter out duplicates
    const newTags = tagsToInsert.filter(t => !existingAddresses.has(t.address));
    const skipped = tagsToInsert.length - newTags.length;

    if (newTags.length === 0) {
      return res.json({ 
        success: true, 
        message: `Tüm tag\'ler zaten mevcut (${skipped} atlandı)`,
        created: 0,
        skipped 
      });
    }

    // Bulk insert
    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIdx = 1;

    for (const tag of newTags) {
      placeholders.push(`($${paramIdx},$${paramIdx+1},$${paramIdx+2},$${paramIdx+3},$${paramIdx+4},$${paramIdx+5},$${paramIdx+6},$${paramIdx+7},$${paramIdx+8})`);
      values.push(
        connection_id,
        tag.name,
        tag.address,
        tag.data_type,
        tag.group_name,
        null,  // unit
        tag.description,
        tag.polling_interval_ms,
        false  // log_enabled (default off for bulk)
      );
      paramIdx += 9;
    }

    const insertQuery = `
      INSERT INTO tag_definitions (connection_id, name, address, data_type, group_name, unit, description, polling_interval_ms, log_enabled)
      VALUES ${placeholders.join(', ')}
      RETURNING *
    `;

    const result = await pool.query(insertQuery, values);

    res.json({
      success: true,
      message: `${result.rows.length} tag oluşturuldu${skipped > 0 ? `, ${skipped} atlandı (zaten mevcut)` : ''}`,
      created: result.rows.length,
      skipped,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Bulk tag import error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/tags/bulk/preview
 * Preview parsed tags without creating them
 */
router.post('/preview', async (req: Request, res: Response) => {
  try {
    const { paste_text, db_number } = req.body;

    if (!paste_text || !db_number) {
      return res.status(400).json({ success: false, message: 'paste_text ve db_number gerekli' });
    }

    const parsed = parseTiaPaste(paste_text, db_number);
    
    res.json({
      success: true,
      count: parsed.length,
      tags: parsed,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
