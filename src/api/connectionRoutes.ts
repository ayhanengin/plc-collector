import { Router, Request, Response } from 'express';
import { connections } from '../config/configDb';
import { connectionManager } from '../core/ConnectionManager';
import { poller } from '../core/Poller';
import { DriverFactory } from '../drivers/DriverFactory';

const router = Router();

// GET / — List all connections with live status
router.get('/', (_req: Request, res: Response) => {
  try {
    const allConns = connections.getAll();
    const data = allConns.map((c) => ({
      ...c,
      connected: connectionManager.getStatus(c.id).connected,
    }));
    res.json({ data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /protocols — List supported protocols
router.get('/protocols', (_req: Request, res: Response) => {
  res.json({ data: DriverFactory.getSupportedProtocols() });
});

// GET /:id — Get single connection
router.get('/:id', (req: Request, res: Response) => {
  try {
    const conn = connections.getById(parseInt(req.params.id));
    if (!conn) return res.status(404).json({ success: false, message: 'Not found' });
    conn.connected = connectionManager.getStatus(conn.id).connected;
    res.json({ data: conn });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST / — Create new connection
router.post('/', (req: Request, res: Response) => {
  try {
    const conn = connections.create(req.body);
    console.log(`🔌 Connection "${conn.name}" created`);
    res.status(201).json({ data: conn });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /:id — Update connection
router.put('/:id', (req: Request, res: Response) => {
  try {
    const conn = connections.update(parseInt(req.params.id), req.body);
    if (!conn) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ data: conn });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /:id — Delete connection
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await connectionManager.disconnect(id);
    poller.stopPolling(id);
    connections.delete(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /:id/connect — Connect to PLC
router.post('/:id/connect', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await connectionManager.connect(id);
    await poller.startPolling(id);
    res.json({ success: true, message: 'Connected' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /:id/disconnect — Disconnect from PLC
router.post('/:id/disconnect', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    poller.stopPolling(id);
    await connectionManager.disconnect(id);
    res.json({ success: true, message: 'Disconnected' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /test — Test connection without saving
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { protocol, ip, port, rack, slot, unit_id } = req.body;
    const success = await connectionManager.testConnection(protocol, {
      ip, port, rack, slot, unitId: unit_id,
    });
    res.json({ success, message: success ? 'Bağlantı başarılı' : 'Bağlantı başarısız' });
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

export default router;
