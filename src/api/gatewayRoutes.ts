import { Router, Request, Response } from 'express';
import gatewayManager from '../core/GatewayManager';

const router = Router();

// GET /api/gateways — List all gateways
router.get('/', (_req: Request, res: Response) => {
  try {
    const gateways = gatewayManager.getAllGateways();
    const safe = gateways.map(g => ({ ...g, password: '••••••' }));
    res.json({ data: safe });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/gateways/tunnels — List active tunnels
router.get('/tunnels', (_req: Request, res: Response) => {
  res.json({ data: gatewayManager.getActiveTunnels() });
});

// POST /api/gateways — Create gateway
router.post('/', (req: Request, res: Response) => {
  try {
    const gw = gatewayManager.createGateway(req.body);
    res.json({ data: { ...gw, password: '••••••' } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/gateways/:id — Update gateway
router.put('/:id', (req: Request, res: Response) => {
  try {
    const gw = gatewayManager.updateGateway(parseInt(req.params.id), req.body);
    res.json({ data: { ...gw, password: '••••••' } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/gateways/:id — Delete gateway
router.delete('/:id', (req: Request, res: Response) => {
  try {
    gatewayManager.deleteGateway(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/gateways/test — Test gateway connection
router.post('/test', async (req: Request, res: Response) => {
  try {
    const ok = await gatewayManager.testGateway(req.body);
    res.json({ success: ok, message: ok ? 'Gateway bağlantısı başarılı' : 'Bağlantı kurulamadı' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
