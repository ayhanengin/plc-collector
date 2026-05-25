import { Router, Request, Response } from 'express';
import { testConnection, testExternalConnection } from '../config/database';
import { runMigrations, isSetupComplete } from '../db/migrations';

const router = Router();

// GET /status — Check if setup is complete
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const dbConnected = await testConnection();
    const setupDone = dbConnected ? await isSetupComplete() : false;
    res.json({ data: { dbConnected, setupComplete: setupDone } });
  } catch (err: any) {
    res.json({ data: { dbConnected: false, setupComplete: false } });
  }
});

// POST /test-db — Test database connection
router.post('/test-db', async (req: Request, res: Response) => {
  try {
    const { host, port, user, password, database } = req.body;
    const success = await testExternalConnection({ host, port: parseInt(port), user, password, database });
    res.json({ success, message: success ? 'Veritabanı bağlantısı başarılı' : 'Bağlantı başarısız' });
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

// POST /init-db — Run database migrations
router.post('/init-db', async (_req: Request, res: Response) => {
  try {
    await runMigrations();
    res.json({ success: true, message: 'Tablolar başarıyla oluşturuldu' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
