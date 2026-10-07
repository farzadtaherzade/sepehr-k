import { NextRequest } from 'next/server';
import { query } from '@/server/db';
import { headcountSchema } from '@/server/validators';
import { csrfOk, ERR, jerr, zodFirstError } from '@/server/api-helpers';
import { guard } from '@/server/auth/guard';
import { writeAudit } from '@/server/audit';
import { clientIp } from '@/server/auth/rate-limit';
import { listHeadcount } from '@/server/queries';

export async function GET(req: NextRequest) {
  const g = await guard(req, 'viewer');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }
  const sp = req.nextUrl.searchParams;
  const pid = Number(sp.get('projectId'));
  const sid = Number(sp.get('snapshotId'));
  const rows = await listHeadcount(
    Number.isInteger(pid) && pid > 0 ? pid : undefined,
    Number.isInteger(sid) && sid > 0 ? sid : undefined
  );
  return Response.json({ headcount: rows });
}

/** POST /api/headcount — upsert one (snapshot, category) cell (editor+). */
export async function POST(req: NextRequest) {
  if (!csrfOk(req)) return jerr(403, 'درخواست نامعتبر است');
  const g = await guard(req, 'editor');
  if ('error' in g) {
    if (g.error === 'AUTH') return ERR.auth();
    if (g.error === 'PASSWORD_CHANGE') return ERR.passwordChange();
    return ERR.forbidden();
  }

  const body = await req.json().catch(() => null);
  const parsed = headcountSchema.safeParse(body);
  if (!parsed.success) return jerr(400, zodFirstError(parsed.error));
  const d = parsed.data;

  // Capture the previous value for the audit entry, then upsert the cell.
  const prev = await query<{ id: number; headcount: string }>(
    `SELECT id, headcount FROM snapshot_contractor_headcount
     WHERE snapshot_id = $1 AND contractor_category_id = $2`,
    [d.snapshot_id, d.contractor_category_id]
  );

  const rows = await query<{ id: number }>(
    `INSERT INTO snapshot_contractor_headcount (snapshot_id, contractor_category_id, headcount)
     VALUES ($1, $2, $3)
     ON CONFLICT (snapshot_id, contractor_category_id)
     DO UPDATE SET headcount = EXCLUDED.headcount
     RETURNING id`,
    [d.snapshot_id, d.contractor_category_id, d.headcount ?? 0]
  );

  await writeAudit({
    userId: g.user.uid, username: g.user.username, action: prev[0] ? 'UPDATE' : 'INSERT',
    tableName: 'snapshot_contractor_headcount', rowId: rows[0].id,
    oldData: prev[0] ? { headcount: prev[0].headcount } : null,
    newData: d, ip: clientIp(req),
  });
  return Response.json({ id: rows[0].id });
}
