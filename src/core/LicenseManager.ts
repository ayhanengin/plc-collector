/**
 * License Manager
 * Controls feature access based on license tier.
 * 
 * Tiers:
 *   FREE       — 1 PLC, 50 tags, no data logging, no gateway
 *   PRO        — 10 PLC, 500 tags, all DB engines, gateway support
 *   ENTERPRISE — Unlimited everything
 */

import { settings, connections, tags } from '../config/configDb';
import crypto from 'crypto';

export type LicenseTier = 'FREE' | 'PRO' | 'ENTERPRISE';

export interface LicenseLimits {
  maxConnections: number;
  maxTags: number;
  maxTagsPerConnection: number;
  dataLogging: boolean;
  dbEngines: string[];
  gateway: boolean;
  apiAccess: boolean;
  exportCsv: boolean;
}

const TIER_LIMITS: Record<LicenseTier, LicenseLimits> = {
  FREE: {
    maxConnections: 1,
    maxTags: 50,
    maxTagsPerConnection: 50,
    dataLogging: false,
    dbEngines: ['none'],
    gateway: false,
    apiAccess: true,
    exportCsv: false,
  },
  PRO: {
    maxConnections: 10,
    maxTags: 500,
    maxTagsPerConnection: 200,
    dataLogging: true,
    dbEngines: ['none', 'sqlite', 'postgres', 'mssql', 'mysql'],
    gateway: true,
    apiAccess: true,
    exportCsv: true,
  },
  ENTERPRISE: {
    maxConnections: 9999,
    maxTags: 999999,
    maxTagsPerConnection: 999999,
    dataLogging: true,
    dbEngines: ['none', 'sqlite', 'postgres', 'mssql', 'oracle', 'mysql'],
    gateway: true,
    apiAccess: true,
    exportCsv: true,
  },
};

// ─── License Key Format ────────────────────────────────
// Simple format: TIER-XXXXXXXX-XXXXXXXX-CHECK
// In production, replace with proper JWT or RSA-signed keys
const LICENSE_SECRET = 'dms-plc-collector-2026';

function generateChecksum(tier: string, part1: string, part2: string): string {
  return crypto
    .createHmac('sha256', LICENSE_SECRET)
    .update(`${tier}-${part1}-${part2}`)
    .digest('hex')
    .substring(0, 8)
    .toUpperCase();
}

export function generateLicenseKey(tier: LicenseTier): string {
  const part1 = crypto.randomBytes(4).toString('hex').toUpperCase();
  const part2 = crypto.randomBytes(4).toString('hex').toUpperCase();
  const check = generateChecksum(tier, part1, part2);
  return `${tier}-${part1}-${part2}-${check}`;
}

export function validateLicenseKey(key: string): { valid: boolean; tier: LicenseTier | null } {
  if (!key || key.trim() === '') {
    return { valid: false, tier: null };
  }

  const parts = key.split('-');
  if (parts.length !== 4) {
    return { valid: false, tier: null };
  }

  const [tier, part1, part2, check] = parts;
  if (!['FREE', 'PRO', 'ENTERPRISE'].includes(tier)) {
    return { valid: false, tier: null };
  }

  const expectedCheck = generateChecksum(tier, part1, part2);
  if (check !== expectedCheck) {
    return { valid: false, tier: null };
  }

  return { valid: true, tier: tier as LicenseTier };
}

const LICENSE_SERVER = process.env.LICENSE_SERVER || 'https://www.dmotomasyon.com/plc-api';

// ─── License Manager ───────────────────────────────────

class LicenseManager {
  private _tier: LicenseTier = 'FREE';
  private _key: string | null = null;
  private _customer: string | null = null;
  private _company: string | null = null;
  private _online: boolean = false;

  /** Initialize from saved settings — tries online first, falls back to offline */
  init(): void {
    const savedKey = settings.get('license_key');
    if (savedKey) {
      const result = validateLicenseKey(savedKey);
      if (result.valid && result.tier) {
        this._tier = result.tier;
        this._key = savedKey;
        return;
      }
    }
    this._tier = 'FREE';
    this._key = null;
  }

