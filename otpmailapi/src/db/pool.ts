import { Pool, type PoolConfig } from 'pg';
import { config } from '../config';

// ── Pool singleton ──────────────────────────────────────────────────────────

const poolConfig: PoolConfig = {
  connectionString: config.db.connectionString,
  min: config.db.poolMin,
  max: config.db.poolMax,
  // Prevent idle connections from holding open in serverless contexts
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
};

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(poolConfig);

    pool.on('error', (err) => {
      console.error('[db] Unexpected pool error:', err.message);
    });
  }
  return pool;
}

// ── Query helper — same convenience pattern as fakeintellect ────────────────

export async function query<T extends object = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends object = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

// ── Graceful shutdown ───────────────────────────────────────────────────────

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}