import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { adminPool } from './db';

let initialized = false;

/**
 * Runs once at server boot (instrumentation.ts):
 *  1. applies db/app-init.sql idempotently (app tables, evm_app role, grants)
 *  2. syncs the evm_app password with the environment
 *  3. bootstraps the first admin account if it does not exist yet
 */
export async function initDatabase(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const sqlPath = path.join(process.cwd(), 'db', 'app-init.sql');
  let sql = fs.readFileSync(sqlPath, 'utf8');
  const esc = (s: string) => s.replace(/'/g, "''");
  sql = sql
    .replaceAll('__EVM_APP_PASSWORD__', esc(process.env.EVM_APP_PASSWORD || ''))
    .replaceAll('__DB_NAME__', esc(process.env.PGDATABASE || 'evm_db'));

  const client = await adminPool.connect();
  try {
    await client.query(sql);

    // Bootstrap admin — only when the account does not exist yet, so a later
    // ADMIN_PASSWORD change in .env never overrides a user-chosen password.
    const username = (process.env.ADMIN_USERNAME || 'admin').trim();
    const password = process.env.ADMIN_PASSWORD || 'ChangeMe!2026';
    const hash = await bcrypt.hash(password, 12);
    const res = await client.query(
      `INSERT INTO app_user (username, password_hash, full_name, role, must_change_password)
       VALUES ($1, $2, $3, 'admin', TRUE)
       ON CONFLICT (username) DO NOTHING`,
      [username, hash, 'مدیر سامانه']
    );
    if ((res.rowCount ?? 0) > 0) {
      console.log(`[init-db] bootstrap admin "${username}" created (password change forced at first login)`);
    }
    console.log('[init-db] database ready');
  } finally {
    client.release();
  }
}
