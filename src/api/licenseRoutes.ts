import { Router, Request, Response } from 'express';
import { licenseManager, generateLicenseKey, LicenseTier } from '../core/LicenseManager';

const router = Router();

// GET / — Current license info
router.get('/', (_req: Request, res: Response) => {
  try {
    const usage = licenseManager.getUsage();
    const key = licenseManager.key;
    res.json({
      data: {
        tier: licenseManager.tier,
        key: key ? `${key.substring(0, 12)}...` : null,
        limits: licenseManager.limits,
        usage,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /tiers — List all available tiers
router.get('/tiers', (_req: Request, res: Response) => {
  res.json({ data: licenseManager.getAllTiers() });
});

// POST /activate — Activate a license key
router.post('/activate', (req: Request, res: Response) => {
  try {
    const { key } = req.body;
    if (!key) {
      return res.status(400).json({ success: false, message: 'Lisans anahtarı gerekli' });
    }
    const result = licenseManager.activate(key);
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }
    res.json({
      success: true,
      message: result.message,
      tier: result.tier,
      limits: licenseManager.limits,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /deactivate — Deactivate current license
router.post('/deactivate', (_req: Request, res: Response) => {
  try {
    licenseManager.deactivate();
    res.json({ success: true, message: 'Lisans devre dışı bırakıldı. Free moda dönüldü.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /generate — Generate a license key (admin only, for internal use)
router.post('/generate', (req: Request, res: Response) => {
  try {
    const { tier, adminSecret } = req.body;
    // Simple admin protection — change this in production
    if (adminSecret !== 'dms-admin-2026') {
      return res.status(403).json({ success: false, message: 'Yetkisiz erişim' });
    }
    if (!['FREE', 'PRO', 'ENTERPRISE'].includes(tier)) {
      return res.status(400).json({ success: false, message: 'Geçersiz tier: FREE, PRO, ENTERPRISE' });
    }
    const key = generateLicenseKey(tier as LicenseTier);
    res.json({ success: true, key, tier });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
