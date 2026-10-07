import { Pool, PoolClient, types as pgTypes } from 'pg';

// DATE (OID 1082) must arrive as the plain 'YYYY-MM-DD' string the app works
// with — the default parser would shift it into a local-timezone Date.
pgTypes.setTypeParser(1082, (v) => v);

function config(user: string, password: string) {
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'evm_db',
    user,
    password,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
}

// Runtime pool — least-privilege `evm_app` role only.
export const pool = new Pool(
  config(
    process.env.EVM_APP_USER || process.env.PGUSER || 'evm_app',
    process.env.EVM_APP_PASSWORD || process.env.PGPASSWORD || ''
  )
);

// Owner pool — used ONLY by init-db at startup (create role/grants/admin).
export const adminPool = new Pool(
  config(
    process.env.PGADMIN_USER || 'postgres',
    process.env.PGADMIN_PASSWORD || ''
  )
);

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Run a write + audit entry in one transaction. */
export async function withAuditTx<T>(
  fn: (client: PoolClient) => Promise<T>,
  audit: (client: PoolClient) => Promise<void>
): Promise<T> {
  return withTx(async (client) => {
    const result = await fn(client);
    await audit(client);
    return result;
  });
}
