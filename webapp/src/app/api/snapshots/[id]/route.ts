import { NextRequest } from 'next/server';
import { query } from '@/server/db';
import { snapshotUpdateSchema } from '@/server/validators';
import { csrfOk, dbErrorMessage, ERR, jerr, zodFirstError } from '@/server/api-helpers';
import { guard } from '@/server/auth/guard';
import { writeAudit } from '@/server/audit';
import { clientIp } from '@/server/auth/rate-limit';
import { getSnapshot } from '@/server/queries';

type Ctx = { params: Promise<{ id: string }> };

// Whitelisted writable columns (server-side sort/filter whitelist equivalent)
const WRITABLE = [
  'report_date', 'revision_no',
  'progress_physical_actual', 'progress_physical_planned', 'progress_rial_actual', 'progress_rial_planned',
  'time_elapsed_days', 'time_progress_pct',
  'gross_payment', 'net_payment', 'actual_cost', 'overhead_cost', 'equipment_cost', 'commitments', 'revenue', 'production',
  'pv', 'ev', 'spi', 'cpi',
  'last_progress_statement', 'last_adjustment_statement',
  'revenue_to_cost_ratio', 'overhead_to_production_ratio', 'equipment_to_production_ratio',
  'commitments_to_production_ratio', 'collection_rate', 'avg_monthly_headcount',
] as const;

/** PATCH /api/snapshots/[id] — inline/Excel-style cell edit (editor+). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!csrfOk(req)) return jerr(403, 'درخواست نامعتبر است');
  const g = await guard(req, 'editor');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }
  const { id } = await ctx.params;
  const sid = Number(id);
  if (!Number.isInteger(sid)) return ERR.badRequest('شناسه گزارش نامعتبر است');

  const body = await req.json().catch(() => null);
  const parsed = snapshotUpdateSchema.safeParse(body);
  if (!parsed.success) return jerr(400, zodFirstError(parsed.error));

  const oldRows = await query(`SELECT id, ${WRITABLE.join(', ')}, updated_at FROM project_snapshot WHERE id = $1`, [sid]);
  const old = oldRows[0];
  if (!old) return ERR.notFound('گزارش یافت نشد');

  // Optimistic locking: reject if another user changed the row meanwhile.
  if (parsed.data.updated_at && old.updated_at) {
    const clientTs = new Date(parsed.data.updated_at).getTime();
    const serverTs = new Date(old.updated_at).getTime();
    if (Number.isFinite(clientTs) && Math.abs(clientTs - serverTs) > 1500) {
      return jerr(409, 'این ردیف توسط کاربر دیگری تغییر کرده است. صفحه را نوسازی کنید');
    }
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  for (const col of WRITABLE) {
    if (parsed.data[col] !== undefined) {
      params.push(parsed.data[col]);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (!sets.length) return ERR.badRequest('تغییری ارسال نشده است');
  params.push(sid);

  // Re-compute EVM indices from the post-update values.
  const merged: Record<string, string | number | null> = { ...old };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (k in merged) (merged as Record<string, unknown>)[k] = v;
  }
  const ev = merged.ev != null ? Number(merged.ev) : null;
  const pv = merged.pv != null ? Number(merged.pv) : null;
  const ac = merged.actual_cost != null ? Number(merged.actual_cost) : null;
  const spi = parsed.data.spi !== undefined ? parsed.data.spi : ev != null && pv ? Math.round((ev / pv) * 10000) / 10000 : (merged.spi != null ? Number(merged.spi) : null);
  const cpi = parsed.data.cpi !== undefined ? parsed.data.cpi : ev != null && ac ? Math.round((ev / ac) * 10000) / 10000 : (merged.cpi != null ? Number(merged.cpi) : null);
  if (parsed.data.spi === undefined && parsed.data.pv !== undefined && parsed.data.ev !== undefined) { params.push(spi); sets.push(`spi = $${params.length}`); }
  if (parsed.data.cpi === undefined && parsed.data.actual_cost !== undefined && parsed.data.ev !== undefined) { params.push(cpi); sets.push(`cpi = $${params.length}`); }

  try {
    await query(`UPDATE project_snapshot SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  } catch (e) {
    const msg = dbErrorMessage(e);
    if (msg) return jerr(409, msg);
    return ERR.server(e);
  }

  await writeAudit({
    userId: g.user.uid, username: g.user.username, action: 'UPDATE',
    tableName: 'project_snapshot', rowId: sid,
    oldData: old, newData: parsed.data, ip: clientIp(req),
  });
  const fresh = await getSnapshot(sid);
  return Response.json({ snapshot: fresh });
}

/** DELETE /api/snapshots/[id] — editor+ (audit keeps the removed values). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  if (!csrfOk(req)) return jerr(403, 'درخواست نامعتبر است');
  const g = await guard(req, 'editor');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }
  const { id } = await ctx.params;
  const sid = Number(id);
  if (!Number.isInteger(sid)) return ERR.badRequest('شناسه گزارش نامعتبر است');

  const oldRows = await query(`SELECT id, project_id, report_date, revision_no FROM project_snapshot WHERE id = $1`, [sid]);
  if (!oldRows[0]) return ERR.notFound('گزارش یافت نشد');

  await query(`DELETE FROM project_snapshot WHERE id = $1`, [sid]);
  await writeAudit({
    userId: g.user.uid, username: g.user.username, action: 'DELETE',
    tableName: 'project_snapshot', rowId: sid, oldData: oldRows[0], ip: clientIp(req),
  });
  return Response.json({ ok: true });
}