  /** Online validation against dmotomasyon.com */
  async validateOnline(): Promise<void> {
    if (!this._key) return;

    try {
      const os = await import('os');
      const response = await fetch(`${LICENSE_SERVER}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: this._key,
          instanceId: settings.get('instance_id') || this._generateInstanceId(),
          hostname: os.hostname(),
          version: '2.0.0',
        }),
        signal: AbortSignal.timeout(5000),
      });

      const data = await response.json() as any;
      if (data.valid) {
        this._tier = data.tier;
        this._customer = data.customer;
        this._company = data.company;
        this._online = true;
        console.log(`🔑 Online doğrulama başarılı: ${data.tier} (${data.company || data.customer || ''})`);
      } else {
        console.warn(`🔑 Online doğrulama reddedildi: ${data.message}`);
        // Key was rejected by server — downgrade to FREE
        this._tier = 'FREE';
        this._key = null;
        settings.set('license_key', '');
        settings.set('license_tier', 'FREE');
      }
    } catch (err: any) {
      // Server unreachable — use offline validation (already done in init)
      console.warn(`🔑 Online doğrulama yapılamadı (offline mod): ${err.message}`);
      this._online = false;
    }
  }

  private _generateInstanceId(): string {
    const id = crypto.randomBytes(8).toString('hex');
    settings.set('instance_id', id);
    return id;
  }

  /** Activate a license key */
  activate(key: string): { success: boolean; tier: LicenseTier | null; message: string } {
    const result = validateLicenseKey(key);
    if (!result.valid || !result.tier) {
      return { success: false, tier: null, message: 'Geçersiz lisans anahtarı' };
    }

    this._tier = result.tier;
    this._key = key;
    settings.set('license_key', key);
    settings.set('license_tier', result.tier);

    return { success: true, tier: result.tier, message: `${result.tier} lisansı aktifleştirildi` };
  }

  /** Deactivate current license */
  deactivate(): void {
    this._tier = 'FREE';
    this._key = null;
    settings.set('license_key', '');
    settings.set('license_tier', 'FREE');
  }

  /** Current tier */
  get tier(): LicenseTier {
    return this._tier;
  }

  /** Current license key */
  get key(): string | null {
    return this._key;
  }

  /** Get limits for current tier */
  get limits(): LicenseLimits {
    return TIER_LIMITS[this._tier];
  }

  /** Get all tier info (for UI) */
  getAllTiers() {
    return [
      {
        id: 'FREE',
        name: 'Free',
        price: 'Ücretsiz',
        limits: TIER_LIMITS.FREE,
        features: [
          '1 PLC bağlantısı',
          '50 tag tanımı',
          'Gerçek zamanlı izleme',
          'WebSocket desteği',
        ],
        current: this._tier === 'FREE',
      },
      {
        id: 'PRO',
        name: 'Professional',
        price: 'İletişime geçin',
        limits: TIER_LIMITS.PRO,
        features: [
          '10 PLC bağlantısı',
          '500 tag tanımı',
          'Veri kayıt (SQLite, PostgreSQL, MSSQL, MySQL)',
          'SSH Gateway desteği',
          'CSV dışa aktarma',
          'Geçmiş veri sorgulama',
        ],
        current: this._tier === 'PRO',
      },
      {
        id: 'ENTERPRISE',
        name: 'Enterprise',
        price: 'İletişime geçin',
        limits: TIER_LIMITS.ENTERPRISE,
        features: [
          'Sınırsız PLC bağlantısı',
          'Sınırsız tag',
          'Tüm veritabanı motorları (Oracle dahil)',
          'SSH Gateway desteği',
          'CSV dışa aktarma',
          'Geçmiş veri sorgulama',
          'Öncelikli destek',
        ],
        current: this._tier === 'ENTERPRISE',
      },
    ];
  }

  // ─── Limit Checks ─────────────────────────────────────

  /** Check if a new connection can be created */
  canCreateConnection(): { allowed: boolean; message: string } {
    const current = connections.getAll().length;
    const max = this.limits.maxConnections;
    if (current >= max) {
      return {
        allowed: false,
        message: `${this._tier} lisansı en fazla ${max} PLC bağlantısına izin verir. Mevcut: ${current}. Yükseltme için PRO lisans alın.`,
      };
    }
    return { allowed: true, message: '' };
  }

  /** Check if new tags can be created */
  canCreateTags(count: number = 1): { allowed: boolean; message: string; remaining: number } {
    const current = tags.getAll().length;
    const max = this.limits.maxTags;
    const remaining = max - current;
    if (current + count > max) {
      return {
        allowed: false,
        remaining,
        message: `${this._tier} lisansı en fazla ${max} tag tanımına izin verir. Mevcut: ${current}, Eklenmek istenen: ${count}. Kalan: ${remaining}.`,
      };
    }
    return { allowed: true, remaining, message: '' };
  }

  /** Check if data logging is allowed */
  canUseDataLogging(): { allowed: boolean; message: string } {
    if (!this.limits.dataLogging) {
      return { allowed: false, message: 'Veri kayıt özelliği PRO lisans gerektirir.' };
    }
    return { allowed: true, message: '' };
  }

  /** Check if a specific DB engine is allowed */
  canUseDbEngine(engine: string): { allowed: boolean; message: string } {
    if (!this.limits.dbEngines.includes(engine)) {
      return { allowed: false, message: `${engine} veritabanı motoru ${this._tier} lisansında kullanılamaz.` };
    }
    return { allowed: true, message: '' };
  }

  /** Check if gateway feature is allowed */
  canUseGateway(): { allowed: boolean; message: string } {
    if (!this.limits.gateway) {
      return { allowed: false, message: 'SSH Gateway özelliği PRO lisans gerektirir.' };
    }
    return { allowed: true, message: '' };
  }

  /** Get current usage stats */
  getUsage() {
    const connCount = connections.getAll().length;
    const tagCount = tags.getAll().length;
    return {
      tier: this._tier,
      connections: { current: connCount, max: this.limits.maxConnections, percent: Math.round((connCount / this.limits.maxConnections) * 100) },
      tags: { current: tagCount, max: this.limits.maxTags, percent: Math.round((tagCount / this.limits.maxTags) * 100) },
      dataLogging: this.limits.dataLogging,
      gateway: this.limits.gateway,
    };
  }
}

export const licenseManager = new LicenseManager();
