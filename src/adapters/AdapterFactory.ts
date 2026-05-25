/**
 * Adapter Factory
 * Creates the appropriate data adapter based on configuration.
 */

import { IDataAdapter } from './IDataAdapter';
import { NullAdapter } from './NullAdapter';
import { PostgresAdapter } from './PostgresAdapter';
import { SqliteDataAdapter } from './SqliteDataAdapter';
import { settings } from '../config/configDb';

export type DbEngine = 'none' | 'sqlite' | 'postgres' | 'mssql' | 'oracle' | 'mysql';

/**
 * Get the configured DB engine from settings or env
 */
export function getConfiguredEngine(): DbEngine {
  // Priority: DB settings > env > default none
  const fromSettings = settings.get('db_engine');
  if (fromSettings) return fromSettings as DbEngine;
  return (process.env.DB_ENGINE as DbEngine) || 'none';
}

/**
 * Create a data adapter for the given engine
 */
export function createAdapter(engine?: DbEngine, config?: any): IDataAdapter {
  const selectedEngine = engine || getConfiguredEngine();

  switch (selectedEngine) {
    case 'postgres':
      return new PostgresAdapter(config);

    case 'sqlite':
      return new SqliteDataAdapter(config?.path);

    case 'mssql':
      console.log('💾 MSSQL adapter — coming soon. Using NullAdapter.');
      return new NullAdapter();

    case 'oracle':
      console.log('💾 Oracle adapter — coming soon. Using NullAdapter.');
      return new NullAdapter();

    case 'mysql':
      console.log('💾 MySQL adapter — coming soon. Using NullAdapter.');
      return new NullAdapter();

    case 'none':
    default:
      return new NullAdapter();
  }
}

/** Singleton data adapter instance */
let _adapter: IDataAdapter | null = null;

export function getDataAdapter(): IDataAdapter {
  if (!_adapter) {
    _adapter = createAdapter();
  }
  return _adapter;
}

export async function initDataAdapter(): Promise<IDataAdapter> {
  _adapter = createAdapter();
  await _adapter.connect();
  await _adapter.runMigrations();
  return _adapter;
}

export function setDataAdapter(adapter: IDataAdapter): void {
  _adapter = adapter;
}

export const SUPPORTED_ENGINES = [
  { id: 'none', name: 'Yok — Sadece Canlı İzleme (Free)', description: 'Veri kaydedilmez, sadece gerçek zamanlı izleme' },
  { id: 'sqlite', name: 'SQLite (Gömülü Dosya)', description: 'Kurulum gerektirmez, tek dosyada saklanır' },
  { id: 'postgres', name: 'PostgreSQL', description: 'Endüstriyel seviye, TimescaleDB desteği' },
  { id: 'mssql', name: 'Microsoft SQL Server', description: 'Yakında — Windows ortamlar için' },
  { id: 'oracle', name: 'Oracle Database', description: 'Yakında — Kurumsal ortamlar için' },
  { id: 'mysql', name: 'MySQL / MariaDB', description: 'Yakında' },
];
