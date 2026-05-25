import { Router, Request, Response } from 'express';
import pool from '../config/database';
import { connectionManager } from '../core/ConnectionManager';
import { poller } from '../core/Poller';
import { DriverFactory } from '../drivers/DriverFactory';

const router = Router();

// GET / — List all connections with live status
router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM plc_connections ORDER BY created_at DESC');
    const connections = result.rows.map((c) => ({
      ...c,
      connected: connectionManager.getStatus(c.id).connected,
    }));
    res.json({ data: connections });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /protocols — List supported protocols
router.get('/protocols', (_req: Request, res: Response) => {
  res.json({ data: DriverFactory.getSupportedProtocols() });
});

// GET /:id — Get single connection
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM plc_connections WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
    const conn = result.rows[0];
    conn.connected = connectionManager.getStatus(conn.id).connected;
    res.json({ data: conn });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST / — Create new connection
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, protocol, ip, port, rack, slot, unit_id, auto_connect } = req.body;
    const result = await pool.query(
      `INSERT INTO plc_connections (name, protocol, ip, port, rack, slot, unit_id, auto_connect) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, protocol, ip, port, rack, slot, unit_id, auto_connect ?? true]
    );
    console.log(`🔌 Connection "${name}" created`);
    res.status(201).json({ data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /:id — Update connection
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, protocol, ip, port, rack, slot, unit_id, auto_connect } = req.body;
    const result = await pool.query(
      `UPDATE plc_connections SET name=$1, protocol=$2, ip=$3, port=$4, rack=$5, slot=$6, unit_id=$7, auto_connect=$8, updated_at=NOW() WHERE id=$9 RETURNING *`,
      [name, protocol, ip, port, rack, slot, unit_id, auto_connect, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ data: result.rows[0] });
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
    await pool.query('DELETE FROM plc_connections WHERE id = $1', [id]);
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
