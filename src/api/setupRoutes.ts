import { Router, Request, Response } from 'express';
import { settings } from '../config/configDb';
import { createAdapter, SUPPORTED_ENGINES, setDataAdapter, getConfiguredEngine } from '../adapters/AdapterFactory';
import { IDataAdapter } from '../adapters/IDataAdapter';

const router = Router();

// GET /status — Check system status
router.get('/status', (_req: Request, res: Response) => {
  try {
    const dbEngine = getConfiguredEngine();
    const setupComplete = settings.get('setup_complete') === 'true';
    res.json({
      data: {
        setupComplete,
        dbEngine,
        configDb: 'sqlite',  // Always SQLite
        version: '2.0.0',
      },
    });
  } catch (err: any) {
    res.json({ data: { setupComplete: false, dbEngine: 'none', configDb: 'sqlite', version: '2.0.0' } });
  }
});

// GET /db-engines — List supported database engines
router.get('/db-engines', (_req: Request, res: Response) => {
  const current = getConfiguredEngine();
  res.json({
    data: SUPPORTED_ENGINES.map(e => ({ ...e, selected: e.id === current })),
  });
});

// POST /set-engine — Change data logging engine
router.post('/set-engine', async (req: Request, res: Response) => {
  try {
    const { engine, config } = req.body;
    if (!engine) {
      return res.status(400).json({ success: false, message: 'engine parametresi gerekli' });
    }

    // Test connection first if it's not 'none'
    if (engine !== 'none') {
      const testAdapter = createAdapter(engine, config);
      try {
        await testAdapter.connect();
        await testAdapter.runMigrations();
        await testAdapter.disconnect();
      } catch (err: any) {
        return res.status(400).json({ success: false, message: `Veritabanı bağlantısı başarısız: ${err.message}` });
      }
    }

    // Save settings
    settings.set('db_engine', engine);
    if (config) {
      settings.set('db_config', JSON.stringify(config));
    }

    // Re-initialize data adapter
    const adapter: IDataAdapter = createAdapter(engine, config);
    await adapter.connect();
    await adapter.runMigrations();
    setDataAdapter(adapter);

    res.json({ success: true, message: `Veri kaydı motoru "${engine}" olarak ayarlandı` });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /test-db — Test external database connection
router.post('/test-db', async (req: Request, res: Response) => {
  try {
    const { engine, config } = req.body;
    const adapter = createAdapter(engine, config);
    await adapter.connect();
    await adapter.disconnect();
    res.json({ success: true, message: 'Veritabanı bağlantısı başarılı' });
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

// POST /complete — Mark setup as complete
router.post('/complete', (_req: Request, res: Response) => {
  try {
    settings.set('setup_complete', 'true');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
