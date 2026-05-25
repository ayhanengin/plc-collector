import { Router, Request, Response } from 'express';
import { tags } from '../config/configDb';
import { parseTiaPaste } from '../utils/tiaParser';
import { licenseManager } from '../core/LicenseManager';

const router = Router();

/**
 * POST /api/tags/bulk
 * Bulk create tags from TIA Portal paste or array
 */
router.post('/', (req: Request, res: Response) => {
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

    // License check
    const tagCheck = licenseManager.canCreateTags(tagsToInsert.length);
    if (!tagCheck.allowed) {
      return res.status(403).json({ success: false, message: tagCheck.message, upgrade: true, remaining: tagCheck.remaining });
    }

    // Use configDb bulk create (handles deduplication internally)
    const items = tagsToInsert.map(t => ({
      connection_id,
      name: t.name,
      address: t.address,
      data_type: t.data_type,
      group_name: t.group_name,
      unit: null,
      description: t.description,
      polling_interval_ms: t.polling_interval_ms,
    }));

    const result = tags.bulkCreate(items);

    res.json({
      success: true,
      message: `${result.created} tag oluşturuldu${result.skipped > 0 ? `, ${result.skipped} atlandı (zaten mevcut)` : ''}`,
      created: result.created,
      skipped: result.skipped,
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
router.post('/preview', (req: Request, res: Response) => {
  try {
    const { paste_text, db_number } = req.body;
    if (!paste_text || !db_number) {
      return res.status(400).json({ success: false, message: 'paste_text ve db_number gerekli' });
    }
    const parsed = parseTiaPaste(paste_text, db_number);
    res.json({ success: true, count: parsed.length, tags: parsed });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
