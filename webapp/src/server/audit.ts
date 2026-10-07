import { PoolClient } from 'pg';
import { query } from './db';

export interface AuditInput {
  userId?: number | null;
  username: string;
  action: string;
  tableName?: string | null;
  rowId?: string | number | null;
  oldData?: unknown;
  newData?: unknown;
  ip?: string | null;
}

/** Best-effort audit write inside the current transaction (or standalone). */
export async function writeAudit(
  input: AuditInput,
  client?: PoolClient
): Promise<void> {
  const sql = `INSERT INTO audit_log (user_id, username, action, table_name, row_id, old_data, new_data, ip)
               VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`;
  const params = [
    input.userId ?? null,
    input.username,
    input.action,
    input.tableName ?? null,
    input.rowId != null ? String(input.rowId) : null,
    input.oldData === undefined ? null : JSON.stringify(input.oldData ?? null),
    input.newData === undefined ? null : JSON.stringify(input.newData ?? null),
    input.ip ?? null,
  ];
  try {
    if (client) await client.query(sql, params);
    else await query(sql, params);
  } catch (e) {
    console.error('[audit] failed to record entry:', e instanceof Error ? e.message : e);
  }
}
