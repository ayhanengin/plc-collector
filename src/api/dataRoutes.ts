import { Router, Request, Response } from 'express';
import { dataLogger } from '../core/DataLogger';

const router = Router();

// GET /history/:tagId — Get tag value history
router.get('/history/:tagId', async (req: Request, res: Response) => {
  try {
    const tagId = parseInt(req.params.tagId);
    const start = (req.query.start as string) || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const end = (req.query.end as string) || new Date().toISOString();
    const limit = parseInt((req.query.limit as string) || '1000');
    const data = await dataLogger.getHistory(tagId, start, end, limit);
    res.json({ data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /history — Multi-tag history
router.get('/history', async (req: Request, res: Response) => {
  try {
    const tagIds = (req.query.tagIds as string || '').split(',').map(Number).filter(Boolean);
    const start = (req.query.start as string) || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const end = (req.query.end as string) || new Date().toISOString();
    const limit = parseInt((req.query.limit as string) || '1000');
    const data = await dataLogger.getMultiHistory(tagIds, start, end, limit);
    res.json({ data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
